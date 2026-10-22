package server

import (
	"testing"

	"github.com/stretchr/testify/require"

	serverhandler "github.com/rodrigo-brito/ninjabot/server/handler"
)

func TestTradablePairs(t *testing.T) {
	pairs := map[string]serverhandler.PairInfo{
		"BTCUSDT":        {Asset: "BTC", Quote: "USDT"},
		"ETHBTC":         {Asset: "ETH", Quote: "BTC"},
		"BTCUSDT_260327": {Asset: "BTC", Quote: "USDT"},
		"BTCUPUSDT":      {Asset: "BTCUP", Quote: "USDT"},
		"1000PEPEUSDT":   {Asset: "1000PEPE", Quote: "USDT"},
	}
	trading := map[string]bool{"BTCUSDT": true, "ETHBTC": true}

	tt := []struct {
		name      string
		isTrading func(string) bool
		want      []string
	}{
		{"live exchange info", func(pair string) bool { return trading[pair] }, []string{"BTCUSDT", "ETHBTC"}},
		{"exchange unavailable", nil, []string{"BTCUSDT", "ETHBTC", "BTCUPUSDT", "1000PEPEUSDT"}},
	}

	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			got := tradablePairs(pairs, tc.isTrading)

			require.Len(t, got, len(tc.want))
			for _, pair := range tc.want {
				require.Contains(t, got, pair)
			}
		})
	}
}
