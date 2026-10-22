package handler

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/rodrigo-brito/ninjabot/strategy"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies"
)

func TestBacktestSourceTimeframe(t *testing.T) {
	tt := []struct {
		name      string
		strategy  strategy.Strategy
		timeframe string
		want      string
	}{
		{"trailing stop needs partial candles", strategies.NewTrailing([]string{"BTCUSDT"}), "4h", "1h"},
		{"turtle keeps its timeframe", new(strategies.Turtle), "4h", "4h"},
		{"emacross keeps its timeframe", strategies.NewCrossEMA("15m", 8, 21), "15m", "15m"},
		{"dca keeps its timeframe", strategies.NewDCA("1d", 7, 100), "1d", "1d"},
	}
	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, backtestSourceTimeframe(tc.strategy, tc.timeframe))
		})
	}
}
