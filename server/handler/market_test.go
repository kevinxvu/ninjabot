package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHandlePairs(t *testing.T) {
	h := &Handler{pairsData: map[string]PairInfo{
		"ETHUSDT": {Asset: "ETH", Quote: "USDT"},
		"BTCUSDT": {Asset: "BTC", Quote: "USDT"},
	}}

	rec := httptest.NewRecorder()
	h.HandlePairs(rec, httptest.NewRequest(http.MethodGet, "/api/pairs", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "no-cache", rec.Header().Get("Cache-Control"), "a cached list outlives server restarts")

	var body struct{ Pairs []string }
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, []string{"BTCUSDT", "ETHUSDT"}, body.Pairs)
}
