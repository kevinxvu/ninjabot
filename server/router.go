package server

import (
	"net/http"
	"strings"

	"github.com/rodrigo-brito/ninjabot/ui"
)

// SetupRouter creates a new ServeMux and registers all routes
func SetupRouter(srv *Server) *http.ServeMux {
	mux := http.NewServeMux()

	// Register chart routes with 1-day cache
	fileServer := http.FileServer(http.FS(ui.Files))
	mux.HandleFunc("/assets/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		if strings.HasSuffix(r.URL.Path, ".js") {
			w.Header().Set("Content-Type", "application/javascript")
		}
		fileServer.ServeHTTP(w, r)
	})

	mux.HandleFunc("/health", srv.HandleHealth)
	mux.HandleFunc("/history", srv.HandleTradingHistoryData)
	mux.HandleFunc("/data", srv.HandleChartData)
	mux.HandleFunc("/enhanced", srv.HandleChartIndex)

	mux.HandleFunc("/api/backtest", srv.HandleBacktest)
	mux.HandleFunc("/api/summary", srv.HandleSummary)
	mux.HandleFunc("/", srv.HandleRoot)

	return mux
}
