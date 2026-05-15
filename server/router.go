package server

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/rodrigo-brito/ninjabot/ui"
)

// SetupRouter creates a new ServeMux and registers all routes
func SetupRouter(srv *Server) *http.ServeMux {
	mux := http.NewServeMux()

	// Extract the "dist" directory from the embedded files
	distFS, err := fs.Sub(ui.Files, "dist")
	if err != nil {
		panic(err)
	}

	fileServer := http.FileServer(http.FS(distFS))

	// API routes
	mux.HandleFunc("/health", srv.HandleHealth)
	mux.HandleFunc("/history", srv.HandleTradingHistoryData)
	mux.HandleFunc("/data", srv.HandleChartData)
	mux.HandleFunc("/api/backtest", srv.HandleBacktest)
	mux.HandleFunc("/api/summary", srv.HandleSummary)
	mux.HandleFunc("/api/pairs", srv.HandlePairs)

	// Serve React App and static assets
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve API routes first (handled above), then static files
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
