package handler

import (
	"sync/atomic"
	"testing"
	"time"

	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/strategy/strategies"
	"github.com/stretchr/testify/require"
)

func TestRealtimeChartCandleLimitUsesStrategyWarmup(t *testing.T) {
	strategy := strategies.NewCrossEMA("1h", 8, 21)

	require.Equal(t, strategy.WarmupPeriod(), realtimeChartCandleLimit(strategy))
}

func TestRealtimeChartStartTimeIncludesStrategyWarmup(t *testing.T) {
	createdAt := time.Date(2026, 5, 18, 23, 0, 0, 0, time.UTC)
	session := &model.Session{
		Timeframe: "1h",
		CreatedAt: createdAt,
	}
	strategy := strategies.NewCrossEMA("1h", 8, 21)

	start := realtimeChartStartTime(session, strategy, createdAt.Add(time.Hour))

	require.Equal(t, createdAt.Add(-22*time.Hour), start)
}

func TestRealtimeChartStartTimeCapsLongSessions(t *testing.T) {
	createdAt := time.Date(2026, 5, 19, 1, 57, 0, 0, time.UTC)
	end := time.Date(2026, 10, 22, 10, 53, 0, 0, time.UTC)
	session := &model.Session{
		Timeframe: "1m",
		CreatedAt: createdAt,
	}
	strategy := strategies.NewCrossEMA("1m", 8, 21)

	start := realtimeChartStartTime(session, strategy, end)

	require.Equal(t, end.Add(-maxRealtimeChartCandles*time.Minute), start)
}

func TestRealtimeChartEndTimeUsesNowForStoppedSession(t *testing.T) {
	createdAt := time.Date(2026, 5, 18, 18, 14, 32, 0, time.UTC)
	updatedAt := time.Date(2026, 5, 18, 18, 14, 40, 0, time.UTC)
	now := time.Date(2026, 5, 18, 23, 35, 0, 0, time.UTC)
	session := &model.Session{
		Timeframe: "1m",
		Status:    "stopped",
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}

	end := realtimeChartEndTime(session, now)

	require.Equal(t, now.Add(time.Minute), end)
}

func TestBuildSessionStrategyUsesStoredPeriods(t *testing.T) {
	session := &model.Session{Strategy: "emacross", Timeframe: "1h", FastPeriod: 5, SlowPeriod: 50}

	s, ok := buildSessionStrategy(session).(*strategies.CrossEMA)

	require.True(t, ok)
	require.Equal(t, 5, s.FastPeriod)
	require.Equal(t, 50, s.SlowPeriod)
}

func TestFillStrategyParams(t *testing.T) {
	tt := []struct {
		name       string
		session    model.Session
		fast, slow int
	}{
		{"stored periods", model.Session{Strategy: "emacross", Timeframe: "1m", FastPeriod: 5, SlowPeriod: 13}, 5, 13},
		{"older session uses defaults", model.Session{Strategy: "emacross", Timeframe: "1m"}, 8, 21},
		{"other strategy untouched", model.Session{Strategy: "turtle", Timeframe: "4h"}, 0, 0},
	}

	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			fillStrategyParams(&tc.session)

			require.Equal(t, tc.fast, tc.session.FastPeriod)
			require.Equal(t, tc.slow, tc.session.SlowPeriod)
		})
	}
}

func TestNormalizeStartRequest(t *testing.T) {
	valid := StartSignalRequest{Pair: " btcusdt ", Timeframe: "1h", Strategy: "emacross", InitialAsset: "usdt", InitialAmount: 100}

	tt := []struct {
		name    string
		modify  func(r *StartSignalRequest)
		wantErr string
		check   func(t *testing.T, r StartSignalRequest)
	}{
		{
			name:   "fills defaults and normalises",
			modify: func(*StartSignalRequest) {},
			check: func(t *testing.T, r StartSignalRequest) {
				require.Equal(t, "BTCUSDT", r.Pair)
				require.Equal(t, "USDT", r.InitialAsset)
				require.Equal(t, 8, r.FastPeriod)
				require.Equal(t, 21, r.SlowPeriod)
			},
		},
		{name: "missing amount", modify: func(r *StartSignalRequest) { r.InitialAmount = 0 }, wantErr: "missing required fields"},
		{name: "unknown pair", modify: func(r *StartSignalRequest) { r.Pair = "FOOBAR" }, wantErr: "unsupported pair"},
		{name: "bad timeframe", modify: func(r *StartSignalRequest) { r.Timeframe = "abc" }, wantErr: "invalid timeframe"},
		{name: "unknown strategy", modify: func(r *StartSignalRequest) { r.Strategy = "nope" }, wantErr: "unknown strategy"},
		{
			name:    "fast not below slow",
			modify:  func(r *StartSignalRequest) { r.FastPeriod, r.SlowPeriod = 30, 20 },
			wantErr: "fast_period must be less than slow_period",
		},
	}

	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			req := valid
			tc.modify(&req)
			err := normalizeStartRequest(&req)
			if tc.wantErr != "" {
				require.ErrorContains(t, err, tc.wantErr)
				return
			}
			require.NoError(t, err)
			tc.check(t, req)
		})
	}
}

func TestStopSessionWaitsForBotExit(t *testing.T) {
	h := newSignalTestHandler(t)
	m := h.signalMgr
	require.NoError(t, h.db.CreateSession(&model.Session{
		ID: "s1", Type: "REALTIME_SIGNAL", Status: "running", Pair: "BTCUSDT",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}))

	// The fake bot needs a moment to finish its candle after cancellation.
	var exited atomic.Bool
	instance := &botInstance{done: make(chan struct{})}
	instance.Cancel = func() {
		go func() {
			time.Sleep(50 * time.Millisecond)
			exited.Store(true)
			close(instance.done)
		}()
	}
	m.bots["s1"] = instance

	require.NoError(t, m.StopSession("s1"))
	require.True(t, exited.Load(), "StopSession returned before the bot exited")
	require.False(t, m.IsRunning("s1"))

	session, err := h.db.GetSessionByID("s1")
	require.NoError(t, err)
	require.Equal(t, "stopped", session.Status)
}
