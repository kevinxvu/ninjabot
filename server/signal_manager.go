package server

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/plot"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// WsNotifier pushes bot events to WebSocket
type WsNotifier struct {
	SessionID string
	wsManager *MarketWebsocketManager
}

func (n WsNotifier) Notify(msg string) {}

func (n WsNotifier) OnOrder(order model.Order) {
	// Gắn thêm sessionID vào order tạm thời trước khi broadcast
	order.SessionID = n.SessionID
	n.wsManager.broadcast(WSMessage{
		Type:      "ORDER",
		SessionID: n.SessionID,
		Pair:      order.Pair,
		Data:      order,
	})
}

func (n WsNotifier) OnError(err error) {
	n.wsManager.broadcast(WSMessage{
		Type:      "ERROR",
		SessionID: n.SessionID,
		Data:      err.Error(),
	})
}

type botInstance struct {
	Bot    *ninjabot.NinjaBot
	Cancel context.CancelFunc
	Chart  *plot.Chart
}

type SignalManager struct {
	mu        sync.Mutex
	bots      map[string]*botInstance
	db        storage.Storage
	exchange  *exchange.Binance
	wsManager *MarketWebsocketManager
}

func (m *SignalManager) recordSessionEvent(sessionID string, eventType model.SessionEventType) {
	err := m.db.CreateSessionEvent(&model.SessionEvent{
		SessionID: sessionID,
		Type:      eventType,
		CreatedAt: time.Now(),
	})
	if err != nil {
		log.Errorf("Failed to record session event %s for %s: %v", eventType, sessionID, err)
	}
}

func NewSignalManager(db storage.Storage, exc *exchange.Binance, ws *MarketWebsocketManager) *SignalManager {
	return &SignalManager{
		bots:      make(map[string]*botInstance),
		db:        db,
		exchange:  exc,
		wsManager: ws,
	}
}

type StartSignalRequest struct {
	Pair          string  `json:"pair"`
	Timeframe     string  `json:"timeframe"`
	Strategy      string  `json:"strategy"`
	InitialAsset  string  `json:"initial_asset"`
	InitialAmount float64 `json:"initial_amount"`
	FastPeriod    int     `json:"fast_period"`
	SlowPeriod    int     `json:"slow_period"`
}

func realtimeChartCandleLimit(currentStrategy strategy.Strategy) int {
	return currentStrategy.WarmupPeriod()
}

func timeframeDuration(timeframe string) (time.Duration, bool) {
	if len(timeframe) < 2 {
		return 0, false
	}

	value, err := strconv.Atoi(timeframe[:len(timeframe)-1])
	if err != nil || value <= 0 {
		return 0, false
	}

	switch timeframe[len(timeframe)-1:] {
	case "m":
		return time.Duration(value) * time.Minute, true
	case "h":
		return time.Duration(value) * time.Hour, true
	case "d":
		return time.Duration(value) * 24 * time.Hour, true
	case "w":
		return time.Duration(value) * 7 * 24 * time.Hour, true
	case "M":
		return time.Duration(value) * 30 * 24 * time.Hour, true
	}

	return 0, false
}

func realtimeChartStartTime(session *model.Session, currentStrategy strategy.Strategy) time.Time {
	duration, ok := timeframeDuration(session.Timeframe)
	if !ok {
		return session.CreatedAt
	}

	return session.CreatedAt.Add(-duration * time.Duration(currentStrategy.WarmupPeriod()))
}

func realtimeChartEndTime(session *model.Session, now time.Time) time.Time {
	end := now
	if end.Before(session.CreatedAt) {
		end = session.CreatedAt
	}

	for _, order := range session.Orders {
		orderTime := order.UpdatedAt
		if orderTime.IsZero() {
			orderTime = order.CreatedAt
		}
		if orderTime.After(end) {
			end = orderTime
		}
	}

	if duration, ok := timeframeDuration(session.Timeframe); ok {
		end = end.Add(duration)
	}

	return end
}

