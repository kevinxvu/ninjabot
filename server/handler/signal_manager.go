package handler

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
	exbinance "github.com/rodrigo-brito/ninjabot/exchange/binance"
	expaperwallet "github.com/rodrigo-brito/ninjabot/exchange/paperwallet"
	"github.com/rodrigo-brito/ninjabot/internal/registry"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/plot"
	serverws "github.com/rodrigo-brito/ninjabot/server/ws"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/rodrigo-brito/ninjabot/strategy"
	_ "github.com/rodrigo-brito/ninjabot/strategy/strategies" // registers built-in strategies
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// WsNotifier pushes bot events to WebSocket.
type WsNotifier struct {
	SessionID string
	wsManager *serverws.MarketWebsocketManager
}

func (n WsNotifier) Notify(msg string) {}

func (n WsNotifier) OnOrder(order model.Order) {
	order.SessionID = n.SessionID
	n.wsManager.Broadcast(serverws.WSMessage{
		Type:      "ORDER",
		SessionID: n.SessionID,
		Pair:      order.Pair,
		Data:      order,
	})
}

func (n WsNotifier) OnError(err error) {
	n.wsManager.Broadcast(serverws.WSMessage{
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

// SignalManager manages realtime signal (live trading) sessions.
type SignalManager struct {
	mu        sync.Mutex
	bots      map[string]*botInstance
	db        storage.Storage
	exchange  *exbinance.Binance
	wsManager *serverws.MarketWebsocketManager
}

// NewSignalManager creates a new SignalManager.
func NewSignalManager(db storage.Storage, exc *exbinance.Binance, ws *serverws.MarketWebsocketManager) *SignalManager {
	m := &SignalManager{
		bots:      make(map[string]*botInstance),
		db:        db,
		exchange:  exc,
		wsManager: ws,
	}
	m.RecoverStaleSessions()
	return m
}

// RecoverStaleSessions marks any sessions that were left as "running" in the DB
// (e.g. after a process crash) as "stopped" and records a STOP event for them.
func (m *SignalManager) RecoverStaleSessions() {
	sessions, err := m.db.GetSessionsByType("REALTIME_SIGNAL")
	if err != nil {
		log.Errorf("RecoverStaleSessions: failed to list sessions: %v", err)
		return
	}
	for _, s := range sessions {
		if s.Status != "running" {
			continue
		}
		now := time.Now()
		s.Status = "stopped"
		s.UpdatedAt = now
		if err := m.db.UpdateSession(s); err != nil {
			log.Errorf("RecoverStaleSessions: failed to update session %s: %v", s.ID, err)
			continue
		}
		events, err := m.db.GetSessionEvents(s.ID)
		if err != nil {
			log.Errorf("RecoverStaleSessions: failed to get events for session %s: %v", s.ID, err)
			continue
		}
		hasStop := false
		for _, e := range events {
			if e.Type == model.SessionEventTypeStop {
				hasStop = true
				break
			}
		}
		if !hasStop {
			if err := m.db.CreateSessionEvent(&model.SessionEvent{
				SessionID: s.ID,
				Type:      model.SessionEventTypeStop,
				CreatedAt: now,
			}); err != nil {
				log.Errorf("RecoverStaleSessions: failed to create STOP event for session %s: %v", s.ID, err)
			}
		}
		log.Infof("RecoverStaleSessions: marked session %s as stopped (was left running)", s.ID)
	}
}

// StartSignalRequest holds parameters for starting a realtime signal session.
type StartSignalRequest struct {
	Pair          string  `json:"pair"`
	Timeframe     string  `json:"timeframe"`
	Strategy      string  `json:"strategy"`
	InitialAsset  string  `json:"initial_asset"`
	InitialAmount float64 `json:"initial_amount"`
	FastPeriod    int     `json:"fast_period"`
	SlowPeriod    int     `json:"slow_period"`
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

		// Advance cursor based on the last received candle to avoid gaps when
		// Binance returns fewer candles than the window (e.g. due to rate limits).
		// If the chunk was complete, last candle time ≈ chunkEnd, so we advance
		// to roughly chunkEnd + duration. If truncated, we continue from where
		// Binance stopped instead of skipping the missing range.
		if len(chunk) > 0 {
			lastCandleNext := chunk[len(chunk)-1].Time.Add(duration)
			windowNext := chunkEnd.Add(time.Millisecond)
			if lastCandleNext.Before(windowNext) {
				cursor = lastCandleNext
			} else {
				cursor = windowNext
			}
		} else {
			cursor = chunkEnd.Add(time.Millisecond)
		}
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

// CalculateBalancesFromOrders calculates the actual wallet balances based on
// the session's initial asset/amount and its order history.
func CalculateBalancesFromOrders(session *model.Session) map[string]float64 {
	balancesMap := make(map[string]float64)
	balancesMap[session.InitialAsset] = session.InitialAmount

	for _, order := range session.Orders {
		if order.Status == model.OrderStatusTypeFilled {
			baseAsset, quoteAsset := exchange.SplitAssetQuote(order.Pair)
			orderValue := order.Price * order.Quantity

			if order.Side == model.SideTypeBuy {
				balancesMap[baseAsset] += order.Quantity
				balancesMap[quoteAsset] -= orderValue
			} else if order.Side == model.SideTypeSell {
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

	options := []expaperwallet.PaperWalletOption{
		expaperwallet.WithDataFeed(m.exchange),
	}

	for asset, amount := range assets {
		if amount > 0.00000001 {
			options = append(options, expaperwallet.WithPaperAsset(asset, amount))
		}
	}

	paperWallet := expaperwallet.NewPaperWallet(
		ctx,
		"USDT",
		options...,
	)

	settings := ninjabot.Settings{
		Pairs: []string{req.Pair},
	}

	currentStrategy, err := registry.Build(req.Strategy, registry.StrategyConfig{
		Timeframe:  req.Timeframe,
		FastPeriod: req.FastPeriod,
		SlowPeriod: req.SlowPeriod,
	})
	if err != nil {
		log.Warnf("unknown strategy %q, falling back to emacross: %v", req.Strategy, err)
		currentStrategy, _ = registry.Build("emacross", registry.StrategyConfig{
			Timeframe:  req.Timeframe,
			FastPeriod: req.FastPeriod,
			SlowPeriod: req.SlowPeriod,
		})
	}

	notifier := WsNotifier{
		SessionID: session.ID,
		wsManager: m.wsManager,
	}

	storageWrapper := &SessionStorageWrapper{
		Storage:   m.db,
		SessionID: session.ID,
	}

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

	ninjabot.WithNotifier(notifier)(bot)

	botCtx, cancel := context.WithCancel(context.Background())

	chart, err := plot.NewChart(
		plot.WithStrategyIndicators(currentStrategy),
		plot.WithPaperWallet(paperWallet),
	)
	if err != nil {
		cancel()
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

	acc, err := instance.Bot.Controller().Account()
	if err != nil {
		return nil, err
	}
	return acc.Balances, nil
}

func (m *SignalManager) GetSessionChart(ctx context.Context, sessionID string) (*plot.Chart, error) {
	session, err := m.db.GetSessionByID(sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}

	currentStrategy := buildSessionStrategy(session.Strategy, session.Timeframe)

	m.mu.Lock()
	instance, exists := m.bots[sessionID]
	m.mu.Unlock()

	// Build chart options. Carry over the paper wallet from the running instance
	// so equity/asset values remain accurate even after a fresh candle rebuild.
	opts := []plot.Option{plot.WithStrategyIndicators(currentStrategy)}
	if exists && instance.Chart != nil {
		if pw := instance.Chart.PaperWallet(); pw != nil {
			opts = append(opts, plot.WithPaperWallet(pw))
		}
	}

	chart, err := plot.NewChart(opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create chart: %w", err)
	}

	// Always fetch candles fresh from the exchange so any gaps caused by missed
	// WebSocket candle events (e.g. while the user had the app closed) are filled.
	end := realtimeChartEndTime(session, time.Now())
	candles, fetchErr := m.fetchSessionChartCandles(ctx, session, currentStrategy, end)
	if fetchErr == nil && len(candles) > 0 {
		for _, c := range candles {
			chart.OnCandle(c)
		}
	} else {
		// Fetch failed – fall back to the in-memory chart if the bot is running.
		if exists && instance.Chart != nil {
			if len(instance.Chart.CandlesByPair(session.Pair)) == 0 {
				m.hydrateRecentChartCandles(ctx, instance.Chart, session.Pair, session.Timeframe, currentStrategy)
			}
			return instance.Chart, nil
		}
		if fetchErr != nil {
			log.Errorf("Failed to fetch session candles for chart: %v", fetchErr)
		}
		m.hydrateRecentChartCandles(ctx, chart, session.Pair, session.Timeframe, currentStrategy)
	}

	for _, o := range session.Orders {
		chart.OnOrder(o)
	}

	return chart, nil
}

// buildSessionStrategy constructs a Strategy for an existing session using the
// global registry. Falls back to "emacross" with default parameters when the
// stored strategy name is not found.
func buildSessionStrategy(name, timeframe string) strategy.Strategy {
	cfg := registry.StrategyConfig{Timeframe: timeframe, FastPeriod: 8, SlowPeriod: 21}
	s, err := registry.Build(name, cfg)
	if err != nil {
		log.Warnf("unknown strategy %q for session restore, falling back to emacross: %v", name, err)
		s, _ = registry.Build("emacross", cfg)
	}
	return s
}

// SessionStorageWrapper wraps Storage and automatically injects SessionID into Order.
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
