package strategies

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/rodrigo-brito/ninjabot"
	exfeed "github.com/rodrigo-brito/ninjabot/exchange/feed"
	expaperwallet "github.com/rodrigo-brito/ninjabot/exchange/paperwallet"
	"github.com/rodrigo-brito/ninjabot/model"
	storagebuntdb "github.com/rodrigo-brito/ninjabot/storage/buntdb"
	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

const testPair = "BTCUSDT"

var seriesStart = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

// ramp returns n closes moving linearly from `from` to `to` (both included).
func ramp(from, to float64, n int) []float64 {
	out := make([]float64, n)
	for i := range out {
		out[i] = from + (to-from)*float64(i)/float64(n-1)
	}
	return out
}

func join(parts ...[]float64) []float64 {
	var out []float64
	for _, p := range parts {
		out = append(out, p...)
	}
	return out
}

// writeCSV writes one candle per close in the CSV feed format
// (time, open, close, low, high, volume). Highs and lows are the open/close
// envelope so stop and take-profit levels trigger exactly where the close does.
func writeCSV(t *testing.T, step time.Duration, closes []float64) string {
	t.Helper()
	var b strings.Builder
	prev := closes[0]
	for i, c := range closes {
		ts := seriesStart.Add(time.Duration(i) * step).Unix()
		fmt.Fprintf(&b, "%d,%f,%f,%f,%f,1\n", ts, prev, c, math.Min(prev, c), math.Max(prev, c))
		prev = c
	}
	file := filepath.Join(t.TempDir(), "candles.csv")
	require.NoError(t, os.WriteFile(file, []byte(b.String()), 0o600))
	return file
}

type backtestResult struct {
	orders []model.Order // filled orders, oldest first
	bot    *ninjabot.NinjaBot
	wallet *expaperwallet.PaperWallet
}

func (r backtestResult) sides() string {
	sides := make([]string, len(r.orders))
	for i, o := range r.orders {
		sides[i] = string(o.Side)
	}
	return strings.Join(sides, ",")
}

// runStrategy backtests strat on closes given at sourceTimeframe and returns
// the filled orders.
func runStrategy(t *testing.T, strat strategy.Strategy, sourceTimeframe string, step time.Duration, closes []float64, capital float64) backtestResult {
	t.Helper()
	ctx := context.Background()

	feed, err := exfeed.NewCSVFeed(strat.Timeframe(), exfeed.PairFeed{
		Pair: testPair, File: writeCSV(t, step, closes), Timeframe: sourceTimeframe,
	})
	require.NoError(t, err)
	store, err := storagebuntdb.FromMemory()
	require.NoError(t, err)
	wallet := expaperwallet.NewPaperWallet(ctx, "USDT",
		expaperwallet.WithPaperAsset("USDT", capital),
		expaperwallet.WithDataFeed(feed))

	bot, err := ninjabot.NewBot(ctx, ninjabot.Settings{Pairs: []string{testPair}}, wallet, strat,
		ninjabot.WithBacktest(wallet), ninjabot.WithStorage(store), ninjabot.WithLogLevel(log.ErrorLevel))
	require.NoError(t, err)
	require.NoError(t, bot.Run(ctx))

	stored, err := store.Orders()
	require.NoError(t, err)
	var filled []model.Order
	for _, o := range stored {
		if o.Status == model.OrderStatusTypeFilled {
			filled = append(filled, *o)
		}
	}
	// Market orders take the candle time; OCO legs keep their creation time
	// and get the fill time in UpdatedAt.
	for i := 1; i < len(filled); i++ {
		for j := i; j > 0 && filled[j].UpdatedAt.Before(filled[j-1].UpdatedAt); j-- {
			filled[j], filled[j-1] = filled[j-1], filled[j]
		}
	}
	return backtestResult{orders: filled, bot: bot, wallet: wallet}
}

func closedTradeReturns(r backtestResult) []float64 {
	var returns []float64
	for _, summary := range r.bot.Controller().Results {
		returns = append(returns, summary.WinPercent()...)
		returns = append(returns, summary.LosePercent()...)
	}
	return returns
}