func sessionEventsForDisplay(session *model.Session) []model.SessionEvent {
	events := append([]model.SessionEvent(nil), session.Events...)
	hasStart := false
	hasStop := false

	for _, event := range events {
		switch event.Type {
		case model.SessionEventTypeStart:
			hasStart = true
		case model.SessionEventTypeStop:
			hasStop = true
		}
	}

	if !hasStart && !session.CreatedAt.IsZero() {
		events = append(events, model.SessionEvent{
			SessionID: session.ID,
			Type:      model.SessionEventTypeStart,
			CreatedAt: session.CreatedAt,
		})
	}

	if !hasStop && session.Status != "running" && !session.UpdatedAt.IsZero() && session.UpdatedAt.After(session.CreatedAt) {
		events = append(events, model.SessionEvent{
			SessionID: session.ID,
			Type:      model.SessionEventTypeStop,
			CreatedAt: session.UpdatedAt,
		})
	}

	sort.Slice(events, func(i, j int) bool {
		return events[i].CreatedAt.Before(events[j].CreatedAt)
	})

	return events
}

func (m *SignalManager) fetchSessionChartCandles(ctx context.Context, session *model.Session, currentStrategy strategy.Strategy, end time.Time) ([]model.Candle, error) {
	start := realtimeChartStartTime(session, currentStrategy)
	duration, ok := timeframeDuration(session.Timeframe)
	if !ok {
		return m.exchange.CandlesByPeriod(ctx, session.Pair, session.Timeframe, start, end)
	}

	const maxCandlesPerRequest = 1000
	window := duration * time.Duration(maxCandlesPerRequest-1)
	candles := make([]model.Candle, 0)
	seen := make(map[time.Time]bool)

	for cursor := start; cursor.Before(end); {
		chunkEnd := cursor.Add(window)
		if chunkEnd.After(end) {
			chunkEnd = end
		}

		chunk, err := m.exchange.CandlesByPeriod(ctx, session.Pair, session.Timeframe, cursor, chunkEnd)
		if err != nil {
			return nil, err
		}

		for _, candle := range chunk {
			if seen[candle.Time] {
				continue
			}
			seen[candle.Time] = true
			candles = append(candles, candle)
		}

		if !chunkEnd.After(cursor) {
			break
		}
		cursor = chunkEnd.Add(time.Millisecond)
	}

	return candles, nil
}

func (m *SignalManager) hydrateRecentChartCandles(ctx context.Context, chart *plot.Chart, pair, timeframe string, currentStrategy strategy.Strategy) {
	limit := realtimeChartCandleLimit(currentStrategy)
	candles, err := m.exchange.CandlesByLimit(ctx, pair, timeframe, limit)
	if err != nil {
		log.Errorf("Failed to fetch recent candles for chart: %v", err)
		return
	}

	for _, c := range candles {
		chart.OnCandle(c)
	}
}

// CalculateBalancesFromOrders calculates the actual wallet balances based on the session's initial asset/amount and its order history.
func CalculateBalancesFromOrders(session *model.Session) map[string]float64 {
	balancesMap := make(map[string]float64)
	balancesMap[session.InitialAsset] = session.InitialAmount

	for _, order := range session.Orders {
		if order.Status == model.OrderStatusTypeFilled {
			baseAsset, quoteAsset := exchange.SplitAssetQuote(order.Pair)
			orderValue := order.Price * order.Quantity

			if order.Side == model.SideTypeBuy {
				// Mua: nhận baseAsset (VD: BTC), trả quoteAsset (VD: USDT)
				balancesMap[baseAsset] += order.Quantity
				balancesMap[quoteAsset] -= orderValue
			} else if order.Side == model.SideTypeSell {
				// Bán: nhận quoteAsset, trả baseAsset
				balancesMap[quoteAsset] += orderValue
				balancesMap[baseAsset] -= order.Quantity
			}
		}
	}
	return balancesMap
}

