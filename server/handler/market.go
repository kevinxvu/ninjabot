package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// HandlePairs serves trading pair information.
// - If no "pairs" param is provided: returns { "pairs": ["BTCUSDT", "ETHUSDT", ...] }
// - If "pairs" param is provided (e.g. ?pairs=BTCUSDT,ETHUSDT): returns detailed mapping.
func (h *Handler) HandlePairs(w http.ResponseWriter, r *http.Request) {
	pairsParam := r.URL.Query().Get("pairs")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400")

	// 1. No param: return simple list of pair names from the loaded file.
	if pairsParam == "" {
		var pairs []string
		h.mu.Lock()
		for p := range h.pairsData {
			pairs = append(pairs, p)
		}
		h.mu.Unlock()

		sort.Strings(pairs)

		if err := json.NewEncoder(w).Encode(map[string]interface{}{"pairs": pairs}); err != nil {
			log.Errorf("encode pairs: %v", err)
		}
		return
	}

	// 2. With param: return detailed object per requested pair.
	pairs := strings.Split(pairsParam, ",")
	result := make(map[string]PairInfo)

	h.mu.Lock()
	for _, p := range pairs {
		if data, ok := h.pairsData[p]; ok {
			result[p] = data
		}
	}
	h.mu.Unlock()

	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Errorf("encode pairs info: %v", err)
	}
}

func (h *Handler) HandleMarketTickers(w http.ResponseWriter, r *http.Request) {
	pairsParam := r.URL.Query().Get("pairs")
	if pairsParam == "" {
		pairsParam = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"
	}
	pairs := strings.Split(pairsParam, ",")

	results := make(map[string]float64)
	var lastErr error
	for _, pair := range pairs {
		quote, err := h.exc.LastQuote(r.Context(), pair)
		if err != nil {
			log.Errorf("last quote %s: %v", pair, err)
			lastErr = err
			continue
		}
		results[pair] = quote
	}

	// Partial results are fine (the UI shows what it got); no price at all is
	// an upstream failure.
	if len(results) == 0 && lastErr != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("fetch tickers: %v", lastErr))
		return
	}

	writeJSON(w, http.StatusOK, results)
}

func (h *Handler) HandleMarketCandles(w http.ResponseWriter, r *http.Request) {
	pair := r.URL.Query().Get("pair")
	if pair == "" {
		pair = "BTCUSDT"
	}
	timeframe := r.URL.Query().Get("timeframe")
	if timeframe == "" {
		timeframe = "1d"
	}

	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}

	candles, err := h.exc.CandlesByLimit(r.Context(), pair, timeframe, limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("fetch candles: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, candles)
}

// HandleMarketPortfolio values the Binance account in USDT. It answers 503
// when the account cannot be read (missing or invalid API key).
func (h *Handler) HandleMarketPortfolio(w http.ResponseWriter, r *http.Request) {
	acc, err := h.exc.Account()
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Sprintf("binance account unavailable: %v", err))
		return
	}

	totalUSDT := 0.0
	assets := make([]assetBalance, 0)

	for _, bal := range acc.Balances {
		amount := bal.Free + bal.Lock
		if amount <= 0 {
			continue
		}

		if bal.Asset == "USDT" {
			totalUSDT += amount
			assets = append(assets, assetBalance{Asset: "USDT", ValueUSDT: amount})
			continue
		}

		// Use LastQuote to get the current price for the asset
		pair := bal.Asset + "USDT"
		quote, err := h.exc.LastQuote(r.Context(), pair)
		if err == nil && quote > 0 {
			valueUSDT := amount * quote
			// Only include assets with a reasonable value (e.g. > $1)
			if valueUSDT > 1.0 {
				totalUSDT += valueUSDT
				assets = append(assets, assetBalance{Asset: bal.Asset, ValueUSDT: valueUSDT})
			}
		}
	}

	writeJSON(w, http.StatusOK, PortfolioResponse{
		TotalValueUSDT: totalUSDT,
		Assets:         assets,
	})
}
