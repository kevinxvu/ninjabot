package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	ninjabot "github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/download"
	"github.com/rodrigo-brito/ninjabot/exchange"
	exbinance "github.com/rodrigo-brito/ninjabot/exchange/binance"
	exfeed "github.com/rodrigo-brito/ninjabot/exchange/feed"
	expaperwallet "github.com/rodrigo-brito/ninjabot/exchange/paperwallet"
	storagebuntdb "github.com/rodrigo-brito/ninjabot/storage/buntdb"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies"
	"github.com/rodrigo-brito/ninjabot/tools/log"
	"github.com/rodrigo-brito/ninjabot/tools/metrics"
)

// backtestTimeout bounds a single backtest run. The run is detached from the
// HTTP request so a client disconnect does not abort it halfway.
const backtestTimeout = 30 * time.Minute

// HandleBacktest receives POST /api/backtest, downloads historical data,
// runs the simulation, and returns the list of pairs to redirect to.
func (h *Handler) HandleBacktest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req backtestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, backtestResponse{Error: "invalid request body"})
		return
	}

	// Validate and normalise input.
	pairs := parsePairs(req.Pairs)
	if len(pairs) == 0 {
		writeJSON(w, http.StatusBadRequest, backtestResponse{Error: "at least one pair is required"})
		return
	}

	if req.Strategy == "" {
		req.Strategy = "emacross"
	}

	// Force timeframe based on strategy
	switch req.Strategy {
	case "ocosell", "dca":
		req.Timeframe = "1d"
	case "trailingstop", "turtle":
		req.Timeframe = "4h"
	default: // emacross
		if req.Timeframe == "" {
			req.Timeframe = "1h"
		}
	}

	if req.Days <= 0 {
		req.Days = 30
	}
	if req.InitialCapital <= 0 {
		req.InitialCapital = 10_000
	}

	// Validate EMA parameters if strategy is emacross
	if req.Strategy == "emacross" {
		if req.FastPeriod <= 0 {
			req.FastPeriod = 8
		}
		if req.SlowPeriod <= 0 {
			req.SlowPeriod = 21
		}
		if req.FastPeriod >= req.SlowPeriod {
			writeJSON(w, http.StatusBadRequest, backtestResponse{Error: "fast_period must be less than slow_period"})
			return
		}
	}

	// Validate DCA parameters if strategy is dca
	if req.Strategy == "dca" {
		if req.DCAInterval <= 0 {
			req.DCAInterval = 7
		}
		if req.DCABuyAmount <= 0 {
			req.DCABuyAmount = 100
		}
	}

	// Serialize: only one backtest at a time.
	h.mu.Lock()
	if h.running {
		h.mu.Unlock()
		writeJSON(w, http.StatusConflict, backtestResponse{Error: "a backtest is already running, please wait"})
		return
	}
	h.running = true
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		h.running = false
		h.mu.Unlock()
	}()

	req.Pairs = strings.Join(pairs, ",") // store normalised pairs

	// Drop the previous result up front so /api/data and /api/summary never
	// describe two different runs.
	h.mu.Lock()
	h.summaryJSON = nil
	h.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), backtestTimeout)
	defer cancel()

	if err := h.runBacktest(ctx, req, pairs); err != nil {
		h.chart.Reset()
		writeJSON(w, http.StatusInternalServerError, backtestResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, backtestResponse{Pairs: pairs})
}

