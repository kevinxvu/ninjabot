package strategies

import (
	"time"

	"github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/service"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

type DCA struct {
	CustomTimeframe string
	IntervalDays    int
	BuyAmount       float64

	lastBuyTime map[string]time.Time
}

// NewDCA allows customizing the DCA strategy.
// It buys `buyAmount` worth of asset every `intervalDays` days.
// It stops buying when there's not enough quote currency in the wallet.
// It never sells.
func NewDCA(timeframe string, intervalDays int, buyAmount float64) *DCA {
	if timeframe == "" {
		timeframe = "1d"
	}
	if intervalDays <= 0 {
		intervalDays = 7 // Default 7 days
	}
	if buyAmount <= 0 {
		buyAmount = 100 // Default 100 quote currency
	}

	return &DCA{
		CustomTimeframe: timeframe,
		IntervalDays:    intervalDays,
		BuyAmount:       buyAmount,
		lastBuyTime:     make(map[string]time.Time),
	}
}

func (d DCA) Timeframe() string {
	if d.CustomTimeframe != "" {
		return d.CustomTimeframe
	}
	return "1d"
}

func (d DCA) WarmupPeriod() int {
	return 1
}

func (d DCA) Indicators(df *ninjabot.Dataframe) []strategy.ChartIndicator {
	// DCA does not use any technical indicators
	return nil
}

func (d *DCA) OnCandle(df *ninjabot.Dataframe, broker service.Broker) {
	if d.lastBuyTime == nil {
		d.lastBuyTime = make(map[string]time.Time)
	}

	// Current candle time
	currentTime := df.Time[len(df.Time)-1]

	// Check if enough time has passed since last buy
	lastBuy, exists := d.lastBuyTime[df.Pair]

	// Buy if it's the first time or if the interval has passed
	intervalDuration := time.Duration(d.IntervalDays) * 24 * time.Hour

	if !exists || currentTime.Sub(lastBuy) >= intervalDuration {
		closePrice := df.Close.Last(0)

		_, quotePosition, err := broker.Position(df.Pair)
		if err != nil {
			log.Error(err)
			return
		}

		// Minimum order value is generally around 10 for most quote currencies like USDT
		minQuote := 10.0

		var buyAmount float64
		if quotePosition >= d.BuyAmount {
			buyAmount = d.BuyAmount
		} else if quotePosition >= minQuote {
			buyAmount = quotePosition // Buy with remaining wallet if possible
		}

		if buyAmount >= minQuote {
			amount := buyAmount / closePrice // calculate amount of asset to buy
			_, err := broker.CreateOrderMarket(ninjabot.SideTypeBuy, df.Pair, amount)
			if err != nil {
				log.Error(err)
			} else {
				// Record the buy time
				d.lastBuyTime[df.Pair] = currentTime
			}
		}
	}
}
