package server

import (
	"io/fs"
	"net/http"
	"strings"

	serverhandler "github.com/rodrigo-brito/ninjabot/server/handler"
	"github.com/rodrigo-brito/ninjabot/ui"
)

// SetupRouter creates a new ServeMux and registers all routes.
func SetupRouter(h *serverhandler.Handler) *http.ServeMux {
	mux := http.NewServeMux()

	distFS, err := fs.Sub(ui.Files, "dist")
	if err != nil {
		panic(err)
	}

	fileServer := http.FileServer(http.FS(distFS))

	// API routes
	mux.HandleFunc("/api/health", serverhandler.Middleware(h.HandleHealth))
	mux.HandleFunc("/api/history", serverhandler.Middleware(h.HandleTradingHistoryData))
	mux.HandleFunc("/api/data", serverhandler.Middleware(h.HandleChartData))
	mux.HandleFunc("/api/backtest", serverhandler.Middleware(h.HandleBacktest))
	mux.HandleFunc("/api/summary", serverhandler.Middleware(h.HandleSummary))
	mux.HandleFunc("/api/pairs", serverhandler.Middleware(h.HandlePairs))
	mux.HandleFunc("/api/market/tickers", serverhandler.Middleware(h.HandleMarketTickers))
	mux.HandleFunc("/api/market/candles", serverhandler.Middleware(h.HandleMarketCandles))
	mux.HandleFunc("/api/market/portfolio", serverhandler.Middleware(h.HandleMarketPortfolio))

	// Realtime Signals API
	mux.HandleFunc("/api/realtime-signals", serverhandler.Middleware(h.HandleListRealtimeSignals))
	mux.HandleFunc("/api/realtime-signals/start", serverhandler.Middleware(h.HandleStartRealtimeSignal))
	mux.HandleFunc("/api/realtime-signals/", serverhandler.Middleware(h.HandleRealtimeSignal))

	// Settings API
	mux.HandleFunc("/api/settings/telegram", serverhandler.Middleware(h.HandleTelegramSettings))
	mux.HandleFunc("/api/settings/telegram/test", serverhandler.Middleware(h.HandleTelegramTest))
	mux.HandleFunc("/api/", serverhandler.Middleware(h.HandleNotFound))

	mux.HandleFunc("/ws/market", serverhandler.Middleware(h.HandleMarketWebsocket))

	// Serve React App and static assets
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasPrefix(path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=86400")
			if strings.HasSuffix(path, ".js") {
				w.Header().Set("Content-Type", "application/javascript")
			}
		}

		// Fallback to index.html if the file doesn't exist (SPA routing support)
		if path != "/" {
			_, err := fs.Stat(distFS, strings.TrimPrefix(path, "/"))
			if err != nil {
				r.URL.Path = "/"
			}
		}

		fileServer.ServeHTTP(w, r)
	})

	return mux
}