func TestCrossEMA(t *testing.T) {
	// Downtrend, uptrend (EMA8 crosses above SMA21), downtrend (crosses below).
	closes := join(ramp(100, 80, 40), ramp(81, 130, 30), ramp(129, 90, 30))
	res := runStrategy(t, NewCrossEMA("1h", 8, 21), "1h", time.Hour, closes, 1000)

	require.Equal(t, "BUY,SELL", res.sides())
	buy, sell := res.orders[0], res.orders[1]
	require.InDelta(t, 1000, buy.Price*buy.Quantity, 0.01, "buys with the whole quote balance")
	require.Equal(t, buy.Quantity, sell.Quantity, "sells the whole position")
	require.True(t, buy.Price > 80 && buy.Price < 130, "buys during the uptrend, got %f", buy.Price)
	require.True(t, sell.UpdatedAt.After(seriesStart.Add(70*time.Hour)), "sells during the downtrend")
}

func TestTurtle(t *testing.T) {
	// Slow decline (no new 40-candle high), breakout, then a fall to a new
	// 20-candle low.
	closes := join(ramp(100, 95, 50), ramp(96, 120, 25), ramp(119, 80, 30))
	res := runStrategy(t, new(Turtle), "4h", 4*time.Hour, closes, 1000)

	require.Equal(t, "BUY,SELL", res.sides())
	buy := res.orders[0]
	require.InDelta(t, 500, buy.Price*buy.Quantity, 0.01, "risks half of the quote balance")
	// The entry close must be the highest of its 40-candle window.
	entry := int(buy.UpdatedAt.Sub(seriesStart) / (4 * time.Hour))
	require.GreaterOrEqual(t, entry, 50, "enters on the breakout, not during the decline")
	for _, c := range closes[entry-39 : entry] {
		require.LessOrEqual(t, c, buy.Price)
	}
	require.Equal(t, buy.Quantity, res.orders[1].Quantity)
}

func TestDCA(t *testing.T) {
	t.Run("buys every interval and never sells", func(t *testing.T) {
		res := runStrategy(t, NewDCA("1d", 7, 100), "1d", 24*time.Hour, ramp(100, 160, 60), 10000)

		require.Len(t, res.orders, 9) // days 0, 7, ..., 56
		for i, o := range res.orders {
			require.Equal(t, model.SideTypeBuy, o.Side)
			require.InDelta(t, 100, o.Price*o.Quantity, 0.01)
			if i > 0 {
				require.Equal(t, 7*24*time.Hour, o.UpdatedAt.Sub(res.orders[i-1].UpdatedAt))
			}
		}
	})

	t.Run("spends the remainder and stops", func(t *testing.T) {
		res := runStrategy(t, NewDCA("1d", 7, 100), "1d", 24*time.Hour, ramp(100, 100, 60), 250)

		require.Len(t, res.orders, 3)
		require.InDelta(t, 50, res.orders[2].Price*res.orders[2].Quantity, 0.01)
	})
}

func TestOCOSell(t *testing.T) {
	// Two dips followed by rallies: each rally crosses the stochastic and then
	// reaches the +10% take profit. The second entry happens while the first
	// trade is already closed.
	wave := func(base float64) []float64 {
		return join(ramp(base, base*0.8, 12), ramp(base*0.81, base*1.2, 12))
	}
	closes := join(ramp(100, 100, 10), wave(100), wave(150), ramp(180, 180, 5))

	t.Run("take profit closes each trade at +10%", func(t *testing.T) {
		res := runStrategy(t, new(OCOSell), "1d", 24*time.Hour, closes, 10000)

		returns := closedTradeReturns(res)
		require.NotEmpty(t, returns)
		for _, r := range returns {
			require.InDelta(t, 0.10, r, 0.0001, "trade return")
		}
	})

	t.Run("small accounts still trade", func(t *testing.T) {
		res := runStrategy(t, new(OCOSell), "1d", 24*time.Hour, closes, 1000)
		require.NotEmpty(t, res.orders)
		require.Equal(t, model.SideTypeBuy, res.orders[0].Side)
	})
}

