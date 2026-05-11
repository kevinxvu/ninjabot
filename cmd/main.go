package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/rodrigo-brito/ninjabot/plot"
	plotindicator "github.com/rodrigo-brito/ninjabot/plot/indicator"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

func parsePairs(raw string) []string {
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(strings.ToUpper(p)); v != "" {
			result = append(result, v)
		}
	}
	return result
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Errorf("write json response: %v", err)
	}
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()

	chart, err := plot.NewChart(
		plot.WithCustomIndicators(plotindicator.RSI(14, "#8b5cf6")),
	)
	if err != nil {
		log.Fatal(err)
	}

	// Register chart routes (/data, /enhanced, /chart, /history, /health, /assets/).
	chart.Register(mux)

	srv, err := newServer(chart)
	if err != nil {
		log.Fatal(err)
	}

	mux.HandleFunc("/api/backtest", srv.handleBacktest)
	mux.HandleFunc("/api/summary", srv.handleSummary)
	mux.HandleFunc("/", srv.handleRoot)

	const port = 8080
	fmt.Printf("Backtest UI → http://localhost:%d\n", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), mux); err != nil {
		log.Fatal(err)
	}
}
