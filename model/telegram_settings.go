package model

import "time"

// TelegramAlertSettingsID is the primary key of the single TelegramAlertSettings row.
const TelegramAlertSettingsID = 1

// TelegramAlertSettings configures the Telegram alerts sent by realtime signal
// sessions. Alerts are informational only: they never place real orders.
type TelegramAlertSettings struct {
	ID       uint   `json:"-" gorm:"primaryKey"`
	Enabled  bool   `json:"enabled"`
	BotToken string `json:"-"`
	// ChatID is a numeric user/group ID or a public channel username (@name).
	ChatID              string `json:"chat_id"`
	NotifyBuy           bool   `json:"notify_buy"`
	NotifySell          bool   `json:"notify_sell"`
	NotifySessionEvents bool   `json:"notify_session_events"`
	// Silent delivers messages without a notification sound.
	Silent    bool      `json:"silent"`
	UpdatedAt time.Time `json:"updated_at"`
}

// DefaultTelegramAlertSettings returns the settings used before any are saved.
func DefaultTelegramAlertSettings() *TelegramAlertSettings {
	return &TelegramAlertSettings{
		ID:         TelegramAlertSettingsID,
		NotifyBuy:  true,
		NotifySell: true,
	}
}

// Configured reports whether alerts can be delivered.
func (s *TelegramAlertSettings) Configured() bool {
	return s != nil && s.BotToken != "" && s.ChatID != ""
}