func (m *SignalManager) startBotFromSession(ctx context.Context, session *model.Session, req StartSignalRequest) error {
	// Reconstruct portfolio balances from order history
	assets := CalculateBalancesFromOrders(session)

	// Tạo mảng option cho PaperWallet
	options := []exchange.PaperWalletOption{
		exchange.WithDataFeed(m.exchange),
	}

	// Add WithPaperAsset for each asset that has a balance
	for asset, amount := range assets {
		if amount > 0.00000001 { // ignore tiny dust
			options = append(options, exchange.WithPaperAsset(asset, amount))
		}
	}

	// Cấu hình PaperWallet
	paperWallet := exchange.NewPaperWallet(
		ctx,
		"USDT",
		options...,
	)

	// Lấy config Bot
	settings := ninjabot.Settings{
		Pairs: []string{req.Pair},
	}

	// Chọn Strategy
	var currentStrategy strategy.Strategy
	switch req.Strategy {
	case "emacross":
		currentStrategy = strategies.NewCrossEMA(req.Timeframe, req.FastPeriod, req.SlowPeriod)
	default:
		currentStrategy = strategies.NewCrossEMA(req.Timeframe, req.FastPeriod, req.SlowPeriod)
	}

	// Inject Notifier WebSockets
	notifier := WsNotifier{
		SessionID: session.ID,
		wsManager: m.wsManager,
	}

	storageWrapper := &SessionStorageWrapper{
		Storage:   m.db,
		SessionID: session.ID,
	}

	// Cấu hình ninjabot bot
	bot, err := ninjabot.NewBot(
		ctx,
		settings,
		paperWallet,
		currentStrategy,
		ninjabot.WithStorage(storageWrapper),
		ninjabot.WithPaperWallet(paperWallet),
	)
	if err != nil {
		return fmt.Errorf("failed to init bot: %w", err)
	}

	// manually apply notifier AFTER bot initializes its orderController
	ninjabot.WithNotifier(notifier)(bot)

	// Create a background context that OUTLIVES the HTTP request
	botCtx, cancel := context.WithCancel(context.Background())

	// Khởi tạo Chart và hydrate dữ liệu cũ
	chart, err := plot.NewChart(
		plot.WithStrategyIndicators(currentStrategy),
		plot.WithPaperWallet(paperWallet),
	)
	if err != nil {
		return fmt.Errorf("failed to create chart: %w", err)
	}

	candles, err := m.fetchSessionChartCandles(ctx, session, currentStrategy, realtimeChartEndTime(session, time.Now()))
	if err != nil {
		log.Errorf("Failed to fetch session candles for chart: %v", err)
		m.hydrateRecentChartCandles(ctx, chart, req.Pair, req.Timeframe, currentStrategy)
	} else {
		for _, c := range candles {
			chart.OnCandle(c)
		}
	}

	for _, order := range session.Orders {
		chart.OnOrder(order)
	}

	ninjabot.WithCandleSubscription(chart)(bot)
	ninjabot.WithOrderSubscription(chart)(bot)

	m.bots[session.ID] = &botInstance{
		Bot:    bot,
		Cancel: cancel,
		Chart:  chart,
	}

	go func() {
		log.Infof("Starting realtime signal session %s for pair %s", session.ID, req.Pair)
		err := bot.Run(botCtx)
		if err != nil && err != context.Canceled {
			log.Errorf("Bot session %s error: %v", session.ID, err)
		}

		// Khi stop, update db
		m.mu.Lock()
		delete(m.bots, session.ID)
		m.mu.Unlock()

		s, _ := m.db.GetSessionByID(session.ID)
		if s != nil && s.Status != "error" {
			s.Status = "stopped"
			s.UpdatedAt = time.Now()
			m.db.UpdateSession(s)
		}
	}()

	return nil
}

