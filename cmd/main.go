package main

import (
	"context"
	"os/signal"
	"syscall"

	"github.com/rodrigo-brito/ninjabot/plot"
	plotindicator "github.com/rodrigo-brito/ninjabot/plot/indicator"
	"github.com/rodrigo-brito/ninjabot/server"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

func main() {
	cfg := server.LoadConfig()

	chart, err := plot.NewChart(
		plot.WithCustomIndicators(
			plotindicator.RSI(14, "#8b5cf6"),
			plotindicator.MACD(12, 26, 9, "#10b981", "#ef4444", "#3b82f6"),
			plotindicator.Stoch(14, 3, 3, "#14b8a6", "#8b5cf6"),
			plotindicator.CCI(20, "#ec4899"),
		),
	)
	if err != nil {
		log.Fatal(err)
	}

	srv, err := server.NewServer(chart, cfg)
	if err != nil {
		log.Fatal(err)
	}

	// Stop on SIGINT/SIGTERM (docker stop): as PID 1 in a container the
	// process would otherwise ignore SIGTERM until it is killed.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := srv.Start(ctx, cfg.Port); err != nil {
		log.Fatal(err)
	}
}
