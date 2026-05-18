package server

import (
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

	start := realtimeChartStartTime(session, strategy)

	require.Equal(t, createdAt.Add(-22*time.Hour), start)
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
