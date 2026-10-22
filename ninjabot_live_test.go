package ninjabot

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	log "github.com/sirupsen/logrus"
	"github.com/stretchr/testify/require"

	expaperwallet "github.com/rodrigo-brito/ninjabot/exchange/paperwallet"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/service"
	storagebuntdb "github.com/rodrigo-brito/ninjabot/storage/buntdb"
	"github.com/rodrigo-brito/ninjabot/strategy"
)

// endlessFeed streams a closed 1h candle every few milliseconds until the
// subscription context is cancelled, like a live exchange.
type endlessFeed struct {
	closed atomic.Bool
}

var feedStart = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func feedCandle(i int) model.Candle {
	return model.Candle{
		Pair: "BTCUSDT", Time: feedStart.Add(time.Duration(i) * time.Hour),
		UpdatedAt: feedStart.Add(time.Duration(i+1) * time.Hour),
		Open:      100, High: 100, Low: 100, Close: 100, Volume: 1, Complete: true,
	}
}

func (f *endlessFeed) AssetsInfo(string) model.AssetInfo { return model.AssetInfo{} }

func (f *endlessFeed) LastQuote(context.Context, string) (float64, error) { return 100, nil }

func (f *endlessFeed) CandlesByPeriod(context.Context, string, string, time.Time, time.Time) ([]model.Candle, error) {
	return nil, nil
}

func (f *endlessFeed) CandlesByLimit(_ context.Context, _, _ string, limit int) ([]model.Candle, error) {
	candles := make([]model.Candle, limit)
	for i := range candles {
		candles[i] = feedCandle(i)
	}
	return candles, nil
}

func (f *endlessFeed) CandlesSubscription(ctx context.Context, _, _ string) (chan model.Candle, chan error) {
	ccandle, cerr := make(chan model.Candle), make(chan error)
	go func() {
		defer f.closed.Store(true)
		defer close(cerr)
		defer close(ccandle)
		for i := 100; ; i++ {
			select {
			case <-ctx.Done():
				return
			case ccandle <- feedCandle(i):
				time.Sleep(2 * time.Millisecond)
			}
		}
	}()
	return ccandle, cerr
}

type countingStrategy struct {
	candles atomic.Int64
}

func (s *countingStrategy) Timeframe() string { return "1h" }

func (s *countingStrategy) WarmupPeriod() int { return 2 }

func (s *countingStrategy) Indicators(*model.Dataframe) []strategy.ChartIndicator { return nil }

func (s *countingStrategy) OnCandle(*model.Dataframe, service.Broker) { s.candles.Add(1) }

func TestRunStopsLiveBotOnCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	feed := &endlessFeed{}
	wallet := expaperwallet.NewPaperWallet(ctx, "USDT",
		expaperwallet.WithPaperAsset("USDT", 1000),
		expaperwallet.WithDataFeed(feed))
	store, err := storagebuntdb.FromMemory()
	require.NoError(t, err)
	strat := &countingStrategy{}

	bot, err := NewBot(ctx, Settings{Pairs: []string{"BTCUSDT"}}, wallet, strat,
		WithStorage(store), WithPaperWallet(wallet), WithLogLevel(log.ErrorLevel))
	require.NoError(t, err)

	runDone := make(chan error, 1)
	go func() { runDone <- bot.Run(ctx) }()

	require.Eventually(t, func() bool { return strat.candles.Load() > 5 }, 5*time.Second, 5*time.Millisecond)
	cancel()

	select {
	case err := <-runDone:
		require.NoError(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
	require.Eventually(t, feed.closed.Load, 5*time.Second, 5*time.Millisecond, "candle subscription left open")

	// No candle reaches the strategy once Run has returned.
	processed := strat.candles.Load()
	time.Sleep(50 * time.Millisecond)
	require.Equal(t, processed, strat.candles.Load())
}
