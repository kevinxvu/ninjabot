package model

import "time"

type SessionEventType string

const (
	SessionEventTypeStart  SessionEventType = "START"
	SessionEventTypeStop   SessionEventType = "STOP"
	SessionEventTypeResume SessionEventType = "RESUME"
)

type SessionEvent struct {
	ID        int64            `json:"id" gorm:"primaryKey,autoIncrement"`
	SessionID string           `json:"session_id" gorm:"index"`
	Type      SessionEventType `json:"type"`
	CreatedAt time.Time        `json:"created_at"`
}
