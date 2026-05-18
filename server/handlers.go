package server

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	ninjabot "github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/download"
	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

type drawdown struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
	Value string    `json:"value"`
}

func (s *Server) HandleHealth(w http.ResponseWriter, _ *http.Request) {
	if time.Since(s.chart.LastUpdate()) > time.Hour+10*time.Minute {
		_, err := w.Write([]byte(s.chart.LastUpdate().String()))
		if err != nil {
			log.Error(err)
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) HandleChartData(w http.ResponseWriter, r *http.Request) {
	pair := r.URL.Query().Get("pair")
	if pair == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-type", "text/json")

	var maxDrawdown *drawdown
	if s.chart.PaperWallet() != nil {
		value, start, end := s.chart.PaperWallet().MaxDrawdown()
		maxDrawdown = &drawdown{
			Start: start,
			End:   end,
			Value: fmt.Sprintf("%.1f", value*100),
		}
	}

	asset, quote := exchange.SplitAssetQuote(pair)
	assetValues, equityValues := s.chart.EquityValuesByPair(pair)
	err := json.NewEncoder(w).Encode(map[string]interface{}{
		"candles":       s.chart.CandlesByPair(pair),
		"indicators":    s.chart.IndicatorsByPair(pair),
		"shapes":        s.chart.ShapesByPair(pair),
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

func (s *Server) HandleTradingHistoryData(w http.ResponseWriter, r *http.Request) {
	pair := r.URL.Query().Get("pair")
	if pair == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.Header().Set("Content-type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment;filename=history_"+pair+".csv")
	w.Header().Set("Transfer-Encoding", "chunked")

	orders := s.chart.OrderStringByPair(pair)

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
func (s *Server) HandleSummary(w http.ResponseWriter, r *http.Request) {
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

// HandlePairs serves trading pair information.
// - If no "pairs" param is provided: returns { "pairs": ["BTCUSDT", "ETHUSDT", ...] }
// - If "pairs" param is provided (e.g. ?pairs=BTCUSDT,ETHUSDT): returns detailed mapping: { "BTCUSDT": {"Asset": "BTC", "Quote": "USDT", "Logo": "..."} }
func (s *Server) HandlePairs(w http.ResponseWriter, r *http.Request) {
	pairsParam := r.URL.Query().Get("pairs")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400")

	// 1. Trường hợp không truyền param: Trả về danh sách tên Pairs đơn giản từ file đã lọc
	if pairsParam == "" {
		var pairs []string
		s.mu.Lock()
		for p := range s.pairsData {
			pairs = append(pairs, p)
		}
		s.mu.Unlock()

		sort.Strings(pairs)

		if err := json.NewEncoder(w).Encode(map[string]interface{}{"pairs": pairs}); err != nil {
			log.Errorf("encode pairs: %v", err)
		}
		return
	}

	// 2. Trường hợp truyền param: Trả về Object chi tiết theo tên Pair được yêu cầu
	pairs := strings.Split(pairsParam, ",")
	result := make(map[string]interface{})

	s.mu.Lock()
	for _, p := range pairs {
		if data, ok := s.pairsData[p]; ok {
			result[p] = data
		}
	}
	s.mu.Unlock()

	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Errorf("encode pairs info: %v", err)
	}
}

// HandleBacktest receives POST /api/backtest, downloads historical data,
// runs the simulation, and returns the list of pairs to redirect to.
func (s *Server) HandleBacktest(w http.ResponseWriter, r *http.Request) {
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

func (s *Server) runBacktest(ctx context.Context, req backtestRequest, pairs []string) error {
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
	case "dca":
		strat = strategies.NewDCA(req.Timeframe, req.DCAInterval, req.DCABuyAmount)
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

func (s *Server) HandleMarketTickers(w http.ResponseWriter, r *http.Request) {
	pairsParam := r.URL.Query().Get("pairs")
	if pairsParam == "" {
		pairsParam = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT"
	}
	pairs := strings.Split(pairsParam, ",")

	results := make(map[string]float64)
	for _, pair := range pairs {
		quote, err := s.exc.LastQuote(r.Context(), pair)
		if err == nil {
			results[pair] = quote
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (s *Server) HandleMarketCandles(w http.ResponseWriter, r *http.Request) {
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

	candles, err := s.exc.CandlesByLimit(r.Context(), pair, timeframe, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(candles)
}

func (s *Server) HandleMarketPortfolio(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	acc, err := s.exc.Account()
	if err != nil {
		json.NewEncoder(w).Encode(PortfolioResponse{Error: err.Error()})
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
		quote, err := s.exc.LastQuote(r.Context(), pair)
		if err == nil && quote > 0 {
			valueUSDT := amount * quote
			// Only include assets with a reasonable value (e.g. > $1)
			if valueUSDT > 1.0 {
				totalUSDT += valueUSDT
				assets = append(assets, assetBalance{Asset: bal.Asset, ValueUSDT: valueUSDT})
			}
		}
	}

	json.NewEncoder(w).Encode(PortfolioResponse{
		TotalValueUSDT: totalUSDT,
		Assets:         assets,
	})
}

// HandleStartRealtimeSignal POST /api/realtime-signals/start
func (s *Server) HandleStartRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req StartSignalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	// Validate req
	if req.Pair == "" || req.Timeframe == "" || req.Strategy == "" || req.InitialAsset == "" || req.InitialAmount <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing required fields"})
		return
	}

	session, err := s.signalMgr.StartSession(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, session)
}

// HandleDeleteRealtimeSignal DELETE /api/realtime-signals/:id
func (s *Server) HandleDeleteRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract ID from path: /api/realtime-signals/{id}
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	sessionID := pathParts[3]

	// Must stop before delete
	s.signalMgr.StopSession(sessionID)

	// Delete from DB
	err := s.db.DeleteSession(sessionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// HandleStopRealtimeSignal POST /api/realtime-signals/:id/stop
func (s *Server) HandleStopRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract ID from path: /api/realtime-signals/{id}/stop
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	sessionID := pathParts[3]

	err := s.signalMgr.StopSession(sessionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// HandleResumeRealtimeSignal POST /api/realtime-signals/:id/resume
func (s *Server) HandleResumeRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract ID from path: /api/realtime-signals/{id}/resume
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	sessionID := pathParts[3]

	session, err := s.signalMgr.ResumeSession(r.Context(), sessionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, session)
}

// HandleListRealtimeSignals GET /api/realtime-signals
func (s *Server) HandleListRealtimeSignals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessions, err := s.db.GetSessionsByType("REALTIME_SIGNAL")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Enhance with current runtime status
	for _, sess := range sessions {
		s.signalMgr.mu.Lock()
		if _, ok := s.signalMgr.bots[sess.ID]; ok {
			sess.Status = "running"
		} else if sess.Status == "running" {
			// It's in DB as running but not in memory
			sess.Status = "stopped"
			s.db.UpdateSession(sess)
		}
		s.signalMgr.mu.Unlock()
	}

	writeJSON(w, http.StatusOK, sessions)
}

func (s *Server) HandleSessionChart(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	id := parts[2] // Lấy session ID từ URL

	chart, err := s.signalMgr.GetSessionChart(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	session, err := s.signalMgr.db.GetSessionByID(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-type", "application/json")

	asset, quote := exchange.SplitAssetQuote(session.Pair)
	assetValues, equityValues := chart.EquityValuesByPair(session.Pair)

	// Trả về JSON giống hệt với /api/data của backtesting
	json.NewEncoder(w).Encode(map[string]interface{}{
		"candles":       chart.CandlesByPair(session.Pair),
		"indicators":    chart.IndicatorsByPair(session.Pair),
		"shapes":        chart.ShapesByPair(session.Pair),
		"events":        sessionEventsForDisplay(session),
		"asset_values":  assetValues,
		"equity_values": equityValues,
		"quote":         quote,
		"asset":         asset,
	})
}

// HandleGetRealtimeSignal GET /api/realtime-signals/:id
func (s *Server) HandleGetRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract ID from path: /api/realtime-signals/{id}
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	sessionID := pathParts[3]

	session, err := s.db.GetSessionByID(sessionID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	// Update running status
	s.signalMgr.mu.Lock()
	if _, ok := s.signalMgr.bots[sessionID]; ok {
		session.Status = "running"
	}
	s.signalMgr.mu.Unlock()

	if session.Status == "running" {
		balances, err := s.signalMgr.GetSessionBalances(sessionID)
		if err == nil {
			session.Balances = balances
		}
	} else {
		// Calculate from orders if not running
		balancesMap := CalculateBalancesFromOrders(session)

		for asset, amount := range balancesMap {
			if amount > 0.00000001 {
				session.Balances = append(session.Balances, model.Balance{
					Asset: asset,
					Free:  amount,
					Lock:  0,
				})
			}
		}
	}
	session.Events = sessionEventsForDisplay(session)

	writeJSON(w, http.StatusOK, session)
}
