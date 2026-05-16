package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"

	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/plot"
)

type Server struct {
	mu          sync.Mutex
	running     bool
	chart       *plot.Chart
	summaryJSON json.RawMessage
	exc         *exchange.Binance
	wsManager   *MarketWebsocketManager
	pairsData   map[string]interface{}
}

func NewServer(chart *plot.Chart, cfg Config) (*Server, error) {
	exc, _ := exchange.NewBinance(context.Background(), exchange.WithBinanceCredentials(cfg.APIKey, cfg.APISecret))
	wsManager := NewMarketWebsocketManager()

	// Khởi chạy theo dõi Ticker mặc định
	defaultPairs := []string{"BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"}
	go wsManager.StartTickerSubscription(defaultPairs)

	// Tải dữ liệu các cặp giao dịch vào memory
	pairsData := make(map[string]interface{})
	fileData, err := os.ReadFile("exchange/pairs.json")
	if err == nil {
		json.Unmarshal(fileData, &pairsData)
	} else {
		fmt.Printf("Warning: Could not load pairs.json: %v\n", err)
	}

	return &Server{
		chart:     chart,
		exc:       exc,
		wsManager: wsManager,
		pairsData: pairsData,
	}, nil
}

func (s *Server) Start(ctx context.Context, port int) error {
	mux := SetupRouter(s)

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
