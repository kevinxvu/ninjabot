package handler

import (
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	serverws "github.com/rodrigo-brito/ninjabot/server/ws"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins during development
	},
}

// HandleMarketWebsocket upgrades the connection to WebSocket and manages messages.
func (h *Handler) HandleMarketWebsocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	if h.wsManager == nil {
		log.Println("WS Manager not initialised")
		conn.Close()
		return
	}

	h.wsManager.AddClient(conn)
	defer h.wsManager.RemoveClient(conn)

	for {
		var msg serverws.WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS read error: %v", err)
			}
			break
		}

		if msg.Action == "SUBSCRIBE_CANDLE" && msg.Pair != "" && msg.Timeframe != "" {
			h.wsManager.StartCandleSubscription(strings.ToUpper(msg.Pair), msg.Timeframe)
		}
	}
}
