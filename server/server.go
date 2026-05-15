package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
}

func NewServer(chart *plot.Chart) (*Server, error) {
	exc, _ := exchange.NewBinance(context.Background())
	return &Server{chart: chart, exc: exc}, nil
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
