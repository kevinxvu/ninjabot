package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/rodrigo-brito/ninjabot/model"
)

var (
	botTokenPattern = regexp.MustCompile(`^\d+:[A-Za-z0-9_-]{20,}$`)
	chatIDPattern   = regexp.MustCompile(`^(-?\d+|@[A-Za-z][A-Za-z0-9_]{3,})$`)
)

// HandleTelegramSettings GET/PUT /api/settings/telegram
func (h *Handler) HandleTelegramSettings(w http.ResponseWriter, r *http.Request) {
	alerter := h.signalMgr.alerter
	if alerter == nil {
		writeError(w, http.StatusServiceUnavailable, "settings storage is unavailable")
		return
	}

	switch r.Method {
	case http.MethodGet:
		settings, err := alerter.settings.GetTelegramAlertSettings()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, newTelegramSettingsResponse(settings))
	case http.MethodPut:
		settings, ok := h.decodeTelegramSettings(w, r)
		if !ok {
			return
		}
		if settings.Enabled && !settings.Configured() {
			writeError(w, http.StatusBadRequest, "bot token and chat ID are required to enable alerts")
			return
		}
		settings.UpdatedAt = time.Now()
		if err := alerter.settings.SaveTelegramAlertSettings(settings); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, newTelegramSettingsResponse(settings))
	default:
		w.Header().Set("Allow", "GET, PUT")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// HandleTelegramTest POST /api/settings/telegram/test sends a test message
// with the submitted (possibly unsaved) settings.
func (h *Handler) HandleTelegramTest(w http.ResponseWriter, r *http.Request) {
	if !allowMethod(w, r, http.MethodPost) {
		return
	}
	alerter := h.signalMgr.alerter
	if alerter == nil {
		writeError(w, http.StatusServiceUnavailable, "settings storage is unavailable")
		return
	}

	settings, ok := h.decodeTelegramSettings(w, r)
	if !ok {
		return
	}
	if !settings.Configured() {
		writeError(w, http.StatusBadRequest, "bot token and chat ID are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), alertSendTimeout)
	defer cancel()
	if err := alerter.SendTest(ctx, settings); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

// decodeTelegramSettings parses and validates a settings request. An empty
// bot token keeps the saved one, so the UI never needs to read it back.
func (h *Handler) decodeTelegramSettings(w http.ResponseWriter, r *http.Request) (*model.TelegramAlertSettings, bool) {
	var req telegramSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return nil, false
	}

	settings, err := h.signalMgr.alerter.settings.GetTelegramAlertSettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return nil, false
	}
	if err := applyTelegramSettings(settings, req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return nil, false
	}
	return settings, true
}

func applyTelegramSettings(settings *model.TelegramAlertSettings, req telegramSettingsRequest) error {
	token := strings.TrimSpace(req.BotToken)
	chatID := strings.TrimSpace(req.ChatID)
	if token != "" && !botTokenPattern.MatchString(token) {
		return errors.New("invalid bot token format (expected 123456789:ABC...)")
	}
	if chatID != "" && !chatIDPattern.MatchString(chatID) {
		return errors.New("invalid chat ID (use a numeric ID such as 123456789 or -100123..., or @channelname)")
	}

	if token != "" {
		settings.BotToken = token
	}
	settings.Enabled = req.Enabled
	settings.ChatID = chatID
	settings.NotifyBuy = req.NotifyBuy
	settings.NotifySell = req.NotifySell
	settings.NotifySessionEvents = req.NotifySessionEvents
	settings.Silent = req.Silent
	return nil
}

func newTelegramSettingsResponse(settings *model.TelegramAlertSettings) telegramSettingsResponse {
	resp := telegramSettingsResponse{
		Enabled:             settings.Enabled,
		HasToken:            settings.BotToken != "",
		TokenHint:           maskToken(settings.BotToken),
		ChatID:              settings.ChatID,
		NotifyBuy:           settings.NotifyBuy,
		NotifySell:          settings.NotifySell,
		NotifySessionEvents: settings.NotifySessionEvents,
		Silent:              settings.Silent,
	}
	if !settings.UpdatedAt.IsZero() {
		resp.UpdatedAt = &settings.UpdatedAt
	}
	return resp
}

// maskToken keeps the public bot ID and the last 4 characters of the secret.
func maskToken(token string) string {
	botID, secret, ok := strings.Cut(token, ":")
	if !ok || len(secret) < 8 {
		if token == "" {
			return ""
		}
		return "••••"
	}
	return botID + ":••••" + secret[len(secret)-4:]
}
