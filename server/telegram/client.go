// Package telegram is a minimal Telegram Bot API client used by the web app
// to deliver realtime signal alerts.
package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// DefaultBaseURL is the public Telegram Bot API endpoint.
const DefaultBaseURL = "https://api.telegram.org"

// Client sends messages through the Telegram Bot API.
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// NewClient returns a Client for the public Telegram Bot API.
func NewClient() *Client {
	return &Client{
		BaseURL: DefaultBaseURL,
		HTTP:    &http.Client{Timeout: 15 * time.Second},
	}
}

// Message is a single text message. Text uses Telegram's HTML parse mode, so
// dynamic values must go through EscapeHTML.
type Message struct {
	ChatID string
	Text   string
	Silent bool
}

type sendMessageRequest struct {
	ChatID              string `json:"chat_id"`
	Text                string `json:"text"`
	ParseMode           string `json:"parse_mode"`
	DisableNotification bool   `json:"disable_notification"`
	LinkPreviewOptions  struct {
		IsDisabled bool `json:"is_disabled"`
	} `json:"link_preview_options"`
}

type apiResponse struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
}

// SendMessage delivers msg with the bot identified by token. Returned errors
// never contain the token.
func (c *Client) SendMessage(ctx context.Context, token string, msg Message) error {
	if token == "" || msg.ChatID == "" {
		return errors.New("telegram bot token and chat ID are required")
	}

	payload := sendMessageRequest{
		ChatID:              msg.ChatID,
		Text:                msg.Text,
		ParseMode:           "HTML",
		DisableNotification: msg.Silent,
	}
	payload.LinkPreviewOptions.IsDisabled = true
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode telegram message: %w", err)
	}

	endpoint := strings.TrimRight(c.BaseURL, "/") + "/bot" + token + "/sendMessage"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return errors.New("telegram: invalid request")
	}
	req.Header.Set("Content-Type", "application/json")

	httpClient := c.HTTP
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		// *url.Error embeds the request URL, which contains the token.
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			err = urlErr.Err
		}
		return fmt.Errorf("telegram request failed: %w", err)
	}
	defer resp.Body.Close()

	var result apiResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("telegram: unexpected response (HTTP %d)", resp.StatusCode)
	}
	if !result.OK {
		if result.Description == "" {
			result.Description = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return fmt.Errorf("telegram: %s", result.Description)
	}
	return nil
}

// EscapeHTML escapes s for Telegram's HTML parse mode.
func EscapeHTML(s string) string {
	return htmlEscaper.Replace(s)
}

var htmlEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
