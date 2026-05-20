package handler

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

type drawdown struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
	Value string    `json:"value"`
}

func (h *Handler) HandleHealth(w http.ResponseWriter, _ *http.Request) {
	if time.Since(h.chart.LastUpdate()) > time.Hour+10*time.Minute {
		_, err := w.Write([]byte(h.chart.LastUpdate().String()))
		if err != nil {
			log.Error(err)
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *Handler) HandleChartData(w http.ResponseWriter, r *http.Request) {
	pair := r.URL.Query().Get("pair")
	if pair == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-type", "text/json")

	var maxDrawdown *drawdown
	if h.chart.PaperWallet() != nil {
		value, start, end := h.chart.PaperWallet().MaxDrawdown()
		maxDrawdown = &drawdown{
			Start: start,
			End:   end,
			Value: fmt.Sprintf("%.1f", value*100),
		}
	}

	asset, quote := exchange.SplitAssetQuote(pair)
	assetValues, equityValues := h.chart.EquityValuesByPair(pair)
	err := json.NewEncoder(w).Encode(map[string]interface{}{
		"candles":       h.chart.CandlesByPair(pair),
		"indicators":    h.chart.IndicatorsByPair(pair),
		"shapes":        h.chart.ShapesByPair(pair),
		"asset_values":  assetValues,
		"equity_values": equityValues,
		"quote":         quote,
		"asset":         asset,
		"max_drawdown":  maxDrawdown,
	})
	if err != nil {
		log.Error(err)
	}
}

func (h *Handler) HandleTradingHistoryData(w http.ResponseWriter, r *http.Request) {
	pair := r.URL.Query().Get("pair")
	if pair == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment;filename=history_"+pair+".csv")
	w.Header().Set("Transfer-Encoding", "chunked")

	orders := h.chart.OrderStringByPair(pair)

	buffer := bytes.NewBuffer(nil)
	csvWriter := csv.NewWriter(buffer)
	err := csvWriter.Write([]string{"created_at", "status", "side", "id", "type", "quantity", "price", "total", "profit"})
	if err != nil {
		log.Errorf("failed writing header file: %s", err.Error())
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	err = csvWriter.WriteAll(orders)
	if err != nil {
		log.Errorf("failed writing data: %s", err.Error())
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	csvWriter.Flush()

	w.WriteHeader(http.StatusOK)
	_, err = w.Write(buffer.Bytes())
	if err != nil {
		log.Errorf("failed writing response: %s", err.Error())
		w.WriteHeader(http.StatusBadRequest)
		return
	}
}

// HandleSummary serves the structured backtest summary as JSON.
// Returns 404 if no backtest has been run yet.
func (h *Handler) HandleSummary(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	data := h.summaryJSON
	h.mu.Unlock()

	if data == nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}