func (m *SignalManager) StartSession(ctx context.Context, req StartSignalRequest) (*model.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	sessionID := uuid.New().String()

	session := &model.Session{
		ID:            sessionID,
		Type:          "REALTIME_SIGNAL",
		Status:        "running",
		Pair:          req.Pair,
		Strategy:      req.Strategy,
		Timeframe:     req.Timeframe,
		InitialAsset:  req.InitialAsset,
		InitialAmount: req.InitialAmount,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	err := m.db.CreateSession(session)
	if err != nil {
		return nil, fmt.Errorf("failed to create session in db: %w", err)
	}
	m.recordSessionEvent(session.ID, model.SessionEventTypeStart)

	err = m.startBotFromSession(ctx, session, req)
	if err != nil {
		session.Status = "error"
		m.db.UpdateSession(session)
		return nil, err
	}

	return session, nil
}

func (m *SignalManager) ResumeSession(ctx context.Context, sessionID string) (*model.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, err := m.db.GetSessionByID(sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}

	if session.Status == "running" {
		if _, exists := m.bots[sessionID]; exists {
			return session, nil
		}
	}

	req := StartSignalRequest{
		Pair:          session.Pair,
		Timeframe:     session.Timeframe,
		Strategy:      session.Strategy,
		InitialAsset:  session.InitialAsset,
		InitialAmount: session.InitialAmount,
	}

	session.Status = "running"
	session.UpdatedAt = time.Now()
	m.db.UpdateSession(session)
	m.recordSessionEvent(session.ID, model.SessionEventTypeResume)

	err = m.startBotFromSession(ctx, session, req)
	if err != nil {
		session.Status = "error"
		m.db.UpdateSession(session)
		return nil, err
	}

	return session, nil
}

func (m *SignalManager) StopSession(sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	instance, exists := m.bots[sessionID]
	if !exists {
		// Update DB in case it's marked running but not in memory
		s, err := m.db.GetSessionByID(sessionID)
		if err == nil && s.Status == "running" {
			s.Status = "stopped"
			s.UpdatedAt = time.Now()
			m.db.UpdateSession(s)
			m.recordSessionEvent(sessionID, model.SessionEventTypeStop)
		}
		return nil
	}

	instance.Cancel()
	delete(m.bots, sessionID)
	m.recordSessionEvent(sessionID, model.SessionEventTypeStop)
	return nil
}

func (m *SignalManager) GetSessionBalances(sessionID string) ([]model.Balance, error) {
	m.mu.Lock()
	instance, exists := m.bots[sessionID]
	m.mu.Unlock()

	if !exists {
		return nil, fmt.Errorf("session not running in memory")
	}

	// Fetch current account state from the running bot's controller
	acc, err := instance.Bot.Controller().Account()
	if err != nil {
		return nil, err
	}
	return acc.Balances, nil
}

func (m *SignalManager) GetSessionChart(ctx context.Context, sessionID string) (*plot.Chart, error) {
	m.mu.Lock()
	instance, exists := m.bots[sessionID]
	m.mu.Unlock()

	// Nếu bot đang chạy, trả về chart trên memory luôn
	if exists && instance.Chart != nil {
		session, err := m.db.GetSessionByID(sessionID)
		if err == nil && len(instance.Chart.CandlesByPair(session.Pair)) == 0 {
			var currentStrategy strategy.Strategy
			switch session.Strategy {
			case "emacross":
				currentStrategy = strategies.NewCrossEMA(session.Timeframe, 8, 21)
			default:
				currentStrategy = strategies.NewCrossEMA(session.Timeframe, 8, 21)
			}
			m.hydrateRecentChartCandles(ctx, instance.Chart, session.Pair, session.Timeframe, currentStrategy)
		}
		return instance.Chart, nil
	}

	// Nếu bot đã stop, ta lấy dữ liệu từ DB và tự build lại chart
	session, err := m.db.GetSessionByID(sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}

	var currentStrategy strategy.Strategy
	switch session.Strategy {
	case "emacross":
		// NOTE: if session model doesn't store strategy params, we use default or fallback
		// Ideally we should store FastPeriod and SlowPeriod in Session struct or as a JSON field
		currentStrategy = strategies.NewCrossEMA(session.Timeframe, 8, 21)
	default:
		currentStrategy = strategies.NewCrossEMA(session.Timeframe, 8, 21)
	}

	chart, _ := plot.NewChart(plot.WithStrategyIndicators(currentStrategy))

	end := realtimeChartEndTime(session, time.Now())
	candles, err := m.fetchSessionChartCandles(ctx, session, currentStrategy, end)
	if err == nil && len(candles) > 0 {
		for _, c := range candles {
			chart.OnCandle(c)
		}
	} else if err == nil {
		m.hydrateRecentChartCandles(ctx, chart, session.Pair, session.Timeframe, currentStrategy)
	} else {
		log.Errorf("Failed to fetch session candles for chart: %v", err)
	}

	for _, o := range session.Orders {
		chart.OnOrder(o)
	}

	return chart, nil
}

// SessionStorageWrapper bọc Storage gốc, tự động inject SessionID vào Order
type SessionStorageWrapper struct {
	storage.Storage
	SessionID string
}

func (s *SessionStorageWrapper) CreateOrder(order *model.Order) error {
	order.SessionID = s.SessionID
	return s.Storage.CreateOrder(order)
}

func (s *SessionStorageWrapper) UpdateOrder(order *model.Order) error {
	order.SessionID = s.SessionID
	return s.Storage.UpdateOrder(order)
}