func (h *Handler) runBacktest(ctx context.Context, req backtestRequest, pairs []string) error {
	// Create a temp directory to hold downloaded CSV files.
	tmpDir, err := os.MkdirTemp("", "ninjabot-backtest-*")
	if err != nil {
		return fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Use Binance public API (no credentials needed for historical klines).
	exc, err := exbinance.NewBinance(ctx)
	if err != nil {
		return fmt.Errorf("init exchange: %w", err)
	}
	downloader := download.NewDownloader(exc)

	start := time.Now().AddDate(0, 0, -req.Days)
	end := time.Now()

	pairFeeds := make([]exfeed.PairFeed, 0, len(pairs))
	for _, pair := range pairs {
		csvFile := fmt.Sprintf("%s/%s.csv", tmpDir, pair)
		if err := downloader.Download(ctx, pair, req.Timeframe, csvFile,
			download.WithInterval(start, end),
		); err != nil {
			return fmt.Errorf("download %s: %w", pair, err)
		}
		pairFeeds = append(pairFeeds, exfeed.PairFeed{
			Pair:      pair,
			File:      csvFile,
			Timeframe: req.Timeframe,
		})
	}

	var strat strategy.Strategy
	switch req.Strategy {
	case "ocosell":
		strat = new(strategies.OCOSell)
	case "trailingstop":
		strat = strategies.NewTrailing(pairs)
	case "turtle":
		strat = new(strategies.Turtle)
	case "dca":
		strat = strategies.NewDCA(req.Timeframe, req.DCAInterval, req.DCABuyAmount)
	default:
		strat = strategies.NewCrossEMA(req.Timeframe, req.FastPeriod, req.SlowPeriod)
	}

	csvFeed, err := exfeed.NewCSVFeed(strat.Timeframe(), pairFeeds...)
	if err != nil {
		return fmt.Errorf("create csv feed: %w", err)
	}

	store, err := storagebuntdb.FromMemory()
	if err != nil {
		return fmt.Errorf("create storage: %w", err)
	}

	wallet := expaperwallet.NewPaperWallet(
		ctx,
		"USDT",
		expaperwallet.WithPaperAsset("USDT", req.InitialCapital),
		expaperwallet.WithDataFeed(csvFeed),
	)

	// Reset chart and attach the new strategy / wallet before bot.Run() so
	// that OnCandle and OnOrder callbacks populate the correct data.
	h.chart.Reset()
	h.chart.SetStrategy(strat)
	h.chart.SetPaperWallet(wallet)

	settings := ninjabot.Settings{Pairs: pairs}

	bot, err := ninjabot.NewBot(
		ctx,
		settings,
		wallet,
		strat,
		ninjabot.WithBacktest(wallet),
		ninjabot.WithStorage(store),
		ninjabot.WithCandleSubscription(h.chart),
		ninjabot.WithOrderSubscription(h.chart),
		ninjabot.WithLogLevel(log.WarnLevel),
	)
	if err != nil {
		return fmt.Errorf("create bot: %w", err)
	}

	if err := bot.Run(ctx); err != nil {
		return fmt.Errorf("run backtest: %w", err)
	}

	bot.Summary()

	// Compute and store structured summary for /api/summary.
	summary, err := computeSummary(bot, wallet, req, pairs)
	if err != nil {
		return err
	}
	h.mu.Lock()
	h.summaryJSON = summary
	h.mu.Unlock()

	return nil
}

// computeHistogram divides returns (as fractions, e.g. 0.032 = 3.2%) into
// numBuckets equal-width bins and returns each bin's %count and display label.
func computeHistogram(returns []float64, numBuckets int) []returnBucket {
	if len(returns) == 0 || numBuckets <= 0 {
		return nil
	}

	sorted := make([]float64, len(returns))
	copy(sorted, returns)
	sort.Float64s(sorted)

	minVal := sorted[0] * 100
	maxVal := sorted[len(sorted)-1] * 100

	if minVal == maxVal {
		return []returnBucket{{
			Label: fmt.Sprintf("%.2f%%", minVal),
			From:  minVal, To: maxVal,
			Count: len(returns), Pct: 100,
		}}
	}

	width := (maxVal - minVal) / float64(numBuckets)
	buckets := make([]returnBucket, numBuckets)
	for i := range buckets {
		from := minVal + float64(i)*width
		to := minVal + float64(i+1)*width
		buckets[i] = returnBucket{
			Label: fmt.Sprintf("%.1f / %.1f", from, to),
			From:  math.Round(from*100) / 100,
			To:    math.Round(to*100) / 100,
		}
	}

	for _, r := range returns {
		pct := r * 100
		idx := int((pct - minVal) / width)
		if idx >= numBuckets {
			idx = numBuckets - 1
		}
		if idx < 0 {
			idx = 0
		}
		buckets[idx].Count++
	}

	total := len(returns)
	for i := range buckets {
		buckets[i].Pct = math.Round(float64(buckets[i].Count)/float64(total)*1000) / 10
	}
	return buckets
}

// computeSummary builds the full structured summary from the bot results and wallet.
func computeSummary(bot *ninjabot.NinjaBot, wallet *expaperwallet.PaperWallet, req backtestRequest, pairs []string) (json.RawMessage, error) {
	ctrl := bot.Controller()
	equityValues := wallet.EquityValues()

	initialCapital := req.InitialCapital
	finalPortfolio := initialCapital
	if len(equityValues) > 0 {
		finalPortfolio = equityValues[len(equityValues)-1].Value
	}
	grossProfit := finalPortfolio - initialCapital
	grossProfitPct := 0.0
	if initialCapital > 0 {
		grossProfitPct = grossProfit / initialCapital * 100
	}
	maxDD, _, _ := wallet.MaxDrawdown()

	var (
		totalTrades         int
		totalWins           int
		totalLosses         int
		totalProfit         float64
		totalVolume         float64
		totalSQN            float64
		totalPayoffWeighted float64
		totalPFWeighted     float64
		totalWeightedCount  int
		allReturns          []float64
	)

	pairStats := make([]pairStat, 0, len(ctrl.Results))
	for pair, sm := range ctrl.Results {
		wins := sm.Win()
		loses := sm.Lose()
		returns := append(sm.WinPercent(), sm.LosePercent()...)
		trades := len(wins) + len(loses)

		var ciReturn, ciPayoff, ciPF metrics.BootstrapInterval
		if len(returns) > 0 {
			ciReturn = metrics.Bootstrap(returns, metrics.Mean, 10000, 0.95)
			ciPayoff = metrics.Bootstrap(returns, metrics.Payoff, 10000, 0.95)
			ciPF = metrics.Bootstrap(returns, metrics.ProfitFactor, 10000, 0.95)
		}

		pairStats = append(pairStats, pairStat{
			Pair:          pair,
			Trades:        trades,
			Win:           len(wins),
			Loss:          len(loses),
			WinPct:        sm.WinPercentage(),
			Payoff:        sm.Payoff(),
			ProfitFactor:  sm.ProfitFactor(),
			SQN:           sm.SQN(),
			Profit:        sm.Profit(),
			Volume:        sm.Volume,
			CIReturnMean:  ciReturn.Mean * 100,
			CIReturnLower: ciReturn.Lower * 100,
			CIReturnUpper: ciReturn.Upper * 100,
			CIPayoffMean:  ciPayoff.Mean,
			CIPayoffLower: ciPayoff.Lower,
			CIPayoffUpper: ciPayoff.Upper,
			CIPFMean:      ciPF.Mean,
			CIPFLower:     ciPF.Lower,
			CIPFUpper:     ciPF.Upper,
			AvgEntryPrice: wallet.AvgLongPrice(pair),
		})

		totalTrades += trades
		totalWins += len(wins)
		totalLosses += len(loses)
		totalProfit += sm.Profit()
		totalVolume += sm.Volume
		totalSQN += sm.SQN()
		totalPayoffWeighted += sm.Payoff() * float64(trades)
		totalPFWeighted += sm.ProfitFactor() * float64(trades)
		totalWeightedCount += trades
		allReturns = append(allReturns, returns...)
	}

	sort.Slice(pairStats, func(i, j int) bool { return pairStats[i].Pair < pairStats[j].Pair })

	winRate := 0.0
	if totalTrades > 0 {
		winRate = float64(totalWins) / float64(totalTrades) * 100
	}
	avgPayoff := 0.0
	avgPF := 0.0
	if totalWeightedCount > 0 {
		avgPayoff = totalPayoffWeighted / float64(totalWeightedCount)
		avgPF = totalPFWeighted / float64(totalWeightedCount)
	}
	avgSQN := 0.0
	if len(ctrl.Results) > 0 {
		avgSQN = totalSQN / float64(len(ctrl.Results))
	}

	// Final asset balances: last value from AssetValues (value in USDT)
	finalAssets := make([]assetBalance, 0, len(pairs))
	totalAssetValue := 0.0
	for _, pair := range pairs {
		asset, _ := exchange.SplitAssetQuote(pair)
		vals := wallet.AssetValues(asset)
		val := 0.0
		if len(vals) > 0 {
			val = vals[len(vals)-1].Value
		}
		finalAssets = append(finalAssets, assetBalance{Asset: asset, ValueUSDT: val})
		totalAssetValue += val
	}
	baseBalance := finalPortfolio - totalAssetValue

	// Build strategy info string
	strategyTitle := "EMA Crossover"
	if req.Strategy == "ocosell" {
		strategyTitle = "OCO Sell (Stochastic)"
	} else if req.Strategy == "trailingstop" {
		strategyTitle = "Trailing Stop"
	} else if req.Strategy == "turtle" {
		strategyTitle = "Turtle Trading"
	} else if req.Strategy == "dca" {
		strategyTitle = "DCA (Dollar Cost Averaging)"
	}

	strategyInfo := fmt.Sprintf("%s │ Timeframe: %s │ History: %d days", strategyTitle, req.Timeframe, req.Days)
	if req.Strategy == "emacross" {
		strategyInfo = fmt.Sprintf("%s (Fast=%d, Slow=%d) │ Timeframe: %s │ History: %d days", strategyTitle, req.FastPeriod, req.SlowPeriod, req.Timeframe, req.Days)
	} else if req.Strategy == "dca" {
		strategyInfo = fmt.Sprintf("%s (Interval=%d days, Buy=%.2f USDT) │ Timeframe: %s │ History: %d days", strategyTitle, req.DCAInterval, req.DCABuyAmount, req.Timeframe, req.Days)
	}

	baseCoin := "USDT"
	if len(pairs) > 0 {
		_, baseCoin = exchange.SplitAssetQuote(pairs[0])
	}

	data := summaryStat{
		StrategyInfo:    strategyInfo,
		BaseCoin:        baseCoin,
		InitialCapital:  math.Round(initialCapital*100) / 100,
		FinalPortfolio:  math.Round(finalPortfolio*100) / 100,
		GrossProfit:     math.Round(grossProfit*100) / 100,
		GrossProfitPct:  math.Round(grossProfitPct*100) / 100,
		MaxDrawdownPct:  math.Round(maxDD*10000) / 100,
		TotalTrades:     totalTrades,
		TotalWins:       totalWins,
		TotalLosses:     totalLosses,
		TotalProfit:     math.Round(totalProfit*100) / 100,
		TotalVolume:     math.Round(totalVolume*100) / 100,
		WinRate:         math.Round(winRate*10) / 10,
		AvgPayoff:       math.Round(avgPayoff*1000) / 1000,
		AvgProfitFactor: math.Round(avgPF*1000) / 1000,
		AvgSQN:          math.Round(avgSQN*10) / 10,
		Pairs:           pairStats,
		ReturnBuckets:   computeHistogram(allReturns, 15),
		FinalAssets:     finalAssets,
		BaseBalance:     math.Round(baseBalance*100) / 100,
	}

	// Always override baseCoin to USDT for correct summary display
	data.BaseCoin = "USDT"

	b, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("marshal summary: %w", err)
	}
	return b, nil
}
