package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestCheckHistoryLength(t *testing.T) {
	tt := []struct {
		name     string
		strategy string
		strat    strategy.Strategy
		days     int
		wantErr  string
	}{
		{"emacross 1h fits in 2 days", "emacross", strategies.NewCrossEMA("1h", 8, 21), 2, ""},
		{"emacross 1d needs 32 days", "emacross", strategies.NewCrossEMA("1d", 8, 21), 31, "needs at least 32 days"},
		{"emacross 1d with 32 days", "emacross", strategies.NewCrossEMA("1d", 8, 21), 32, ""},
		{"ocosell needs 23 days", "ocosell", new(strategies.OCOSell), 22, "needs at least 23 days"},
		{"turtle needs 9 days", "turtle", new(strategies.Turtle), 7, "needs at least 9 days"},
		{"turtle with 9 days", "turtle", new(strategies.Turtle), 9, ""},
		{"trailing stop needs 6 days", "trailingstop", strategies.NewTrailing([]string{"BTCUSDT"}), 5, "needs at least 6 days"},
		{"dca needs 11 days", "dca", strategies.NewDCA("1d", 7, 100), 10, "needs at least 11 days"},
	}
	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			err := checkHistoryLength(tc.strategy, tc.strat, tc.days)
			if tc.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.ErrorContains(t, err, tc.wantErr)
		})
	}
}

func TestHandleBacktestRejectsShortHistory(t *testing.T) {
	h := &Handler{}
	body := `{"pairs":"BTCUSDT","strategy":"turtle","days":7,"initial_capital":1000}`
	rec := httptest.NewRecorder()
	h.HandleBacktest(rec, httptest.NewRequest(http.MethodPost, "/api/backtest", strings.NewReader(body)))

	require.Equal(t, http.StatusBadRequest, rec.Code)
	var resp backtestResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "turtle on 4h candles needs at least 9 days of history (40 candles of indicator warm-up + 10 to trade), got 7", resp.Error)
}
