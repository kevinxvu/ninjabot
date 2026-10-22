package telegram

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

const token = "123:secret-token-value"

func TestSendMessage(t *testing.T) {
	var got sendMessageRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/bot"+token+"/sendMessage", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&got))
		if got.ChatID == "bad" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"ok":false,"description":"Bad Request: chat not found"}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	client := &Client{BaseURL: srv.URL, HTTP: srv.Client()}
	require.NoError(t, client.SendMessage(context.Background(), token, Message{ChatID: "42", Text: "hi", Silent: true}))
	require.Equal(t, "42", got.ChatID)
	require.Equal(t, "HTML", got.ParseMode)
	require.True(t, got.DisableNotification)

	err := client.SendMessage(context.Background(), token, Message{ChatID: "bad", Text: "hi"})
	require.EqualError(t, err, "telegram: Bad Request: chat not found")
}

func TestSendMessageErrorHidesToken(t *testing.T) {
	client := &Client{BaseURL: "http://127.0.0.1:1", HTTP: http.DefaultClient}
	err := client.SendMessage(context.Background(), token, Message{ChatID: "42", Text: "hi"})
	require.Error(t, err)
	require.NotContains(t, err.Error(), "secret-token-value")
}

func TestEscapeHTML(t *testing.T) {
	require.Equal(t, "a &lt;b&gt; &amp; c", EscapeHTML("a <b> & c"))
}
