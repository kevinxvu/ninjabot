package handler

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// drawdown is the max drawdown window; Value is a non-positive percentage
// (-12.5 = -12.5%), matching summaryStat.MaxDrawdownPct.
type drawdown struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
	Value float64   `json:"value"`
}

// HandleHealth answers 503 when the chart has not received a candle for over
// an hour (the status must be written before the body, or it is ignored).
func (h *Handler) HandleHealth(w http.ResponseWriter, _ *http.Request) {
	lastUpdate := h.chart.LastUpdate()
	if time.Since(lastUpdate) > time.Hour+10*time.Minute {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "stale", "last_update": lastUpdate})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "last_update": lastUpdate})
}

func (h *Handler) HandleChartData(w http.ResponseWriter, r *http.Request) {
	pair := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("pair")))
	if pair == "" {
		writeError(w, http.StatusBadRequest, "pair is required")
		return
	}

	var maxDrawdown *drawdown
	if wallet := h.chart.PaperWallet(); wallet != nil {
		if value, start, end := wallet.MaxDrawdown(); value < 0 {
			maxDrawdown = &drawdown{
				Start: start,
				End:   end,
				Value: math.Round(value*10000) / 100,
			}
		}
	}

	asset, quote := exchange.SplitAssetQuote(pair)
	assetValues, equityValues := h.chart.EquityValuesByPair(pair)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"candles":       h.chart.CandlesByPair(pair),
		"indicators":    h.chart.IndicatorsByPair(pair),
		"shapes":        h.chart.ShapesByPair(pair),
		"asset_values":  assetValues,
		"equity_values": equityValues,
		"quote":         quote,
		"asset":         asset,
		"max_drawdown":  maxDrawdown,
	})
}

func (h *Handler) HandleTradingHistoryData(w http.ResponseWriter, r *http.Request) {
	pair := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("pair")))
	if pair == "" {
		writeError(w, http.StatusBadRequest, "pair is required")
		return
	}

	buffer := bytes.NewBuffer(nil)
	csvWriter := csv.NewWriter(buffer)
	if err := csvWriter.Write([]string{"created_at", "status", "side", "id", "type", "quantity", "price", "total", "profit"}); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("write csv header: %v", err))
		return
	}
	if err := csvWriter.WriteAll(h.chart.OrderStringByPair(pair)); err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("write csv rows: %v", err))
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "history_"+pair+".csv"))
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(buffer.Bytes()); err != nil {
		log.Errorf("write history csv: %v", err)
	}
}

// HandleSummary serves the structured backtest summary as JSON.
// Returns 404 if no backtest has been run yet.
func (h *Handler) HandleSummary(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	data := h.summaryJSON
	h.mu.Unlock()

	if data == nil {
		writeError(w, http.StatusNotFound, "no backtest result available")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}
