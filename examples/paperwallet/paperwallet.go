package main

import (
	"context"

	"github.com/rodrigo-brito/ninjabot/plot"
	"github.com/rodrigo-brito/ninjabot/plot/indicator"
	"github.com/rodrigo-brito/ninjabot/server"

	"github.com/rodrigo-brito/ninjabot"
	exbinance "github.com/rodrigo-brito/ninjabot/exchange/binance"
	expaperwallet "github.com/rodrigo-brito/ninjabot/exchange/paperwallet"
	storagebuntdb "github.com/rodrigo-brito/ninjabot/storage/buntdb"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// This example shows how to use NinjaBot with a simulation with a fake exchange
// A peperwallet is a wallet that is not connected to any exchange, it is a simulation with live data (realtime)
func main() {
	var (
		ctx = context.Background()
		cfg = server.LoadConfig()
	)

	settings := ninjabot.Settings{
		Pairs: []string{
			"BTCUSDT",
			"ETHUSDT",
			"BNBUSDT",
			"LTCUSDT",
		},
		Telegram: ninjabot.TelegramSettings{
			Enabled: cfg.TelegramToken != "" && cfg.TelegramUser != 0,
			Token:   cfg.TelegramToken,
			Users:   []int{cfg.TelegramUser},
		},
	}

	// Use binance for realtime data feed
	binance, err := exbinance.NewBinance(ctx)
	if err != nil {
		log.Fatal(err)
	}

	// creating a storage to save trades
	storage, err := storagebuntdb.FromMemory()
	if err != nil {
		log.Fatal(err)
	}

	// creating a paper wallet to simulate an exchange waller for fake operataions
	// paper wallet is simulation of a real exchange wallet
	paperWallet := expaperwallet.NewPaperWallet(
		ctx,
		"USDT",
		expaperwallet.WithPaperFee(0.001, 0.001),
		expaperwallet.WithPaperAsset("USDT", 10000),
		expaperwallet.WithDataFeed(binance),
	)

	// initializing my strategy
	strategy := new(strategies.CrossEMA)

	chart, err := plot.NewChart(
		plot.WithCustomIndicators(
			indicator.EMA(8, "red"),
			indicator.SMA(21, "blue"),
		),
	)
	if err != nil {
		log.Fatal(err)
	}

	// initializer ninjabot
	bot, err := ninjabot.NewBot(
		ctx,
		settings,
		paperWallet,
		strategy,
		ninjabot.WithStorage(storage),
		ninjabot.WithPaperWallet(paperWallet),
		ninjabot.WithCandleSubscription(chart),
		ninjabot.WithOrderSubscription(chart),
	)
	if err != nil {
		log.Fatal(err)
	}

	srv, err := server.NewServer(chart, cfg)
	if err != nil {
		log.Fatal(err)
	}

	go func() {
		err := srv.Start(ctx, 8080)
		if err != nil {
			log.Fatal(err)
		}
	}()

	err = bot.Run(ctx)
	if err != nil {
		log.Fatal(err)
	}
}
