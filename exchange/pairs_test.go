package exchange

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSplitAssetQuote(t *testing.T) {
	tt := []struct {
		Pair  string
		Asset string
		Quote string
	}{
		{"BTCUSDT", "BTC", "USDT"},
		{"ETHBTC", "ETH", "BTC"},
		{"1000SHIBUSDT", "1000SHIB", "USDT"},
	}

	for _, tc := range tt {
		t.Run(tc.Pair, func(t *testing.T) {
			asset, quote := SplitAssetQuote(tc.Pair)
			require.Equal(t, tc.Asset, asset)
			require.Equal(t, tc.Quote, quote)
		})
	}
}

func TestUpdatePairFile(t *testing.T) {
	t.Skip() // it is not a test, just utility function to update pairs list
	err := updatePairsFile()
	require.NoError(t, err)
}
