package handler

import (
	"context"
	"errors"
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
	"github.com/rodrigo-brito/ninjabot/server/telegram"
	serverws "github.com/rodrigo-brito/ninjabot/server/ws"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies" // also registers built-in strategies
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

var (
	// ErrSessionBusy is returned when a session already has a running or
	// starting bot.
	ErrSessionBusy = errors.New("session is already running")

	errStartCancelled = errors.New("session was stopped while starting")
)

type botInstance struct {
	Bot    *ninjabot.NinjaBot
	Cancel context.CancelFunc
	Chart  *plot.Chart
	// done is closed when the bot's Run has returned.
	done chan struct{}
}

// botStopTimeout bounds how long StopSession waits for a cancelled bot to
// finish its current candle.
const botStopTimeout = 10 * time.Second

// SignalManager manages realtime signal (live trading) sessions.
type SignalManager struct {
	mu        sync.Mutex
	bots      map[string]*botInstance
	starting  map[string]context.CancelFunc
	db        storage.Storage
	exchange  *exbinance.Binance
	wsManager *serverws.MarketWebsocketManager
	// alerter is nil when the storage cannot hold Telegram settings.
	alerter *SignalAlerter
}

// NewSignalManager creates a new SignalManager.
func NewSignalManager(db storage.Storage, exc *exbinance.Binance, ws *serverws.MarketWebsocketManager) *SignalManager {
	m := &SignalManager{
		bots:      make(map[string]*botInstance),
		starting:  make(map[string]context.CancelFunc),
		db:        db,
		exchange:  exc,
		wsManager: ws,
		alerter:   NewSignalAlerter(db, telegram.NewClient()),
	}
	m.RecoverStaleSessions()
	return m
}

// RecoverStaleSessions marks any sessions that were left as "running" in the DB
// (e.g. after a process crash) as "stopped" and records a STOP event for them.
// The STOP event timestamp uses session.UpdatedAt (the last DB write before the crash),
// which is a better estimate of when the bot actually stopped than time.Now().
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
		// Capture the last-known-active time BEFORE we modify the session.
		// If UpdatedAt was never set after creation, fall back to CreatedAt.
		stoppedAt := s.UpdatedAt
		if !stoppedAt.After(s.CreatedAt) {
			stoppedAt = s.CreatedAt
		}

		s.Status = "stopped"
		s.UpdatedAt = time.Now()
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
				CreatedAt: stoppedAt, // last-known-active time, not recovery time
			}); err != nil {
				log.Errorf("RecoverStaleSessions: failed to create STOP event for session %s: %v", s.ID, err)
			}
		}
		log.Infof("RecoverStaleSessions: marked session %s as stopped (stoppedAt: %s)", s.ID, stoppedAt.Format(time.RFC3339))
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
	// TelegramAlerts sends a Telegram message on each BUY/SELL signal.
	TelegramAlerts bool `json:"telegram_alerts"`
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

// maxRealtimeChartCandles caps the history rebuilt for a session chart. Older
// long-running sessions on small timeframes (e.g. months of 1m candles) would
// otherwise need hundreds of sequential Binance requests and an unplottable
// payload.
const maxRealtimeChartCandles = 3000

