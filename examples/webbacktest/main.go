package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"math"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	ninjabot "github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/download"
	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/indicator"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/plot"
	plotindicator "github.com/rodrigo-brito/ninjabot/plot/indicator"
	"github.com/rodrigo-brito/ninjabot/service"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/tools/log"
	"github.com/rodrigo-brito/ninjabot/tools/metrics"
)

// ─── Configurable CrossEMA strategy ──────────────────────────────────────────

type crossEMA struct {
	timeframe  string
	fastPeriod int
	slowPeriod int
}

func (e *crossEMA) Timeframe() string { return e.timeframe }
func (e *crossEMA) WarmupPeriod() int { return e.slowPeriod + 1 }

func (e *crossEMA) Indicators(df *model.Dataframe) []strategy.ChartIndicator {
	fastKey := fmt.Sprintf("ema%d", e.fastPeriod)
	slowKey := fmt.Sprintf("sma%d", e.slowPeriod)
	df.Metadata[fastKey] = indicator.EMA(df.Close, e.fastPeriod)
	df.Metadata[slowKey] = indicator.SMA(df.Close, e.slowPeriod)

	return []strategy.ChartIndicator{
		{
			Overlay:   true,
			GroupName: "Moving Averages",
			Time:      df.Time,
			Metrics: []strategy.IndicatorMetric{
				{
					Values: df.Metadata[fastKey],
					Name:   fmt.Sprintf("EMA %d", e.fastPeriod),
					Color:  "#ef4444",
					Style:  strategy.StyleLine,
				},
				{
					Values: df.Metadata[slowKey],
					Name:   fmt.Sprintf("SMA %d", e.slowPeriod),
					Color:  "#3b82f6",
					Style:  strategy.StyleLine,
				},
			},
		},
	}
}

func (e *crossEMA) OnCandle(df *model.Dataframe, broker service.Broker) {
	fastKey := fmt.Sprintf("ema%d", e.fastPeriod)
	slowKey := fmt.Sprintf("sma%d", e.slowPeriod)

	closePrice := df.Close.Last(0)
	assetPosition, quotePosition, err := broker.Position(df.Pair)
	if err != nil {
		log.Error(err)
		return
	}

	if quotePosition >= 10 && df.Metadata[fastKey].Crossover(df.Metadata[slowKey]) {
		amount := quotePosition / closePrice
		if _, err := broker.CreateOrderMarket(ninjabot.SideTypeBuy, df.Pair, amount); err != nil {
			log.Error(err)
		}
		return
	}

	if assetPosition > 0 && df.Metadata[fastKey].Crossunder(df.Metadata[slowKey]) {
		if _, err := broker.CreateOrderMarket(ninjabot.SideTypeSell, df.Pair, assetPosition); err != nil {
			log.Error(err)
		}
	}
}

// ─── Server ───────────────────────────────────────────────────────────────────

type backtestRequest struct {
	Pairs          string  `json:"pairs"`
	Timeframe      string  `json:"timeframe"`
	Days           int     `json:"days"`
	InitialCapital float64 `json:"initial_capital"`
	FastPeriod     int     `json:"fast_period"`
	SlowPeriod     int     `json:"slow_period"`
}

type backtestResponse struct {
	Pairs []string `json:"pairs,omitempty"`
	Error string   `json:"error,omitempty"`
}

// ─── Summary JSON types ───────────────────────────────────────────────────────

type summaryStat struct {
	StrategyInfo    string         `json:"strategy_info"`
	BaseCoin        string         `json:"base_coin"`
	InitialCapital  float64        `json:"initial_capital"`
	FinalPortfolio  float64        `json:"final_portfolio"`
	GrossProfit     float64        `json:"gross_profit"`
	GrossProfitPct  float64        `json:"gross_profit_pct"`
	MaxDrawdownPct  float64        `json:"max_drawdown_pct"`
	TotalTrades     int            `json:"total_trades"`
	TotalWins       int            `json:"total_wins"`
	TotalLosses     int            `json:"total_losses"`
	TotalProfit     float64        `json:"total_profit"`
	TotalVolume     float64        `json:"total_volume"`
	WinRate         float64        `json:"win_rate"`
	AvgPayoff       float64        `json:"avg_payoff"`
	AvgProfitFactor float64        `json:"avg_profit_factor"`
	AvgSQN          float64        `json:"avg_sqn"`
	Pairs           []pairStat     `json:"pairs"`
	ReturnBuckets   []returnBucket `json:"return_buckets"`
	FinalAssets     []assetBalance `json:"final_assets"`
	BaseBalance     float64        `json:"base_balance"`
}

