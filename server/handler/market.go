package handler

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"sync"

	"github.com/rodrigo-brito/ninjabot/tools/log"
)

const (
	// maxCandleLimit is Binance's hard limit of klines per request.
	maxCandleLimit = 1000
	// quoteConcurrency bounds parallel LastQuote calls to Binance.
	quoteConcurrency = 8
)

var defaultTickerPairs = []string{"BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"}

// HandlePairs serves trading pair information.
// - If no "pairs" param is provided: returns { "pairs": ["BTCUSDT", "ETHUSDT", ...] }
// - If "pairs" param is provided (e.g. ?pairs=BTCUSDT,ETHUSDT): returns {pair: {asset, quote, logo}}.
func (h *Handler) HandlePairs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "public, max-age=86400")

	requested := parsePairs(r.URL.Query().Get("pairs"))

	// 1. No param: return simple list of pair names from the loaded file.
	if len(requested) == 0 {
		pairs := make([]string, 0, len(h.pairsData))
		h.mu.Lock()
		for p := range h.pairsData {
			pairs = append(pairs, p)
		}
		h.mu.Unlock()

		sort.Strings(pairs)
		writeJSON(w, http.StatusOK, map[string][]string{"pairs": pairs})
		return
	}

	// 2. With param: return detailed object per requested pair.
	result := make(map[string]PairInfo, len(requested))
	h.mu.Lock()
	for _, p := range requested {
		if data, ok := h.pairsData[p]; ok {
			result[p] = data
		}
	}
	h.mu.Unlock()

	writeJSON(w, http.StatusOK, result)
}

// lastQuotes fetches the last price of each pair concurrently. Pairs whose
// quote failed are left out; the last error is returned alongside.
func (h *Handler) lastQuotes(ctx context.Context, pairs []string) (map[string]float64, error) {
	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		lastErr error
		sem     = make(chan struct{}, quoteConcurrency)
		results = make(map[string]float64, len(pairs))
	)

	for _, pair := range pairs {
		wg.Add(1)
		sem <- struct{}{}
		go func(pair string) {
			defer func() {
				<-sem
				wg.Done()
			}()

			quote, err := h.exc.LastQuote(ctx, pair)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				lastErr = fmt.Errorf("%s: %w", pair, err)
				return
			}
			results[pair] = quote
		}(pair)
	}
	wg.Wait()

	return results, lastErr
}

func (h *Handler) HandleMarketTickers(w http.ResponseWriter, r *http.Request) {
	pairs := parsePairs(r.URL.Query().Get("pairs"))
	if len(pairs) == 0 {
		pairs = defaultTickerPairs
	}

	results, err := h.lastQuotes(r.Context(), pairs)
	if err != nil {
		log.Errorf("fetch tickers: %v", err)
	}

	// Partial results are fine (the UI shows what it got); no price at all is
	// an upstream failure.
	if len(results) == 0 && err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("fetch tickers: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, results)
}

func (h *Handler) HandleMarketCandles(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	pair := "BTCUSDT"
	if pairs := parsePairs(query.Get("pair")); len(pairs) > 0 {
		pair = pairs[0]
	}

	timeframe := query.Get("timeframe")
	if timeframe == "" {
		timeframe = "1d"
	}
	if _, ok := timeframeDuration(timeframe); !ok {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid timeframe %q", timeframe))
		return
	}

	limit := 100
	if raw := query.Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > maxCandleLimit {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("limit must be an integer between 1 and %d", maxCandleLimit))
			return
		}
		limit = value
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
	amounts := make(map[string]float64)
	pairs := make([]string, 0)

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

		amounts[bal.Asset] = amount
		pairs = append(pairs, bal.Asset+"USDT")
	}

	// Assets without a USDT market (or whose quote failed) are left out.
	quotes, err := h.lastQuotes(r.Context(), pairs)
	if err != nil {
		log.Warnf("portfolio quotes: %v", err)
	}

	for asset, amount := range amounts {
		quote := quotes[asset+"USDT"]
		if quote <= 0 {
			continue
		}
		// Only include assets with a reasonable value (e.g. > $1)
		if valueUSDT := amount * quote; valueUSDT > 1.0 {
			totalUSDT += valueUSDT
			assets = append(assets, assetBalance{Asset: asset, ValueUSDT: valueUSDT})
		}
	}

	writeJSON(w, http.StatusOK, PortfolioResponse{
		TotalValueUSDT: totalUSDT,
		Assets:         assets,
	})
}
