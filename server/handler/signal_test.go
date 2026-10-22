package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	gosqlite "github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/storage/sqlite"
)

func newSignalTestHandler(t *testing.T) *Handler {
	t.Helper()
	db, err := sqlite.FromSQL(gosqlite.Open(filepath.Join(t.TempDir(), "test.db")), &gorm.Config{})
	require.NoError(t, err)
	return &Handler{db: db, signalMgr: NewSignalManager(db, nil, nil)}
}

func TestHandleRealtimeSignalRouting(t *testing.T) {
	h := newSignalTestHandler(t)
	require.NoError(t, h.db.CreateSession(&model.Session{
		ID:        "stopped-1",
		Type:      "REALTIME_SIGNAL",
		Status:    "stopped",
		Pair:      "BTCUSDT",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}))

	tt := []struct {
		name   string
		method string
		path   string
		status int
	}{
		{"get unknown", http.MethodGet, "/api/realtime-signals/missing", http.StatusNotFound},
		{"stop unknown", http.MethodPost, "/api/realtime-signals/missing/stop", http.StatusNotFound},
		{"resume unknown", http.MethodPost, "/api/realtime-signals/missing/resume", http.StatusNotFound},
		{"chart unknown", http.MethodGet, "/api/realtime-signals/missing/chart", http.StatusNotFound},
		{"delete unknown", http.MethodDelete, "/api/realtime-signals/missing", http.StatusNotFound},
		{"unknown action", http.MethodGet, "/api/realtime-signals/stopped-1/foo", http.StatusNotFound},
		{"empty id", http.MethodGet, "/api/realtime-signals/", http.StatusNotFound},
		{"wrong method", http.MethodGet, "/api/realtime-signals/stopped-1/stop", http.StatusMethodNotAllowed},
		{"get existing", http.MethodGet, "/api/realtime-signals/stopped-1", http.StatusOK},
		{"stop already stopped", http.MethodPost, "/api/realtime-signals/stopped-1/stop", http.StatusOK},
		{"delete existing", http.MethodDelete, "/api/realtime-signals/stopped-1", http.StatusOK},
	}

	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.HandleRealtimeSignal(rec, httptest.NewRequest(tc.method, tc.path, nil))

			require.Equal(t, tc.status, rec.Code, rec.Body.String())
			require.Equal(t, "application/json", rec.Header().Get("Content-Type"))
			if tc.status >= http.StatusBadRequest {
				var body map[string]string
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
				require.NotEmpty(t, body["error"])
			}
		})
	}
}

func TestHandleListRealtimeSignalsDoesNotWrite(t *testing.T) {
	h := newSignalTestHandler(t)
	// Created after the manager recovered stale sessions, so it stays
	// "running" in the DB without a live bot.
	require.NoError(t, h.db.CreateSession(&model.Session{
		ID: "orphan", Type: "REALTIME_SIGNAL", Status: "running", Pair: "BTCUSDT",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}))

	rec := httptest.NewRecorder()
	h.HandleListRealtimeSignals(rec, httptest.NewRequest(http.MethodGet, "/api/realtime-signals", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	var sessions []model.Session
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &sessions))
	require.Len(t, sessions, 1)
	require.Equal(t, "stopped", sessions[0].Status)

	stored, err := h.db.GetSessionByID("orphan")
	require.NoError(t, err)
	require.Equal(t, "running", stored.Status)
}

func TestHandleListRealtimeSignalsIncludesStats(t *testing.T) {
	h := newSignalTestHandler(t)
	require.NoError(t, h.db.CreateSession(&model.Session{
		ID: "with-orders", Type: "REALTIME_SIGNAL", Status: "stopped", Pair: "BTCUSDT",
		InitialAsset: "USDT", InitialAmount: 1000, CreatedAt: time.Now(), UpdatedAt: time.Now(),
		Orders: []model.Order{
			{ExchangeID: 1, Pair: "BTCUSDT", Side: model.SideTypeBuy, Status: model.OrderStatusTypeFilled, Price: 100, Quantity: 1},
			{ExchangeID: 2, Pair: "BTCUSDT", Side: model.SideTypeSell, Status: model.OrderStatusTypeFilled, Price: 110, Quantity: 1, Profit: 0.1},
		},
	}))

	rec := httptest.NewRecorder()
	h.HandleListRealtimeSignals(rec, httptest.NewRequest(http.MethodGet, "/api/realtime-signals", nil))

	require.Equal(t, http.StatusOK, rec.Code)
	var sessions []model.Session
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &sessions))
	require.Len(t, sessions, 1)
	require.Empty(t, sessions[0].Orders)
	require.NotNil(t, sessions[0].Stats)
	require.Equal(t, 2, sessions[0].Stats.Trades)
	require.Equal(t, 1, sessions[0].Stats.Wins)
	// No exchange in tests, so values stay unknown.
	require.Nil(t, sessions[0].Stats.PnL)
}
