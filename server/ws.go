package server

import (
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	serverws "github.com/rodrigo-brito/ninjabot/server/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Cho phép mọi origin trong quá trình dev
	},
}

// HandleMarketWebsocket upgrades the connection to WebSocket and manages messages
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

	s.wsManager.AddClient(conn)
	defer s.wsManager.RemoveClient(conn)

	for {
		var msg serverws.WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS Lỗi đọc: %v", err)
			}
			break
		}

		if msg.Action == "SUBSCRIBE_CANDLE" && msg.Pair != "" && msg.Timeframe != "" {
			s.wsManager.StartCandleSubscription(strings.ToUpper(msg.Pair), msg.Timeframe)
		}
	}
}