// realtimeChartStartTime returns where the session chart history begins: the
// session start minus the strategy warmup, but no more than
// maxRealtimeChartCandles before end.
func realtimeChartStartTime(session *model.Session, currentStrategy strategy.Strategy, end time.Time) time.Time {
	duration, ok := timeframeDuration(session.Timeframe)
	if !ok {
		return session.CreatedAt
	}

	start := session.CreatedAt.Add(-duration * time.Duration(currentStrategy.WarmupPeriod()))
	if earliest := end.Add(-duration * maxRealtimeChartCandles); start.Before(earliest) {
		start = earliest
	}
	return start
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
	start := realtimeChartStartTime(session, currentStrategy, end)
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

// buildBot creates the paper wallet, bot and chart for a session. ctx is only
// used for the initial candle fetch; the bot itself lives on botCtx so it
// outlives the HTTP request that started it.
func (m *SignalManager) buildBot(ctx, botCtx context.Context, session *model.Session) (*botInstance, error) {
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
		botCtx,
		"USDT",
		options...,
	)

	settings := ninjabot.Settings{
		Pairs: []string{session.Pair},
	}

	currentStrategy := buildSessionStrategy(session)

	notifier := WsNotifier{
		SessionID: session.ID,
		wsManager: m.wsManager,
	}

	storageWrapper := &SessionStorageWrapper{
		Storage:   m.db,
		SessionID: session.ID,
	}

	bot, err := ninjabot.NewBot(
		botCtx,
		settings,
		paperWallet,
		currentStrategy,
		ninjabot.WithStorage(storageWrapper),
		ninjabot.WithPaperWallet(paperWallet),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to init bot: %w", err)
	}

	ninjabot.WithNotifier(notifier)(bot)
	// Resumed sessions continue the position they held, so the next SELL
	// reports its profit against the original entry.
	bot.Controller().RestorePositions(session.Orders)
	if m.alerter != nil {
		ninjabot.WithOrderSubscription(m.alerter.OrderNotifier(session.ID))(bot)
	}

	chart, err := plot.NewChart(
		plot.WithStrategyIndicators(currentStrategy),
		plot.WithPaperWallet(paperWallet),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create chart: %w", err)
	}

	candles, err := m.fetchSessionChartCandles(ctx, session, currentStrategy, realtimeChartEndTime(session, time.Now()))
	if err != nil {
		log.Errorf("Failed to fetch session candles for chart: %v", err)
		m.hydrateRecentChartCandles(ctx, chart, session.Pair, session.Timeframe, currentStrategy)
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

	return &botInstance{
		Bot:   bot,
		Chart: chart,
		done:  make(chan struct{}),
	}, nil
}

// reserve marks a session as starting so concurrent start/resume calls cannot
// launch it twice. The returned context is cancelled by StopSession.
func (m *SignalManager) reserve(sessionID string) (context.Context, context.CancelFunc, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.bots[sessionID]; ok {
		return nil, nil, ErrSessionBusy
	}
	if _, ok := m.starting[sessionID]; ok {
		return nil, nil, ErrSessionBusy
	}

	botCtx, cancel := context.WithCancel(context.Background())
	m.starting[sessionID] = cancel
	return botCtx, cancel, nil
}

// launch builds the bot for a reserved session without holding the manager
// lock (it fetches candles from Binance), then registers and runs it.
func (m *SignalManager) launch(ctx, botCtx context.Context, cancel context.CancelFunc, session *model.Session) error {
	instance, err := m.buildBot(ctx, botCtx, session)

	m.mu.Lock()
	delete(m.starting, session.ID)
	if err == nil && botCtx.Err() != nil {
		err = errStartCancelled
	}
	if err != nil {
		m.mu.Unlock()
		cancel()
		return err
	}
	instance.Cancel = cancel
	m.bots[session.ID] = instance
	m.mu.Unlock()

	go m.run(botCtx, session.ID, instance)
	return nil
}

func (m *SignalManager) run(ctx context.Context, sessionID string, instance *botInstance) {
	defer close(instance.done)
	log.Infof("Starting realtime signal session %s", sessionID)
	err := instance.Bot.Run(ctx)
	if err != nil && !errors.Is(err, context.Canceled) {
		log.Errorf("Bot session %s error: %v", sessionID, err)
	}

	// StopSession already removed the instance and updated the DB. Only
	// handle bots that ended on their own, and never touch a newer instance
	// started by a later resume.
	m.mu.Lock()
	owned := m.bots[sessionID] == instance
	if owned {
		delete(m.bots, sessionID)
	}
	m.mu.Unlock()
	if !owned {
		return
	}

	instance.Cancel()
	s, err := m.db.GetSessionByID(sessionID)
	if err != nil || s.Status != "running" {
		return
	}
	s.Status = "stopped"
	s.UpdatedAt = time.Now()
	if err := m.db.UpdateSession(s); err != nil {
		log.Errorf("Failed to mark session %s as stopped: %v", sessionID, err)
	}
	m.recordSessionEvent(sessionID, model.SessionEventTypeStop)
}

// IsRunning reports whether the session has a live or starting bot.
func (m *SignalManager) IsRunning(sessionID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, running := m.bots[sessionID]
	_, starting := m.starting[sessionID]
	return running || starting
}

// markFailed flags a session whose bot could not be started.
func (m *SignalManager) markFailed(session *model.Session) {
	session.Status = "error"
	session.UpdatedAt = time.Now()
	if err := m.db.UpdateSession(session); err != nil {
		log.Errorf("Failed to mark session %s as failed: %v", session.ID, err)
	}
}

func (m *SignalManager) StartSession(ctx context.Context, req StartSignalRequest) (*model.Session, error) {
	now := time.Now()
	session := &model.Session{
		ID:             uuid.New().String(),
		Type:           "REALTIME_SIGNAL",
		Status:         "running",
		Pair:           req.Pair,
		Strategy:       req.Strategy,
		Timeframe:      req.Timeframe,
		InitialAsset:   req.InitialAsset,
		InitialAmount:  req.InitialAmount,
		FastPeriod:     req.FastPeriod,
		SlowPeriod:     req.SlowPeriod,
		TelegramAlerts: req.TelegramAlerts,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if err := m.db.CreateSession(session); err != nil {
		return nil, fmt.Errorf("failed to create session in db: %w", err)
	}
	m.recordSessionEvent(session.ID, model.SessionEventTypeStart)

	botCtx, cancel, err := m.reserve(session.ID)
	if err != nil {
		return nil, err
	}
	if err := m.launch(ctx, botCtx, cancel, session); err != nil {
		if errors.Is(err, errStartCancelled) {
			return m.db.GetSessionByID(session.ID)
		}
		m.markFailed(session)
		return nil, err
	}
	m.alerter.SessionEvent(session, model.SessionEventTypeStart)

	return session, nil
}

func (m *SignalManager) ResumeSession(ctx context.Context, sessionID string) (*model.Session, error) {
	session, err := m.db.GetSessionByID(sessionID)
	if err != nil {
		return nil, err
	}

	botCtx, cancel, err := m.reserve(sessionID)
	if errors.Is(err, ErrSessionBusy) {
		session.Status = "running"
		return session, nil
	}
	if err != nil {
		return nil, err
	}

	session.Status = "running"
	session.UpdatedAt = time.Now()
	if err := m.db.UpdateSession(session); err != nil {
		m.mu.Lock()
		delete(m.starting, sessionID)
		m.mu.Unlock()
		cancel()
		return nil, fmt.Errorf("update session %s: %w", sessionID, err)
	}
	m.recordSessionEvent(session.ID, model.SessionEventTypeResume)

	if err := m.launch(ctx, botCtx, cancel, session); err != nil {
		if errors.Is(err, errStartCancelled) {
			return m.db.GetSessionByID(sessionID)
		}
		m.markFailed(session)
		return nil, err
	}
	m.alerter.SessionEvent(session, model.SessionEventTypeResume)

	return session, nil
}

// StopSession cancels the session's bot (running or still starting), waits
// for it to exit so it cannot place another order, and persists the stopped
// state before returning, so a follow-up GET sees it.
func (m *SignalManager) StopSession(sessionID string) error {
	m.mu.Lock()
	instance, running := m.bots[sessionID]
	if running {
		delete(m.bots, sessionID)
		instance.Cancel()
	}
	cancelStart, starting := m.starting[sessionID]
	if starting {
		cancelStart()
	}
	m.mu.Unlock()

	if running {
		select {
		case <-instance.done:
		case <-time.After(botStopTimeout):
			log.Warnf("Session %s bot did not exit within %s", sessionID, botStopTimeout)
		}
	}

	session, err := m.db.GetSessionByID(sessionID)
	if err != nil {
		return err
	}
	if session.Status != "running" && !running && !starting {
		return nil
	}

	session.Status = "stopped"
	session.UpdatedAt = time.Now()
	if err := m.db.UpdateSession(session); err != nil {
		return fmt.Errorf("update session %s: %w", sessionID, err)
	}
	m.recordSessionEvent(sessionID, model.SessionEventTypeStop)
	m.alerter.SessionEvent(session, model.SessionEventTypeStop)
	return nil
}

// SetTelegramAlerts turns a session's Telegram alerts on or off. Running bots
// read the flag on every signal, so the change applies immediately.
func (m *SignalManager) SetTelegramAlerts(sessionID string, enabled bool) (*model.Session, error) {
	session, err := m.db.GetSessionByID(sessionID)
	if err != nil {
		return nil, err
	}
	session.TelegramAlerts = enabled
	if err := m.db.UpdateSession(session); err != nil {
		return nil, fmt.Errorf("update session %s: %w", sessionID, err)
	}
	return session, nil
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

// GetSessionChart rebuilds the chart of a session and returns it with the
// session it was built from.
func (m *SignalManager) GetSessionChart(ctx context.Context, sessionID string) (*plot.Chart, *model.Session, error) {
	session, err := m.db.GetSessionByID(sessionID)
	if err != nil {
		return nil, nil, err
	}

	m.mu.Lock()
	instance, exists := m.bots[sessionID]
	m.mu.Unlock()

	// A running bot keeps its own chart up to date from the live candle and order
	// feeds, so serve it directly instead of re-downloading history from Binance on
	// every refresh (the UI refreshes on each closed candle).
	if exists && instance.Chart != nil && len(instance.Chart.CandlesByPair(session.Pair)) > 0 {
		return instance.Chart, session, nil
	}

	currentStrategy := buildSessionStrategy(session)

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
		return nil, nil, fmt.Errorf("failed to create chart: %w", err)
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
			return instance.Chart, session, nil
		}
		if fetchErr != nil {
			log.Errorf("Failed to fetch session candles for chart: %v", fetchErr)
		}
		m.hydrateRecentChartCandles(ctx, chart, session.Pair, session.Timeframe, currentStrategy)
	}

	for _, o := range session.Orders {
		chart.OnOrder(o)
	}

	return chart, session, nil
}

// fillStrategyParams sets the strategy parameters the session actually runs
// with, so sessions stored without periods (older builds) show the defaults.
func fillStrategyParams(session *model.Session) {
	if s, ok := buildSessionStrategy(session).(*strategies.CrossEMA); ok {
		session.FastPeriod = s.FastPeriod
		session.SlowPeriod = s.SlowPeriod
	}
}

// buildSessionStrategy constructs the session's Strategy using the global
// registry and the session's stored parameters (zero values fall back to the
// strategy defaults). Falls back to "emacross" when the stored strategy name
// is not registered, e.g. for sessions created by an older build.
func buildSessionStrategy(session *model.Session) strategy.Strategy {
	cfg := registry.StrategyConfig{
		Timeframe:  session.Timeframe,
		FastPeriod: session.FastPeriod,
		SlowPeriod: session.SlowPeriod,
	}
	s, err := registry.Build(session.Strategy, cfg)
	if err != nil {
		log.Warnf("unknown strategy %q for session %s, falling back to emacross: %v", session.Strategy, session.ID, err)
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
