package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/server/telegram"
)

type fakeSender struct {
	mu       sync.Mutex
	err      error
	tokens   []string
	messages []telegram.Message
}

func (f *fakeSender) SendMessage(_ context.Context, token string, msg telegram.Message) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tokens = append(f.tokens, token)
	f.messages = append(f.messages, msg)
	return f.err
}

const testBotToken = "123456789:AAH-abcdefghijklmnopqrstuvwxyz0123"

func newAlertTestHandler(t *testing.T) (*Handler, *fakeSender) {
	t.Helper()
	h := newSignalTestHandler(t)
	sender := &fakeSender{}
	require.NotNil(t, h.signalMgr.alerter)
	h.signalMgr.alerter.sender = sender
	return h, sender
}

func TestFormatOrderAlert(t *testing.T) {
	session := &model.Session{ID: "0123456789abcdef", Strategy: "emacross", Timeframe: "1h", FastPeriod: 8, SlowPeriod: 21}
	at := time.Date(2026, 10, 22, 9, 30, 0, 0, time.UTC)

	buy := formatOrderAlert(session, model.Order{
		Pair: "BTCUSDT", Side: model.SideTypeBuy, Type: model.OrderTypeMarket,
		Status: model.OrderStatusTypeFilled, Price: 65000.5, Quantity: 0.01538, UpdatedAt: at,
	})
	for _, want := range []string{
		"BUY SIGNAL · BTCUSDT", "65000.5 USDT", "0.01538 BTC", "999.71 USDT",
		"emacross (8/21) · 1h", "<code>01234567</code>", "2026-10-22 09:30:00 UTC",
		"no real order was placed",
	} {
		require.Contains(t, buy, want)
	}
	require.NotContains(t, buy, "Trade result")

	sell := formatOrderAlert(session, model.Order{
		Pair: "ETHUSDT", Side: model.SideTypeSell, Type: model.OrderTypeMarket,
		Status: model.OrderStatusTypeFilled, Price: 2000, Quantity: 0.5, Profit: 0.0512, ProfitValue: 48.7, UpdatedAt: at,
	})
	require.Contains(t, sell, "SELL SIGNAL · ETHUSDT")
	require.Contains(t, sell, "+5.12% (+48.70 USDT)")
}

func TestSendOrderAlertGating(t *testing.T) {
	h, sender := newAlertTestHandler(t)
	alerter := h.signalMgr.alerter
	require.NoError(t, h.db.CreateSession(&model.Session{ID: "on", Pair: "BTCUSDT", TelegramAlerts: true}))
	require.NoError(t, h.db.CreateSession(&model.Session{ID: "off", Pair: "BTCUSDT"}))

	filledBuy := model.Order{Pair: "BTCUSDT", Side: model.SideTypeBuy, Status: model.OrderStatusTypeFilled, Price: 1, Quantity: 1}
	filledSell := filledBuy
	filledSell.Side = model.SideTypeSell

	// Defaults: alerts disabled globally.
	alerter.sendOrderAlert("on", filledBuy)
	require.Empty(t, sender.messages)

	require.NoError(t, alerter.settings.SaveTelegramAlertSettings(&model.TelegramAlertSettings{
		Enabled: true, BotToken: testBotToken, ChatID: "42", NotifyBuy: true, Silent: true,
	}))

	alerter.sendOrderAlert("off", filledBuy) // session opted out
	alerter.sendOrderAlert("on", filledSell) // sells disabled
	newOrder := filledBuy
	newOrder.Status = model.OrderStatusTypeNew
	alerter.sendOrderAlert("on", newOrder) // not filled
	require.Empty(t, sender.messages)

	alerter.sendOrderAlert("on", filledBuy)
	require.Len(t, sender.messages, 1)
	require.Equal(t, testBotToken, sender.tokens[0])
	require.Equal(t, "42", sender.messages[0].ChatID)
	require.True(t, sender.messages[0].Silent)
	require.Contains(t, sender.messages[0].Text, "BUY SIGNAL")
}

