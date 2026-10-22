package storage

import (
	"errors"
	"time"

	"github.com/rodrigo-brito/ninjabot/model"
)

// ErrNotFound is returned when a requested record does not exist.
var ErrNotFound = errors.New("not found")

type OrderFilter func(model.Order) bool

type Storage interface {
	CreateOrder(order *model.Order) error
	UpdateOrder(order *model.Order) error
	Orders(filters ...OrderFilter) ([]*model.Order, error)
	CreateSession(session *model.Session) error
	UpdateSession(session *model.Session) error
	GetSessionsByType(sessionType string) ([]*model.Session, error)
	GetSessionByID(id string) (*model.Session, error)
	DeleteSession(id string) error
	CreateSessionEvent(event *model.SessionEvent) error
	GetSessionEvents(sessionID string) ([]model.SessionEvent, error)
}

// TelegramAlertSettingsStorage persists the web app's Telegram alert settings.
type TelegramAlertSettingsStorage interface {
	// GetTelegramAlertSettings returns the saved settings, or the defaults when
	// none were saved yet.
	GetTelegramAlertSettings() (*model.TelegramAlertSettings, error)
	SaveTelegramAlertSettings(settings *model.TelegramAlertSettings) error
}

func WithStatusIn(status ...model.OrderStatusType) OrderFilter {
	return func(order model.Order) bool {
		for _, s := range status {
			if s == order.Status {
				return true
			}
		}
		return false
	}
}

func WithStatus(status model.OrderStatusType) OrderFilter {
	return func(order model.Order) bool {
		return order.Status == status
	}
}

func WithPair(pair string) OrderFilter {
	return func(order model.Order) bool {
		return order.Pair == pair
	}
}

func WithUpdateAtBeforeOrEqual(time time.Time) OrderFilter {
	return func(order model.Order) bool {
		return !order.UpdatedAt.After(time)
	}
}
