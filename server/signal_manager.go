package server

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/model"
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
}

type SignalManager struct {
	mu       sync.Mutex
	bots     map[string]*botInstance
	db       storage.Storage
	exchange *exchange.Binance
	wsManager *MarketWebsocketManager
}

func NewSignalManager(db storage.Storage, exc *exchange.Binance, ws *MarketWebsocketManager) *SignalManager {
	return &SignalManager{
		bots:     make(map[string]*botInstance),
		db:       db,
		exchange: exc,
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

func (m *SignalManager) startBotFromSession(ctx context.Context, session *model.Session, req StartSignalRequest) error {
	// Cấu hình PaperWallet
	paperWallet := exchange.NewPaperWallet(
		ctx,
		"USDT",
		exchange.WithPaperAsset(req.InitialAsset, req.InitialAmount),
		exchange.WithDataFeed(m.exchange),
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
	m.bots[session.ID] = &botInstance{
		Bot:    bot,
		Cancel: cancel,
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
		}
		return nil
	}

	instance.Cancel()
	delete(m.bots, sessionID)
	return nil
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