func TestTrailingStop(t *testing.T) {
	// Hourly data resampled to 4h: the trailing stop reacts to partial 4h
	// candles. Downtrend, uptrend (entry), then a sharp drop (exit).
	closes := join(ramp(100, 80, 120), ramp(81, 140, 100), ramp(139, 100, 20))
	res := runStrategy(t, NewTrailing([]string{testPair}), "1h", time.Hour, closes, 1000)

	require.Equal(t, "BUY,SELL", res.sides())
	buy, sell := res.orders[0], res.orders[1]
	require.Greater(t, sell.Price, buy.Price, "the stop trailed the rally")
	require.Less(t, sell.Price, 140.0, "exits during the drop")

	// Closed 4h candles only (what the web app used to download): the stop
	// never sees a partial candle and the position is never closed.
	var fourHour []float64
	for i := 3; i < len(closes); i += 4 {
		fourHour = append(fourHour, closes[i])
	}
	res = runStrategy(t, NewTrailing([]string{testPair}), "4h", 4*time.Hour, fourHour, 1000)
	require.Equal(t, "BUY", res.sides())
}

func TestFibonacci(t *testing.T) {
	// A slow rise keeps the price above the 200 EMA. A dip makes a swing low
	// pivot at 74, a fast rally sets the swing high at 120 (0.618 ~91.6,
	// 0.786 ~83.8), then the price pulls back to 90.
	base := join(ramp(60, 80, 190), ramp(79, 74, 6), ramp(75, 120, 20))
	setup := join(base, ramp(119, 90, 8))

	t.Run("take profit at the swing high", func(t *testing.T) {
		closes := join(setup, ramp(91, 125, 10), ramp(125, 125, 5))
		res := runStrategy(t, NewFibonacci(0, 0), "4h", 4*time.Hour, closes, 1000)

		require.Equal(t, "BUY,SELL", res.sides())
		buy, sell := res.orders[0], res.orders[1]
		require.InDelta(t, 1000, buy.Price*buy.Quantity, 0.01, "buys with the whole quote balance")
		require.Equal(t, buy.Quantity, sell.Quantity)
		require.Greater(t, buy.Price, 91.6, "enters after the bounce off the entry level")
		require.Less(t, buy.Price, 100.0)
		require.InDelta(t, 120, sell.Price, 0.01, "sells at the swing high")
	})

	t.Run("stop-loss at the 0.786 retracement", func(t *testing.T) {
		closes := join(setup, ramp(91, 95, 2), ramp(94, 70, 10))
		res := runStrategy(t, NewFibonacci(0, 0), "4h", 4*time.Hour, closes, 1000)

		require.Equal(t, "BUY,SELL", res.sides())
		buy, sell := res.orders[0], res.orders[1]
		require.Less(t, sell.Price, buy.Price)
		require.InDelta(t, 83.8, sell.Price, 0.1, "stops out at 0.786, not at the bottom")
	})

	t.Run("one trade per leg", func(t *testing.T) {
		// Stopped out, then the price bounces to the entry level again on the
		// same leg.
		closes := join(base, ramp(117, 90, 4), ramp(91, 95, 2), ramp(92, 82, 3),
			ramp(85, 96, 3), ramp(94, 90, 2), ramp(92, 96, 2))
		res := runStrategy(t, NewFibonacci(0, 0), "4h", 4*time.Hour, closes, 1000)
		require.Equal(t, "BUY,SELL", res.sides())
	})

	t.Run("no trade on a stale swing high", func(t *testing.T) {
		closes := join(base, ramp(119, 90, 25), ramp(91, 125, 10))
		res := runStrategy(t, NewFibonacci(0, 0), "4h", 4*time.Hour, closes, 1000)
		require.Empty(t, res.orders)
	})

	t.Run("no trade below the 200 EMA", func(t *testing.T) {
		closes := join(ramp(200, 80, 190), ramp(79, 74, 6), ramp(75, 120, 20), ramp(119, 90, 8), ramp(91, 125, 10))
		res := runStrategy(t, NewFibonacci(0, 0), "4h", 4*time.Hour, closes, 1000)
		require.Empty(t, res.orders)
	})
}

