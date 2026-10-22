package ws

import (
	"log"
	"strconv"
	"sync"
	"time"

	gobinance "github.com/adshao/go-binance/v2"
	"github.com/gorilla/websocket"
	exbinance "github.com/rodrigo-brito/ninjabot/exchange/binance"
)

// WSMessage is the envelope for every /ws/market message in both directions.
type WSMessage struct {
	Type string `json:"type"`
	Pair string `json:"pair,omitempty"`
	// Price is only set on TICKER messages; a pointer keeps a 0 price.
	Price     *float64    `json:"price,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Action    string      `json:"action,omitempty"`
	Timeframe string      `json:"timeframe,omitempty"`
	SessionID string      `json:"session_id,omitempty"`
}

const (
	// clientBufferSize is how many messages may queue for a client before it
	// is considered too slow and dropped.
	clientBufferSize = 256
	writeTimeout     = 10 * time.Second
)

// client owns a connection's write side: only its writer goroutine writes to
// conn, so a slow client never blocks Broadcast or other clients.
type client struct {
	conn *websocket.Conn
	send chan WSMessage
}

func (c *client) writeLoop() {
	for msg := range c.send {
		_ = c.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
		if err := c.conn.WriteJSON(msg); err != nil {
			log.Printf("websocket write error: %v", err)
			// Closing the connection makes the read loop exit and call
			// RemoveClient, which closes send and ends this loop.
			c.conn.Close()
			for range c.send {
			}
			return
		}
	}
	c.conn.Close()
}

type MarketWebsocketManager struct {
	clients     map[*websocket.Conn]*client
	clientsMu   sync.Mutex
	streamMu    sync.Mutex
	tickerStopC chan struct{}
	candleStopC chan struct{}
	activePair  string
	activeTime  string
}

func NewMarketWebsocketManager() *MarketWebsocketManager {
	return &MarketWebsocketManager{
		clients: make(map[*websocket.Conn]*client),
	}
}

func (m *MarketWebsocketManager) AddClient(conn *websocket.Conn) {
	c := &client{conn: conn, send: make(chan WSMessage, clientBufferSize)}
	m.clientsMu.Lock()
	m.clients[conn] = c
	m.clientsMu.Unlock()
	go c.writeLoop()
}

// RemoveClient unregisters the connection; its writer closes it once the
// queued messages are flushed.
func (m *MarketWebsocketManager) RemoveClient(conn *websocket.Conn) {
	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()
	m.removeLocked(conn)
}

func (m *MarketWebsocketManager) removeLocked(conn *websocket.Conn) {
	if c, ok := m.clients[conn]; ok {
		delete(m.clients, conn)
		close(c.send)
	}
}

// Broadcast queues msg for every client without blocking. A client whose
// queue is full is dropped.
func (m *MarketWebsocketManager) Broadcast(msg WSMessage) {
	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	for conn, c := range m.clients {
		select {
		case c.send <- msg:
		default:
			log.Printf("websocket client too slow, dropping connection")
			m.removeLocked(conn)
		}
	}
}

func (m *MarketWebsocketManager) StartTickerSubscription(pairs []string) {
	m.streamMu.Lock()
	defer m.streamMu.Unlock()

	if m.tickerStopC != nil {
		close(m.tickerStopC)
		m.tickerStopC = nil
	}

	_, stopC, err := gobinance.WsCombinedMarketStatServe(pairs,
		func(event *gobinance.WsMarketStatEvent) {
			price := 0.0
			if p, err := strconv.ParseFloat(event.LastPrice, 64); err == nil {
				price = p
			}

			m.Broadcast(WSMessage{
				Type:  "TICKER",
				Pair:  event.Symbol,
				Price: &price,
			})
		},
		func(err error) {
			log.Printf("Lỗi Binance Ticker WS: %v", err)
		},
	)

	if err != nil {
		log.Printf("Không thể khởi tạo Ticker Subscription: %v", err)
		return
	}

	m.tickerStopC = stopC
}

func (m *MarketWebsocketManager) StartCandleSubscription(pair, timeframe string) {
	m.streamMu.Lock()
	defer m.streamMu.Unlock()

	if m.activePair == pair && m.activeTime == timeframe && m.candleStopC != nil {
		return
	}

	if m.candleStopC != nil {
		close(m.candleStopC)
		m.candleStopC = nil
	}

	m.activePair = pair
	m.activeTime = timeframe

	_, stopC, err := gobinance.WsKlineServe(pair, timeframe,
		func(event *gobinance.WsKlineEvent) {
			candle := exbinance.CandleFromWsKline(pair, event.Kline)

			m.Broadcast(WSMessage{
				Type: "CANDLE",
				Pair: pair,
				Data: candle,
			})
		},
		func(err error) {
			log.Printf("Lỗi Binance Candle WS: %v", err)
		},
	)

	if err != nil {
		log.Printf("Không thể khởi tạo Candle Subscription: %v", err)
		return
	}

	m.candleStopC = stopC
}
