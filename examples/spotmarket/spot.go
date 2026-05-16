package main

import (
	"context"

	"github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/server"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// This example shows how to use spot market with NinjaBot in Binance
func main() {
	var (
		ctx = context.Background()
		cfg = server.LoadConfig()
	)

	settings := ninjabot.Settings{
		Pairs: []string{
			"BTCUSDT",
			"ETHUSDT",
		},
		Telegram: ninjabot.TelegramSettings{
			Enabled: true,
			Token:   cfg.TelegramToken,
			Users:   []int{cfg.TelegramUser},
		},
	}

	// Initialize your exchange
	binance, err := exchange.NewBinance(ctx, exchange.WithBinanceCredentials(cfg.APIKey, cfg.APISecret))
	if err != nil {
		log.Fatal(err)
	}

	// Initialize your strategy and bot
	strategy := new(strategies.CrossEMA)
	bot, err := ninjabot.NewBot(ctx, settings, binance, strategy)
	if err != nil {
		log.Fatal(err)
	}

	err = bot.Run(ctx)
	if err != nil {
		log.Fatal(err)
	}
}
