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
