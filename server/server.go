package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/glebarez/sqlite"
	exbinance "github.com/rodrigo-brito/ninjabot/exchange/binance"
	"github.com/rodrigo-brito/ninjabot/plot"
	serverhandler "github.com/rodrigo-brito/ninjabot/server/handler"
	serverws "github.com/rodrigo-brito/ninjabot/server/ws"
	storagesqlite "github.com/rodrigo-brito/ninjabot/storage/sqlite"
	"gorm.io/gorm"
)

type Server struct {
	handler *serverhandler.Handler
}

func NewServer(chart *plot.Chart, cfg Config) (*Server, error) {
	exc, _ := exbinance.NewBinance(context.Background(), exbinance.WithBinanceCredentials(cfg.APIKey, cfg.APISecret))
	wsManager := serverws.NewMarketWebsocketManager()

	defaultPairs := []string{"BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"}
	go wsManager.StartTickerSubscription(defaultPairs)

	pairsData := make(map[string]serverhandler.PairInfo)
	fileData, err := os.ReadFile("exchange/pairs.json")
	if err == nil {
		if err := json.Unmarshal(fileData, &pairsData); err != nil {
			fmt.Printf("Warning: Could not parse pairs.json: %v\n", err)
		}
	} else {
		fmt.Printf("Warning: Could not load pairs.json: %v\n", err)
	}

	var isTrading func(string) bool
	if exc != nil {
		isTrading = exc.IsTrading
	}
	pairsData = tradablePairs(pairsData, isTrading)

	dbStorage, err := storagesqlite.FromSQL(sqlite.Open(cfg.DBPath), &gorm.Config{})
	if err != nil {
		fmt.Printf("Warning: Could not initialize SQLite database: %v\n", err)
	}

	h := serverhandler.New(chart, exc, wsManager, pairsData, dbStorage)

	return &Server{handler: h}, nil
}

func (s *Server) Start(ctx context.Context, port int) error {
	mux := SetupRouter(s.handler)

	httpServer := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	go func() {
		<-ctx.Done()
		_ = httpServer.Shutdown(context.Background())
	}()

	fmt.Printf("UI → http://localhost:%d\n", port)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// tradablePairs drops pairs the web app cannot use: delivery futures
// contracts (e.g. "BTCUSDT_260327") and, when isTrading is known, every symbol
// that is not currently trading on Binance spot (delisted pairs, leveraged
// tokens, futures-only symbols such as "1000PEPEUSDT"). Backtests and realtime
// signals both read spot klines.
func tradablePairs(pairs map[string]serverhandler.PairInfo, isTrading func(string) bool) map[string]serverhandler.PairInfo {
	result := make(map[string]serverhandler.PairInfo, len(pairs))
	for pair, info := range pairs {
		if strings.Contains(pair, "_") {
			continue
		}
		if isTrading != nil && !isTrading(pair) {
			continue
		}
		result[pair] = info
	}
	return result
}