func TestTelegramSettingsAPI(t *testing.T) {
	h, sender := newAlertTestHandler(t)

	do := func(method, path, body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if strings.HasSuffix(path, "/test") {
			h.HandleTelegramTest(rec, req)
		} else {
			h.HandleTelegramSettings(rec, req)
		}
		return rec
	}

	rec := do(http.MethodGet, "/api/settings/telegram", "")
	require.Equal(t, http.StatusOK, rec.Code)
	var got telegramSettingsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.False(t, got.HasToken)
	require.True(t, got.NotifyBuy)
	require.True(t, got.NotifySell)

	tt := []struct {
		name   string
		body   string
		status int
	}{
		{"enable without token", `{"enabled":true,"chat_id":"42"}`, http.StatusBadRequest},
		{"bad token", `{"bot_token":"nope","chat_id":"42"}`, http.StatusBadRequest},
		{"bad chat id", `{"bot_token":"` + testBotToken + `","chat_id":"abc"}`, http.StatusBadRequest},
		{"valid", `{"enabled":true,"bot_token":"` + testBotToken + `","chat_id":"-1001234","notify_buy":true}`, http.StatusOK},
		{"keep token", `{"enabled":true,"chat_id":"@my_channel","notify_sell":true}`, http.StatusOK},
	}
	for _, tc := range tt {
		t.Run(tc.name, func(t *testing.T) {
			rec := do(http.MethodPut, "/api/settings/telegram", tc.body)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
			require.NotContains(t, rec.Body.String(), testBotToken)
		})
	}

	saved, err := h.signalMgr.alerter.settings.GetTelegramAlertSettings()
	require.NoError(t, err)
	require.Equal(t, testBotToken, saved.BotToken)
	require.Equal(t, "@my_channel", saved.ChatID)
	require.False(t, saved.NotifyBuy)
	require.True(t, saved.NotifySell)
	require.Equal(t, "123456789:••••0123", maskToken(saved.BotToken))

	// The test endpoint uses the submitted values without saving them.
	rec = do(http.MethodPost, "/api/settings/telegram/test", `{"chat_id":"777"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "777", sender.messages[0].ChatID)
	require.Equal(t, testBotToken, sender.tokens[0])

	sender.err = errors.New("telegram: Bad Request: chat not found")
	rec = do(http.MethodPost, "/api/settings/telegram/test", `{"chat_id":"777"}`)
	require.Equal(t, http.StatusBadGateway, rec.Code)
	require.Contains(t, rec.Body.String(), "chat not found")
}

func TestSetSessionTelegramAlerts(t *testing.T) {
	h, _ := newAlertTestHandler(t)
	require.NoError(t, h.db.CreateSession(&model.Session{ID: "s1", Type: "REALTIME_SIGNAL", Status: "stopped", Pair: "BTCUSDT"}))

	rec := httptest.NewRecorder()
	h.HandleRealtimeSignal(rec, httptest.NewRequest(http.MethodPost, "/api/realtime-signals/s1/telegram", strings.NewReader(`{"enabled":true}`)))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	session, err := h.db.GetSessionByID("s1")
	require.NoError(t, err)
	require.True(t, session.TelegramAlerts)

	rec = httptest.NewRecorder()
	h.HandleRealtimeSignal(rec, httptest.NewRequest(http.MethodPost, "/api/realtime-signals/missing/telegram", strings.NewReader(`{"enabled":true}`)))
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestRedactSecrets(t *testing.T) {
	body := `{"bot_token":"` + testBotToken + `","chat_id":"42"}`
	got := redactSecrets(body)
	require.NotContains(t, got, testBotToken)
	require.Contains(t, got, `"bot_token":"[REDACTED]"`)
	require.Contains(t, got, `"chat_id":"42"`)
}