type pairStat struct {
	Pair          string  `json:"pair"`
	Trades        int     `json:"trades"`
	Win           int     `json:"win"`
	Loss          int     `json:"loss"`
	WinPct        float64 `json:"win_pct"`
	Payoff        float64 `json:"payoff"`
	ProfitFactor  float64 `json:"profit_factor"`
	SQN           float64 `json:"sqn"`
	Profit        float64 `json:"profit"`
	Volume        float64 `json:"volume"`
	CIReturnMean  float64 `json:"ci_return_mean"`
	CIReturnLower float64 `json:"ci_return_lower"`
	CIReturnUpper float64 `json:"ci_return_upper"`
	CIPayoffMean  float64 `json:"ci_payoff_mean"`
	CIPayoffLower float64 `json:"ci_payoff_lower"`
	CIPayoffUpper float64 `json:"ci_payoff_upper"`
	CIPFMean      float64 `json:"ci_pf_mean"`
	CIPFLower     float64 `json:"ci_pf_lower"`
	CIPFUpper     float64 `json:"ci_pf_upper"`
}

type returnBucket struct {
	Label string  `json:"label"`
	From  float64 `json:"from"`
	To    float64 `json:"to"`
	Count int     `json:"count"`
	Pct   float64 `json:"pct"`
}

