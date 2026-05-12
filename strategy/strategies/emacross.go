package strategies

import (
	"fmt"

	"github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/indicator"
	"github.com/rodrigo-brito/ninjabot/service"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

type CrossEMA struct {
	CustomTimeframe string
	FastPeriod      int
	SlowPeriod      int
}

// NewCrossEMA allows customizing the strategy
func NewCrossEMA(timeframe string, fastPeriod, slowPeriod int) *CrossEMA {
	if timeframe == "" {
		timeframe = "4h"
	}
	if fastPeriod == 0 {
		fastPeriod = 8
	}
	if slowPeriod == 0 {
		slowPeriod = 21
	}

	return &CrossEMA{
		CustomTimeframe: timeframe,
		FastPeriod:      fastPeriod,
		SlowPeriod:      slowPeriod,
	}
}

func (e CrossEMA) Timeframe() string {
	if e.CustomTimeframe != "" {
		return e.CustomTimeframe
	}
	return "4h"
}

func (e CrossEMA) WarmupPeriod() int {
	if e.SlowPeriod > 0 {
		return e.SlowPeriod + 1
	}
	return 22
}

func (e CrossEMA) Indicators(df *ninjabot.Dataframe) []strategy.ChartIndicator {
	fast := e.FastPeriod
	if fast == 0 {
		fast = 8
	}
	slow := e.SlowPeriod
	if slow == 0 {
		slow = 21
	}

	fastKey := fmt.Sprintf("ema%d", fast)
	slowKey := fmt.Sprintf("sma%d", slow)

	df.Metadata[fastKey] = indicator.EMA(df.Close, fast)
	df.Metadata[slowKey] = indicator.SMA(df.Close, slow)

	return []strategy.ChartIndicator{
		{
			Overlay:   true,
			GroupName: "Moving Averages",
			Time:      df.Time,
			Metrics: []strategy.IndicatorMetric{
				{
					Values: df.Metadata[fastKey],
					Name:   fmt.Sprintf("EMA %d", fast),
					Color:  "#ef4444",
					Style:  strategy.StyleLine,
				},
				{
					Values: df.Metadata[slowKey],
					Name:   fmt.Sprintf("SMA %d", slow),
					Color:  "#3b82f6",
					Style:  strategy.StyleLine,
				},
			},
		},
	}
}

func (e *CrossEMA) OnCandle(df *ninjabot.Dataframe, broker service.Broker) {
	fast := e.FastPeriod
	if fast == 0 {
		fast = 8
	}
	slow := e.SlowPeriod
	if slow == 0 {
		slow = 21
	}

	fastKey := fmt.Sprintf("ema%d", fast)
	slowKey := fmt.Sprintf("sma%d", slow)

	closePrice := df.Close.Last(0)

	assetPosition, quotePosition, err := broker.Position(df.Pair)
	if err != nil {
		log.Error(err)
		return
	}

	if quotePosition >= 10 && // minimum quote position to trade
		df.Metadata[fastKey].Crossover(df.Metadata[slowKey]) { // trade signal (EMA > SMA)

		amount := quotePosition / closePrice // calculate amount of asset to buy
		_, err := broker.CreateOrderMarket(ninjabot.SideTypeBuy, df.Pair, amount)
		if err != nil {
			log.Error(err)
		}

		return
	}

	if assetPosition > 0 &&
		df.Metadata[fastKey].Crossunder(df.Metadata[slowKey]) { // trade signal (EMA < SMA)

		_, err = broker.CreateOrderMarket(ninjabot.SideTypeSell, df.Pair, assetPosition)
		if err != nil {
			log.Error(err)
		}
	}
}
