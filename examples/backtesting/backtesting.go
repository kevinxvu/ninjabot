package main

import (
	"context"

	"github.com/rodrigo-brito/ninjabot"
	exfeed "github.com/rodrigo-brito/ninjabot/exchange/feed"
	expaperwallet "github.com/rodrigo-brito/ninjabot/exchange/paperwallet"
	"github.com/rodrigo-brito/ninjabot/plot"
	"github.com/rodrigo-brito/ninjabot/plot/indicator"
	"github.com/rodrigo-brito/ninjabot/server"
	storagebuntdb "github.com/rodrigo-brito/ninjabot/storage/buntdb"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// This example shows how to use backtesting with NinjaBot
// Backtesting is a simulation of the strategy in historical data (from CSV)
func main() {
	ctx := context.Background()
	cfg := server.LoadConfig()

	// bot settings (eg: pairs, telegram, etc)
	settings := ninjabot.Settings{
		Pairs: []string{
			"BTCUSDT",
			"ETHUSDT",
		},
	}

	// initialize your strategy
	strategy := new(strategies.CrossEMA)

	// load historical data from CSV files
	csvFeed, err := exfeed.NewCSVFeed(
		strategy.Timeframe(),
		exfeed.PairFeed{
			Pair:      "BTCUSDT",
			File:      "testdata/btc-1h.csv",
			Timeframe: "1h",
		},
		exfeed.PairFeed{
			Pair:      "ETHUSDT",
			File:      "testdata/eth-1h.csv",
			Timeframe: "1h",
		},
	)
	if err != nil {
		log.Fatal(err)
	}

	// initialize a database in memory
	storage, err := storagebuntdb.FromMemory()
	if err != nil {
		log.Fatal(err)
	}

	// create a paper wallet for simulation, initializing with 10.000 USDT
	wallet := expaperwallet.NewPaperWallet(
		ctx,
		"USDT",
		expaperwallet.WithPaperAsset("USDT", 10000),
		expaperwallet.WithDataFeed(csvFeed),
	)

	// create a chart  with indicators from the strategy and a custom additional RSI indicator
	chart, err := plot.NewChart(
		plot.WithStrategyIndicators(strategy),
		plot.WithCustomIndicators(
			indicator.RSI(14, "purple"),
		),
		plot.WithPaperWallet(wallet),
	)
	if err != nil {
		log.Fatal(err)
	}

	// initializer Ninjabot with the objects created before
	bot, err := ninjabot.NewBot(
		ctx,
		settings,
		wallet,
		strategy,
		ninjabot.WithBacktest(wallet), // Required for Backtest mode
		ninjabot.WithStorage(storage),

		// connect bot feed (candle and orders) to the chart
		ninjabot.WithCandleSubscription(chart),
		ninjabot.WithOrderSubscription(chart),
		ninjabot.WithLogLevel(log.WarnLevel),
	)
	if err != nil {
		log.Fatal(err)
	}

	// Initializer simulation
	err = bot.Run(ctx)
	if err != nil {
		log.Fatal(err)
	}

	// Print bot results
	bot.Summary()

	// Display candlesticks chart in local browser
	srv, err := server.NewServer(chart, cfg)
	if err != nil {
		log.Fatal(err)
	}

	err = srv.Start(ctx, 8080)
	if err != nil {
		log.Fatal(err)
	}
}
