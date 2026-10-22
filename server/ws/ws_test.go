package ws

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

func TestBroadcastDeliversToClients(t *testing.T) {
	manager := NewMarketWebsocketManager()
	upgrader := websocket.Upgrader{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)
		manager.AddClient(conn)
		defer manager.RemoveClient(conn)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	require.NoError(t, err)
	defer conn.Close()

	require.Eventually(t, func() bool {
		manager.clientsMu.Lock()
		defer manager.clientsMu.Unlock()
		return len(manager.clients) == 1
	}, time.Second, 10*time.Millisecond)

	zero := 0.0
	manager.Broadcast(WSMessage{Type: "TICKER", Pair: "BTCUSDT", Price: &zero})

	var got map[string]any
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(time.Second)))
	require.NoError(t, conn.ReadJSON(&got))
	require.Equal(t, "TICKER", got["type"])
	require.Contains(t, got, "price")
	require.EqualValues(t, 0, got["price"])
}

func TestBroadcastDropsClientWithFullQueue(t *testing.T) {
	manager := NewMarketWebsocketManager()
	// A client whose writer never drains (no writeLoop running).
	stuck := &client{send: make(chan WSMessage, 1)}
	key := &websocket.Conn{}
	manager.clients[key] = stuck

	manager.Broadcast(WSMessage{Type: "A"})
	manager.Broadcast(WSMessage{Type: "B"})

	require.Empty(t, manager.clients)
}