type assetBalance struct {
	Asset     string  `json:"asset"`
	ValueUSDT float64 `json:"value_usdt"`
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
func computeSummary(bot *ninjabot.NinjaBot, wallet *exchange.PaperWallet, req backtestRequest, pairs []string) json.RawMessage {
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

	winRate, avgPayoff, avgPF, avgSQN := 0.0, 0.0, 0.0, 0.0
	if totalTrades > 0 {
		winRate = float64(totalWins) / float64(totalTrades) * 100
	}
	if totalWeightedCount > 0 {
		avgPayoff = totalPayoffWeighted / float64(totalWeightedCount)
		avgPF = totalPFWeighted / float64(totalWeightedCount)
	}
	if n := len(ctrl.Results); n > 0 {
		avgSQN = totalSQN / float64(n)
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

	data := summaryStat{
		StrategyInfo:    fmt.Sprintf("EMA Crossover (Fast=%d, Slow=%d) │ Timeframe: %s │ History: %d days", req.FastPeriod, req.SlowPeriod, req.Timeframe, req.Days),
		BaseCoin:        "USDT",
		InitialCapital:  initialCapital,
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

	b, err := json.Marshal(data)
	if err != nil {
		log.Errorf("marshal summary: %v", err)
		return nil
	}
	return b
}

type server struct {
	mu          sync.Mutex
	running     bool
	chart       *plot.Chart
	formTpl     *template.Template
	summaryJSON json.RawMessage // protected by mu
}

func newServer(chart *plot.Chart) (*server, error) {
	tpl, err := template.New("form").Parse(formHTML)
	if err != nil {
		return nil, fmt.Errorf("parse form template: %w", err)
	}
	return &server{chart: chart, formTpl: tpl}, nil
}

// handleSummary serves the structured backtest summary as JSON.
// Returns 404 if no backtest has been run yet.
func (s *server) handleSummary(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	data := s.summaryJSON
	s.mu.Unlock()

	if data == nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(data)
}

// handleRoot serves the backtest form. If a ?pair= query param is present it
// redirects to /chart (classic view), so that the "Classic View" link in the
// enhanced chart still works.
func (s *server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if pair := r.URL.Query().Get("pair"); pair != "" {
		http.Redirect(w, r, "/chart?pair="+pair, http.StatusFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.formTpl.Execute(w, nil); err != nil {
		log.Errorf("render form: %v", err)
	}
}

// handleBacktest receives POST /api/backtest, downloads historical data,
// runs the simulation, and returns the list of pairs to redirect to.
func (s *server) handleBacktest(w http.ResponseWriter, r *http.Request) {
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
	if req.Timeframe == "" {
		req.Timeframe = "1h"
	}
	if req.Days <= 0 {
		req.Days = 30
	}
	if req.InitialCapital <= 0 {
		req.InitialCapital = 10_000
	}
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

	// Serialize: only one backtest at a time.
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		writeJSON(w, http.StatusConflict, backtestResponse{Error: "a backtest is already running, please wait"})
		return
	}
	s.running = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.running = false
		s.mu.Unlock()
	}()

	req.Pairs = strings.Join(pairs, ",") // store normalised pairs
	if err := s.runBacktest(r.Context(), req, pairs); err != nil {
		writeJSON(w, http.StatusInternalServerError, backtestResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, backtestResponse{Pairs: pairs})
}

func (s *server) runBacktest(ctx context.Context, req backtestRequest, pairs []string) error {
	// Create a temp directory to hold downloaded CSV files.
	tmpDir, err := os.MkdirTemp("", "ninjabot-backtest-*")
	if err != nil {
		return fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Use Binance public API (no credentials needed for historical klines).
	exc, err := exchange.NewBinance(ctx)
	if err != nil {
		return fmt.Errorf("init exchange: %w", err)
	}
	downloader := download.NewDownloader(exc)

	start := time.Now().AddDate(0, 0, -req.Days)
	end := time.Now()

	pairFeeds := make([]exchange.PairFeed, 0, len(pairs))
	for _, pair := range pairs {
		csvFile := fmt.Sprintf("%s/%s.csv", tmpDir, pair)
		if err := downloader.Download(ctx, pair, req.Timeframe, csvFile,
			download.WithInterval(start, end),
		); err != nil {
			return fmt.Errorf("download %s: %w", pair, err)
		}
		pairFeeds = append(pairFeeds, exchange.PairFeed{
			Pair:      pair,
			File:      csvFile,
			Timeframe: req.Timeframe,
		})
	}

	strat := &crossEMA{
		timeframe:  req.Timeframe,
		fastPeriod: req.FastPeriod,
		slowPeriod: req.SlowPeriod,
	}

	csvFeed, err := exchange.NewCSVFeed(strat.Timeframe(), pairFeeds...)
	if err != nil {
		return fmt.Errorf("create csv feed: %w", err)
	}

	store, err := storage.FromMemory()
	if err != nil {
		return fmt.Errorf("create storage: %w", err)
	}

	wallet := exchange.NewPaperWallet(
		ctx,
		"USDT",
		exchange.WithPaperAsset("USDT", req.InitialCapital),
		exchange.WithDataFeed(csvFeed),
	)

	// Reset chart and attach the new strategy / wallet before bot.Run() so
	// that OnCandle and OnOrder callbacks populate the correct data.
	s.chart.Reset()
	s.chart.SetStrategy(strat)
	s.chart.SetPaperWallet(wallet)

	settings := ninjabot.Settings{Pairs: pairs}

	bot, err := ninjabot.NewBot(
		ctx,
		settings,
		wallet,
		strat,
		ninjabot.WithBacktest(wallet),
		ninjabot.WithStorage(store),
		ninjabot.WithCandleSubscription(s.chart),
		ninjabot.WithOrderSubscription(s.chart),
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
	summary := computeSummary(bot, wallet, req, pairs)
	s.mu.Lock()
	s.summaryJSON = summary
	s.mu.Unlock()

	return nil
}

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
	fmt.Printf("Enhanced chart → http://localhost:%d/enhanced\n", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), mux); err != nil {
		log.Fatal(err)
	}
}

// ─── Form HTML ────────────────────────────────────────────────────────────────

const formHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>NinjaBot — Backtest</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg-primary:#0a0e27;--bg-secondary:#151932;--bg-card:#1a1f3a;
  --border-color:#2a2f4a;--text-primary:#e4e7eb;--text-secondary:#9ca3af;
  --accent-green:#10b981;--accent-red:#ef4444;--accent-blue:#3b82f6;
  --accent-purple:#8b5cf6;--accent-yellow:#f59e0b;
}
body{font-family:'Inter',sans-serif;background:var(--bg-primary);color:var(--text-primary);min-height:100vh;display:flex;flex-direction:column}
header{background:var(--bg-secondary);border-bottom:1px solid var(--border-color);padding:1rem 2rem;display:flex;align-items:center;gap:1rem}
.logo{font-size:1.4rem;font-weight:700;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.logo::before{content:"🥷 ";font-size:1.6rem}
main{flex:1;display:flex;justify-content:center;align-items:flex-start;padding:2.5rem 1rem}
.card{background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:2rem 2.5rem;width:100%;max-width:580px;box-shadow:0 8px 32px rgba(0,0,0,.4)}
h1{font-size:1.4rem;font-weight:600;margin-bottom:0.25rem}
.subtitle{color:var(--text-secondary);font-size:.875rem;margin-bottom:2rem}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.field{display:flex;flex-direction:column;gap:.4rem}
.field.full{grid-column:1/-1}
label{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary)}
input,select{background:var(--bg-primary);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-family:inherit;font-size:.9rem;padding:.6rem .85rem;width:100%;transition:border-color .2s}
input:focus,select:focus{outline:none;border-color:var(--accent-blue)}
select option{background:var(--bg-secondary)}
.hint{font-size:.75rem;color:var(--text-secondary);margin-top:.2rem}
.divider{grid-column:1/-1;height:1px;background:var(--border-color);margin:.5rem 0}
.section-title{grid-column:1/-1;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent-purple);margin-top:.25rem}
button[type=submit]{width:100%;margin-top:1.75rem;padding:.85rem;font-size:1rem;font-weight:600;border:none;border-radius:10px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));color:#fff;cursor:pointer;transition:opacity .2s,transform .2s;position:relative}
button[type=submit]:hover:not(:disabled){opacity:.9;transform:translateY(-1px)}
button[type=submit]:disabled{opacity:.6;cursor:not-allowed;transform:none}
.spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;margin-right:.5rem;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.alert{padding:.85rem 1rem;border-radius:8px;font-size:.875rem;margin-top:1rem;display:none}
.alert-error{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:#fca5a5}
.alert-info{background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.35);color:#93c5fd}
</style>
</head>
<body>
<header>
  <span class="logo">NinjaBot Analytics</span>
  <span style="color:var(--text-secondary);font-size:.875rem">— Backtest Configuration</span>
</header>
<main>
  <div class="card">
    <h1>Configure Backtest</h1>
    <p class="subtitle">Run a simulation with historical data and view results on the analytics chart.</p>
    <form id="form">
      <div class="grid">

        <div class="field full">
          <label>Trading Pairs <span style="color:var(--text-secondary)">(comma-separated)</span></label>
          <input name="pairs" value="BTCUSDT,ETHUSDT" placeholder="BTCUSDT, ETHUSDT, SOLUSDT" required/>
          <span class="hint">Uses Binance public API — no API key needed.</span>
        </div>

        <div class="field">
          <label>Timeframe</label>
          <select name="timeframe">
            <option value="15m">15 minutes</option>
            <option value="30m">30 minutes</option>
            <option value="1h" selected>1 hour</option>
            <option value="2h">2 hours</option>
            <option value="4h">4 hours</option>
            <option value="6h">6 hours</option>
            <option value="12h">12 hours</option>
            <option value="1d">1 day</option>
          </select>
        </div>

        <div class="field">
          <label>History (days)</label>
          <input name="days" type="number" value="60" min="7" max="365"/>
        </div>

        <div class="field full">
          <label>Initial Capital (USDT)</label>
          <input name="initial_capital" type="number" value="10000" min="100" step="100"/>
        </div>

        <div class="divider"></div>
        <div class="section-title">Strategy — EMA Crossover</div>

        <div class="field">
          <label>Fast Period (EMA)</label>
          <input name="fast_period" type="number" value="8" min="2" max="100"/>
          <span class="hint">Buy when EMA crosses above SMA.</span>
        </div>

        <div class="field">
          <label>Slow Period (SMA)</label>
          <input name="slow_period" type="number" value="21" min="3" max="200"/>
          <span class="hint">Sell when EMA crosses below SMA.</span>
        </div>

      </div><!-- /grid -->

      <div class="alert alert-error" id="err-box"></div>
      <div class="alert alert-info" id="info-box"></div>

      <button type="submit" id="btn">Run Backtest</button>
    </form>
  </div>
</main>
<script>
const form = document.getElementById('form');
const btn  = document.getElementById('btn');
const errBox  = document.getElementById('err-box');
const infoBox = document.getElementById('info-box');

function showError(msg) {
  errBox.textContent = '⚠ ' + msg;
  errBox.style.display = 'block';
  infoBox.style.display = 'none';
}
function showInfo(msg) {
  infoBox.textContent = msg;
  infoBox.style.display = 'block';
  errBox.style.display = 'none';
}
function hideAlerts() {
  errBox.style.display = 'none';
  infoBox.style.display = 'none';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlerts();

  const data = Object.fromEntries(new FormData(form).entries());
  const payload = {
    pairs:           data.pairs,
    timeframe:       data.timeframe,
    days:            parseInt(data.days, 10),
    initial_capital: parseFloat(data.initial_capital),
    fast_period:     parseInt(data.fast_period, 10),
    slow_period:     parseInt(data.slow_period, 10),
  };

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Downloading & running…';
  showInfo('Fetching candles from Binance and running simulation. This may take a few seconds…');

  try {
    const res = await fetch('/api/backtest', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      showError(json.error || 'Unknown server error');
      return;
    }

    const firstPair = json.pairs && json.pairs[0];
    showInfo('Backtest complete! Redirecting to chart…');
    setTimeout(() => {
      window.location.href = '/enhanced?pair=' + (firstPair || '');
    }, 600);
  } catch (err) {
    showError('Network error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Run Backtest';
  }
});
</script>
</body>
</html>`