func TestFibLegs(t *testing.T) {
	plusOne := func(low []float64) []float64 {
		high := make([]float64, len(low))
		for i, l := range low {
			high[i] = l + 1
		}
		return high
	}

	t.Run("anchored at the pivot low", func(t *testing.T) {
		low := []float64{10, 9, 8, 9, 10, 11, 12, 13, 14, 15}
		legs := fibLegs(plusOne(low), low, 2)

		require.False(t, legs[4].ok, "the pivot at 2 is confirmed by candle 4")
		require.Equal(t, fibLeg{ok: true, lowIdx: 2, low: 8, highIdx: 4, high: 11}, legs[5])
		require.Equal(t, fibLeg{ok: true, lowIdx: 2, low: 8, highIdx: 8, high: 15}, legs[9], "extends the high, keeps the low")
	})

	t.Run("re-anchored after a higher low and a new high", func(t *testing.T) {
		low := []float64{10, 9, 8, 9, 10, 11, 12, 11, 10, 11, 12, 13, 14}
		legs := fibLegs(plusOne(low), low, 2)

		require.Equal(t, fibLeg{ok: true, lowIdx: 2, low: 8, highIdx: 6, high: 13}, legs[10])
		require.Equal(t, fibLeg{ok: true, lowIdx: 8, low: 10, highIdx: 11, high: 14}, legs[12])
	})

	t.Run("ends when the swing low breaks", func(t *testing.T) {
		low := []float64{10, 9, 8, 9, 10, 11, 7, 8, 9}
		legs := fibLegs(plusOne(low), low, 2)

		require.True(t, legs[6].ok)
		require.False(t, legs[7].ok)
		require.False(t, legs[8].ok)
	})

	require.InDelta(t, 120, fibLevel(80, 120, 0), 1e-9)
	require.InDelta(t, 95.28, fibLevel(80, 120, 0.618), 1e-9)
	require.InDelta(t, 80, fibLevel(80, 120, 1), 1e-9)
}

// TestWarmupCoversIndicators checks that once the controller calls OnCandle
// (after WarmupPeriod candles), every indicator the strategy reads is past its
// lookback. Before that, go-talib pads the output with zeros, and a crossover
// against zeros is a false signal.
func TestWarmupCoversIndicators(t *testing.T) {
	tt := []struct {
		name     string
		strategy strategy.Strategy
		// previous is true when OnCandle also reads Last(1) (crossovers).
		previous bool
	}{
		{"emacross default", NewCrossEMA("1h", 8, 21), true},
		{"emacross custom", NewCrossEMA("1h", 20, 50), true},
		{"ocosell", new(OCOSell), true},
		{"trailingstop", NewTrailing([]string{testPair}), true},
		{"turtle", new(Turtle), false},
		{"fibonacci default", NewFibonacci(0, 0), false},
		{"fibonacci long pivot", NewFibonacci(10, 0.5), false},
	}

	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			n := tc.strategy.WarmupPeriod()
			df := &model.Dataframe{Pair: testPair, Metadata: make(map[string]model.Series[float64])}
			for i := range n {
				// A zig-zag keeps every oscillator away from exact zero.
				p := 100 + float64(i%7)*1.5 - float64(i%3)
				df.Close = append(df.Close, p)
				df.Open = append(df.Open, p-0.5)
				df.High = append(df.High, p+2)
				df.Low = append(df.Low, p-2)
				df.Volume = append(df.Volume, 1)
				df.Time = append(df.Time, seriesStart.Add(time.Duration(i)*time.Hour))
			}
			tc.strategy.Indicators(df)

			require.NotEmpty(t, df.Metadata)
			for key, series := range df.Metadata {
				require.Len(t, series, n, key)
				require.NotZero(t, series.Last(0), "%s is still warming up on the first OnCandle", key)
				if tc.previous {
					require.NotZero(t, series.Last(1), "%s has no previous value for the crossover", key)
				}
			}
		})
	}
}
