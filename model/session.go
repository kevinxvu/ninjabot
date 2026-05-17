package model

import "time"

type Session struct {
	ID            string    `json:"id" gorm:"primaryKey"`
	Type          string    `json:"type"`   // "REALTIME_SIGNAL"
	Status        string    `json:"status"` // "running", "stopped"
	Pair          string    `json:"pair"`
	Strategy      string    `json:"strategy"`
	Timeframe     string    `json:"timeframe"`
	InitialAsset  string    `json:"initial_asset"`
	InitialAmount float64   `json:"initial_amount"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	Orders        []Order   `json:"orders" gorm:"foreignKey:SessionID"`
}
