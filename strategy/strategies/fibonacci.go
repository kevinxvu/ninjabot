package strategies

import (
	"fmt"
	"sync"
	"time"

	"github.com/rodrigo-brito/ninjabot/indicator"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/service"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

const (
	// FibDefaultPivot is the default number of candles on each side of a
	// swing low pivot.
	FibDefaultPivot = 5
	// FibDefaultLevel is the default retracement where the strategy buys.
	FibDefaultLevel = 0.618

	fibTrendPeriod = 200
	fibATRPeriod   = 14
	// fibMinLegATR is the smallest up-leg traded, in ATRs: shorter legs are
	// noise inside a range.
	fibMinLegATR = 3.0
	// fibMaxPullback is how many candles after the swing high a pullback can
	// still be bought; later the market is ranging, not pulling back.
	fibMaxPullback = 20
	fibStopLevel   = 0.786
	fibMinOrder    = 10.0
)

// fibChartLevels are the retracements drawn on the price chart.
var fibChartLevels = []struct {
	ratio float64
	name  string
	color string
}{
	{0, "0 (swing high)", "#16a34a"},
	{0.382, "0.382", "#0ea5e9"},
	{0.5, "0.5", "#635bff"},
	{0.618, "0.618", "#f59e0b"},
	{0.786, "0.786 (stop)", "#ef4444"},
	{1, "1 (swing low)", "#64748b"},
}

// Fibonacci buys pullbacks to a Fibonacci retracement of the latest up-leg
// while the price is above its 200 EMA. The leg starts at a confirmed swing
// low pivot and must span at least 3 ATRs; the pullback must come within 20
// candles of the swing high, and each leg is traded once. Each entry is closed
// by an OCO order: take profit at the swing high, stop-loss at the 0.786
// retracement.
type Fibonacci struct {
	Pivot      int
	EntryLevel float64

	mu sync.Mutex
	// traded holds, per pair, the swing low time of the last leg bought.
	traded map[string]time.Time
}

// NewFibonacci returns a Fibonacci strategy whose swing lows are pivots with
// pivot candles on each side, buying at the entryLevel retracement (0.5 or
// 0.618). Zero values select the defaults.
func NewFibonacci(pivot int, entryLevel float64) *Fibonacci {
	if pivot <= 0 {
		pivot = FibDefaultPivot
	}
	if entryLevel <= 0 {
		entryLevel = FibDefaultLevel
	}
	return &Fibonacci{Pivot: pivot, EntryLevel: entryLevel, traded: make(map[string]time.Time)}
}

func (f *Fibonacci) Timeframe() string {
	return "4h"
}

// WarmupPeriod covers the 200 EMA trend filter, which is longer than the ATR
// and the pivot confirmation.
func (f *Fibonacci) WarmupPeriod() int {
	return max(fibTrendPeriod, 2*f.Pivot+1, fibATRPeriod+1)
}

// fibLeg is an up-leg from a swing low to the highest high after it.
type fibLeg struct {
	ok      bool
	lowIdx  int
	highIdx int
	low     float64
	high    float64
}

// isPivotLow reports whether low[j] is the lowest of the pivot candles on
// each side (the first of equal lows wins).
func isPivotLow(low []float64, j, pivot int) bool {
	if j-pivot < 0 || j+pivot >= len(low) {
		return false
	}
	for k := j - pivot; k <= j+pivot; k++ {
		if k < j && low[k] <= low[j] || k > j && low[k] < low[j] {
			return false
		}
	}
	return true
}

// fibLegs returns, for each candle i, the up-leg known before candle i, so it
// only depends on candles 0..i-1. A leg starts at a confirmed pivot low (known
// pivot candles after it) and stays anchored there:
//   - a new high extends the leg; if a higher pivot low formed after the old
//     high (a pullback), the leg is re-anchored to it, starting a new leg;
//   - a low below the swing low ends the leg until the next pivot low.
func fibLegs(high, low []float64, pivot int) []fibLeg {
	legs := make([]fibLeg, len(high))
	var cur fibLeg
	lastPivot := -1
	for t := range high {
		legs[t] = cur

		if cur.ok && low[t] < cur.low {
			cur = fibLeg{}
		}
		if lastPivot >= 0 && low[t] < low[lastPivot] {
			lastPivot = -1
		}
		if cur.ok && high[t] > cur.high {
			if lastPivot > cur.highIdx {
				cur.lowIdx, cur.low = lastPivot, low[lastPivot]
			}
			cur.highIdx, cur.high = t, high[t]
		}

		j := t - pivot
		if !isPivotLow(low, j, pivot) || lastPivot >= j {
			continue
		}
		lastPivot = j
		if !cur.ok {
			cur = fibLeg{ok: true, lowIdx: j, low: low[j], highIdx: j, high: high[j]}
			for k := j + 1; k <= t; k++ {
				if high[k] > cur.high {
					cur.highIdx, cur.high = k, high[k]
				}
			}
		}
	}
	return legs
}

// fibLevel is the price of the ratio retracement of the leg (0 = swing high,
// 1 = swing low).
func fibLevel(swingLow, swingHigh, ratio float64) float64 {
	return swingHigh - (swingHigh-swingLow)*ratio
}

// tradable reports whether the leg before candle i is large enough to trade.
func (l fibLeg) tradable(atr float64) bool {
	return l.ok && atr > 0 && l.high-l.low >= fibMinLegATR*atr
}

func (f *Fibonacci) Indicators(df *model.Dataframe) []strategy.ChartIndicator {
	df.Metadata["ema_trend"] = indicator.EMA(df.Close, fibTrendPeriod)
	df.Metadata["atr"] = indicator.ATR(df.High, df.Low, df.Close, fibATRPeriod)

	// Levels are zero where there is no tradable leg; the chart leaves a gap.
	levels := make([]model.Series[float64], len(fibChartLevels))
	for k := range levels {
		levels[k] = make(model.Series[float64], len(df.Close))
	}
	atr := df.Metadata["atr"]
	for i, leg := range fibLegs(df.High, df.Low, f.Pivot) {
		if i == 0 || !leg.tradable(atr[i-1]) {
			continue
		}
		for k, l := range fibChartLevels {
			levels[k][i] = fibLevel(leg.low, leg.high, l.ratio)
		}
	}

	metrics := make([]strategy.IndicatorMetric, len(fibChartLevels))
	for k, l := range fibChartLevels {
		metrics[k] = strategy.IndicatorMetric{
			Name:   l.name,
			Color:  l.color,
			Style:  strategy.StyleScatter,
			Values: levels[k],
		}
	}

	return []strategy.ChartIndicator{
		{
			Overlay:   true,
			GroupName: "Fibonacci",
			Time:      df.Time,
			Metrics:   metrics,
		},
		{
			Overlay:   true,
			GroupName: fmt.Sprintf("EMA %d", fibTrendPeriod),
			Time:      df.Time,
			Warmup:    fibTrendPeriod - 1,
			Metrics: []strategy.IndicatorMetric{
				{
					Color:  "#94a3b8",
					Style:  strategy.StyleScatter,
					Values: df.Metadata["ema_trend"],
				},
			},
		},
	}
}

func (f *Fibonacci) OnCandle(df *model.Dataframe, broker service.Broker) {
	i := len(df.Close) - 1
	if i < 1 {
		return
	}
	closePrice := df.Close[i]
	leg := fibLegs(df.High, df.Low, f.Pivot)[i]
	if !leg.tradable(df.Metadata["atr"].Last(1)) || i-leg.highIdx > fibMaxPullback ||
		closePrice <= df.Metadata["ema_trend"].Last(0) {
		return
	}

	legStart := df.Time[leg.lowIdx]
	f.mu.Lock()
	if f.traded == nil {
		f.traded = make(map[string]time.Time)
	}
	traded := f.traded[df.Pair].Equal(legStart)
	f.mu.Unlock()
	if traded {
		return
	}

	entry := fibLevel(leg.low, leg.high, f.EntryLevel)
	stop := fibLevel(leg.low, leg.high, fibStopLevel)
	// The pullback reached the entry level on this or the previous candle
	// without breaking the stop level, and this candle closed green above it.
	touch := min(df.Low[i-1], df.Low[i])
	if touch > entry || touch <= stop {
		return
	}
	if closePrice <= df.Open[i] || closePrice <= entry || closePrice >= leg.high {
		return
	}

	assetPosition, quotePosition, err := broker.Position(df.Pair)
	if err != nil {
		log.Error(err)
		return
	}
	// Position includes the asset locked by an open OCO: one trade at a time.
	if assetPosition*closePrice >= fibMinOrder || quotePosition < fibMinOrder {
		return
	}

	fields := map[string]interface{}{
		"pair":  df.Pair,
		"close": closePrice,
		"entry": entry,
		"stop":  stop,
		"take":  leg.high,
		"quote": quotePosition,
	}
	// Spending a quote amount avoids the rounding of quote/close, which can
	// exceed the balance and reject the order.
	buy, err := broker.CreateOrderMarketQuote(model.SideTypeBuy, df.Pair, quotePosition)
	if err != nil {
		// Without the asset, the OCO sell would open a short position.
		log.WithFields(fields).Error(err)
		return
	}
	f.mu.Lock()
	f.traded[df.Pair] = legStart
	f.mu.Unlock()

	fields["size"] = buy.Quantity
	if _, err := broker.CreateOrderOCO(model.SideTypeSell, df.Pair, buy.Quantity, leg.high, stop, stop); err != nil {
		log.WithFields(fields).Error(err)
	}
}
