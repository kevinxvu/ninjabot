package model

import "time"

type Session struct {
	ID            string  `json:"id" gorm:"primaryKey"`
	Type          string  `json:"type"`   // "REALTIME_SIGNAL"
	Status        string  `json:"status"` // "running", "stopped"
	Pair          string  `json:"pair"`
	Strategy      string  `json:"strategy"`
	Timeframe     string  `json:"timeframe"`
	InitialAsset  string  `json:"initial_asset"`
	InitialAmount float64 `json:"initial_amount"`
	FastPeriod    int     `json:"fast_period"`
	SlowPeriod    int     `json:"slow_period"`
	// TelegramAlerts sends a Telegram message for each signal of the session.
	TelegramAlerts bool           `json:"telegram_alerts"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	Orders         []Order        `json:"orders" gorm:"foreignKey:SessionID"`
	Events         []SessionEvent `json:"events" gorm:"foreignKey:SessionID"`

	// Dynamically populated via API if running
	Balances []Balance `json:"balances,omitempty" gorm:"-"`
	// Stats is computed by the API from the orders, balances and current price.
	Stats *SessionStats `json:"stats,omitempty" gorm:"-"`
}

// SessionStats summarizes a session's performance in the pair's quote asset.
// Value fields are nil when the current price is unknown.
type SessionStats struct {
	Quote        string   `json:"quote"`
	CurrentPrice *float64 `json:"current_price"`
	// InitialValue is the initial capital valued at the current price, so PnL
	// measures the strategy against simply holding the initial asset.
	InitialValue *float64 `json:"initial_value"`
	CurrentValue *float64 `json:"current_value"`
	PnL          *float64 `json:"pnl"`
	// PnLPct is the PnL as a percentage of InitialValue (5 means +5%).
	PnLPct *float64 `json:"pnl_pct"`
	// Trades counts filled orders; ClosedTrades those with a realized profit.
	Trades       int `json:"trades"`
	ClosedTrades int `json:"closed_trades"`
	Wins         int `json:"wins"`
	// WinRate is Wins/ClosedTrades as a ratio, nil without closed trades.
	WinRate *float64 `json:"win_rate"`
}
