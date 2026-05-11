package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	ninjabot "github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/download"
	"github.com/rodrigo-brito/ninjabot/examples/strategies"
	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/plot"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

type server struct {
	mu          sync.Mutex
	running     bool
	chart       *plot.Chart
	formTpl     *template.Template
	summaryJSON json.RawMessage // protected by mu
}

func newServer(chart *plot.Chart) (*server, error) {
	tpl, err := template.ParseFiles("plot/assets/form.html")
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
	
	if req.Strategy == "" {
		req.Strategy = "emacross"
	}
	
	// Force timeframe based on strategy
	switch req.Strategy {
	case "ocosell":
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

	var strat strategy.Strategy
	switch req.Strategy {
	case "ocosell":
		strat = new(strategies.OCOSell)
	case "trailingstop":
		strat = strategies.NewTrailing(pairs)
	case "turtle":
		strat = new(strategies.Turtle)
	default:
		strat = strategies.NewCrossEMA(req.Timeframe, req.FastPeriod, req.SlowPeriod)
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
