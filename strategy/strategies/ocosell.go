package strategies

import (
	"math"

	"github.com/markcheno/go-talib"

	"github.com/rodrigo-brito/ninjabot/indicator"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/service"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

type OCOSell struct{}

func (e OCOSell) Timeframe() string {
	return "1d"
}

func (e OCOSell) WarmupPeriod() int {
	return 9
}

func (e OCOSell) Indicators(df *model.Dataframe) []strategy.ChartIndicator {
	df.Metadata["stoch"], df.Metadata["stoch_signal"] = indicator.Stoch(
		df.High,
		df.Low,
		df.Close,
		8,
		3,
		talib.SMA,
		3,
		talib.SMA,
	)

	return []strategy.ChartIndicator{
		{
			Overlay:   false,
			GroupName: "Stochastic",
			Time:      df.Time,
			Metrics: []strategy.IndicatorMetric{
				{
					Values: df.Metadata["stoch"],
					Name:   "K",
					Color:  "red",
					Style:  strategy.StyleLine,
				},
				{
					Values: df.Metadata["stoch_signal"],
					Name:   "D",
					Color:  "blue",
					Style:  strategy.StyleLine,
				},
			},
		},
	}
}

func (e *OCOSell) OnCandle(df *model.Dataframe, broker service.Broker) {
	closePrice := df.Close.Last(0)
	log.Info("New Candle = ", df.Pair, df.LastUpdate, closePrice)

	assetPosition, quotePosition, err := broker.Position(df.Pair)
	if err != nil {
		log.Error(err)
		return
	}

	// Buy up to 4000 quote per signal; smaller accounts use what they have.
	buyAmount := math.Min(4000, quotePosition)
	if buyAmount >= 10 && df.Metadata["stoch"].Crossover(df.Metadata["stoch_signal"]) {
		size := buyAmount / closePrice
		_, err := broker.CreateOrderMarket(model.SideTypeBuy, df.Pair, size)
		if err != nil {
			log.WithFields(map[string]interface{}{
				"pair":  df.Pair,
				"side":  model.SideTypeBuy,
				"close": closePrice,
				"asset": assetPosition,
				"quote": quotePosition,
				"size":  size,
			}).Error(err)
			// Without the asset, the OCO sell would open a short position.
			return
		}

		_, err = broker.CreateOrderOCO(model.SideTypeSell, df.Pair, size, closePrice*1.1, closePrice*0.95, closePrice*0.95)
		if err != nil {
			log.WithFields(map[string]interface{}{
				"pair":  df.Pair,
				"side":  model.SideTypeBuy,
				"close": closePrice,
				"asset": assetPosition,
				"quote": quotePosition,
				"size":  size,
			}).Error(err)
		}
	}
}
