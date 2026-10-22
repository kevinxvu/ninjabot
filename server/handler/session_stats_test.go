package handler

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/rodrigo-brito/ninjabot/model"
)

func TestComputeSessionStats(t *testing.T) {
	orders := []model.Order{
		{Pair: "BTCUSDT", Side: model.SideTypeBuy, Status: model.OrderStatusTypeFilled},
		{Pair: "BTCUSDT", Side: model.SideTypeSell, Status: model.OrderStatusTypeFilled, Profit: 0.02},
		{Pair: "BTCUSDT", Side: model.SideTypeBuy, Status: model.OrderStatusTypeFilled},
		{Pair: "BTCUSDT", Side: model.SideTypeSell, Status: model.OrderStatusTypeFilled, Profit: -0.01},
		{Pair: "BTCUSDT", Side: model.SideTypeSell, Status: model.OrderStatusTypeFilled, Profit: 0.03},
		{Pair: "BTCUSDT", Side: model.SideTypeBuy, Status: model.OrderStatusTypeCanceled},
	}

	tt := []struct {
		name         string
		session      model.Session
		balances     []model.Balance
		price        float64
		ok           bool
		initialValue float64
		currentValue float64
		pnlPct       float64
	}{
		{
			name:         "quote capital",
			session:      model.Session{Pair: "BTCUSDT", InitialAsset: "USDT", InitialAmount: 1000, Orders: orders},
			balances:     []model.Balance{{Asset: "BTC", Free: 0.01}, {Asset: "USDT", Free: 200}},
			price:        90000,
			ok:           true,
			initialValue: 1000,
			currentValue: 1100,
			pnlPct:       10,
		},
		{
			name:         "base capital is compared with holding it",
			session:      model.Session{Pair: "BTCUSDT", InitialAsset: "BTC", InitialAmount: 0.5, Orders: orders},
			balances:     []model.Balance{{Asset: "BTC", Free: 0.4}, {Asset: "USDT", Lock: 5000}, {Asset: "ETH"}},
			price:        100000,
			ok:           true,
			initialValue: 50000,
			currentValue: 45000,
			pnlPct:       -10,
		},
	}

	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			stats := computeSessionStats(&tc.session, tc.balances, tc.price, tc.ok)

			require.Equal(t, "USDT", stats.Quote)
			require.Equal(t, 5, stats.Trades)
			require.Equal(t, 3, stats.ClosedTrades)
			require.Equal(t, 2, stats.Wins)
			require.InDelta(t, 2.0/3.0, *stats.WinRate, 1e-9)
			require.InDelta(t, tc.initialValue, *stats.InitialValue, 1e-6)
			require.InDelta(t, tc.currentValue, *stats.CurrentValue, 1e-6)
			require.InDelta(t, tc.currentValue-tc.initialValue, *stats.PnL, 1e-6)
			require.InDelta(t, tc.pnlPct, *stats.PnLPct, 1e-9)
		})
	}
}

func TestComputeSessionStatsWithoutPrice(t *testing.T) {
	session := model.Session{Pair: "BTCUSDT", InitialAsset: "USDT", InitialAmount: 1000}

	stats := computeSessionStats(&session, []model.Balance{{Asset: "USDT", Free: 1000}}, 0, false)

	require.Zero(t, stats.Trades)
	require.Nil(t, stats.WinRate)
	require.Nil(t, stats.CurrentPrice)
	require.Nil(t, stats.CurrentValue)
	require.Nil(t, stats.PnL)
	require.Nil(t, stats.PnLPct)
}

func TestComputeSessionStatsUnknownAsset(t *testing.T) {
	session := model.Session{Pair: "BTCUSDT", InitialAsset: "ETH", InitialAmount: 1}

	stats := computeSessionStats(&session, []model.Balance{{Asset: "ETH", Free: 1}}, 90000, true)

	require.Nil(t, stats.PnL)
}
