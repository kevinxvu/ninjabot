package server

import (
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/adshao/go-binance/v2"
	"github.com/gorilla/websocket"
	"github.com/rodrigo-brito/ninjabot/exchange"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Cho phép mọi origin trong quá trình dev
	},
}

type WSMessage struct {
	Type      string      `json:"type"`
	Pair      string      `json:"pair,omitempty"`
	Price     float64     `json:"price,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Action    string      `json:"action,omitempty"`
	Timeframe string      `json:"timeframe,omitempty"`
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

// Thêm client mới
func (m *MarketWebsocketManager) addClient(conn *websocket.Conn) {
	m.clientsMu.Lock()
	m.clients[conn] = true
	m.clientsMu.Unlock()
}

// Xoá client
func (m *MarketWebsocketManager) removeClient(conn *websocket.Conn) {
	m.clientsMu.Lock()
	delete(m.clients, conn)
	m.clientsMu.Unlock()
	conn.Close()
}

// Gửi message tới toàn bộ client
func (m *MarketWebsocketManager) broadcast(msg WSMessage) {
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

// Start theo dõi Ticker của danh sách chỉ định
func (m *MarketWebsocketManager) StartTickerSubscription(pairs []string) {
	if m.tickerStopC != nil {
		close(m.tickerStopC)
	}

	_, stopC, err := binance.WsCombinedMarketStatServe(pairs,
		func(event *binance.WsMarketStatEvent) {
			price := 0.0
			// Convert chuỗi giá sang float
			if p, err := strconv.ParseFloat(event.LastPrice, 64); err == nil {
				price = p
			}

			// Broadcast giá mới cho frontend
			m.broadcast(WSMessage{
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

// Start theo dõi nến của 1 cặp cụ thể
func (m *MarketWebsocketManager) StartCandleSubscription(pair, timeframe string) {
	if m.activePair == pair && m.activeTime == timeframe && m.candleStopC != nil {
		return // Đang chạy đúng luồng này rồi, không cần khởi động lại
	}

	// Tắt luồng nến cũ (nếu có)
	if m.candleStopC != nil {
		close(m.candleStopC)
	}

	m.activePair = pair
	m.activeTime = timeframe

	_, stopC, err := binance.WsKlineServe(pair, timeframe,
		func(event *binance.WsKlineEvent) {
			candle := exchange.CandleFromWsKline(pair, event.Kline)

			m.broadcast(WSMessage{
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

// HTTP Handler nâng cấp lên Websocket
func (s *Server) HandleMarketWebsocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	if s.wsManager == nil {
		log.Println("WS Manager chưa được khởi tạo")
		return
	}

	s.wsManager.addClient(conn)
	defer s.wsManager.removeClient(conn)

	// Vòng lặp nhận message từ client (đổi cặp, đổi timeframe)
	for {
		var msg WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS Lỗi đọc: %v", err)
			}
			break
		}

		// Xử lý action từ client
		if msg.Action == "SUBSCRIBE_CANDLE" && msg.Pair != "" && msg.Timeframe != "" {
			s.wsManager.StartCandleSubscription(strings.ToUpper(msg.Pair), msg.Timeframe)
		}
	}
}
