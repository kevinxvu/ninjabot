package ws

import (
	"log"
	"strconv"
	"sync"

	gobinance "github.com/adshao/go-binance/v2"
	"github.com/gorilla/websocket"
	exbinance "github.com/rodrigo-brito/ninjabot/exchange/binance"
)

type WSMessage struct {
	Type      string      `json:"type"`
	Pair      string      `json:"pair,omitempty"`
	Price     float64     `json:"price,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Action    string      `json:"action,omitempty"`
	Timeframe string      `json:"timeframe,omitempty"`
	SessionID string      `json:"session_id,omitempty"`
}

type MarketWebsocketManager struct {
	clients     map[*websocket.Conn]bool
	clientsMu   sync.Mutex
	tickerStopC chan struct{}
	candleStopC chan struct{}
	activePair  string
	activeTime  string
}

func NewMarketWebsocketManager() *MarketWebsocketManager {
	return &MarketWebsocketManager{
		clients: make(map[*websocket.Conn]bool),
	}
}

func (m *MarketWebsocketManager) AddClient(conn *websocket.Conn) {
	m.clientsMu.Lock()
	m.clients[conn] = true
	m.clientsMu.Unlock()
}

func (m *MarketWebsocketManager) RemoveClient(conn *websocket.Conn) {
	m.clientsMu.Lock()
	delete(m.clients, conn)
	m.clientsMu.Unlock()
	conn.Close()
}

func (m *MarketWebsocketManager) Broadcast(msg WSMessage) {
	m.clientsMu.Lock()
	defer m.clientsMu.Unlock()

	for conn := range m.clients {
		err := conn.WriteJSON(msg)
		if err != nil {
			log.Printf("Lỗi ghi websocket: %v", err)
			conn.Close()
			delete(m.clients, conn)
		}
	}
}

func (m *MarketWebsocketManager) StartTickerSubscription(pairs []string) {
	if m.tickerStopC != nil {
		close(m.tickerStopC)
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
				Price: price,
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
	if m.activePair == pair && m.activeTime == timeframe && m.candleStopC != nil {
		return
	}

	if m.candleStopC != nil {
		close(m.candleStopC)
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
