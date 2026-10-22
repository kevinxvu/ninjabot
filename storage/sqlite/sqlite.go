package sqlite

import (
	"errors"
	"fmt"
	"time"

	"github.com/samber/lo"
	"gorm.io/gorm"

	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/storage"
)

type SQL struct {
	db *gorm.DB
}

// FromSQL creates a new SQL connection for orders storage. Example of usage:
//
//	import "github.com/glebarez/sqlite"
//	store, err := sqlite.FromSQL(sqlite.Open("sqlite.db"), &gorm.Config{})
//	if err != nil {
//		log.Fatal(err)
//	}
func FromSQL(dialect gorm.Dialector, opts ...gorm.Option) (storage.Storage, error) {
	db, err := gorm.Open(dialect, opts...)
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	err = db.AutoMigrate(&model.Session{}, &model.Order{}, &model.SessionEvent{})
	if err != nil {
		return nil, err
	}

	return &SQL{
		db: db,
	}, nil
}

// CreateOrder creates a new order in a SQL database
func (s *SQL) CreateOrder(order *model.Order) error {
	result := s.db.Create(order)
	return result.Error
}

// UpdateOrder updates a given order
func (s *SQL) UpdateOrder(order *model.Order) error {
	o := model.Order{ID: order.ID}
	s.db.First(&o)
	o = *order
	result := s.db.Save(&o)
	return result.Error
}

// Orders filters a list of orders given a filter
func (s *SQL) Orders(filters ...storage.OrderFilter) ([]*model.Order, error) {
	orders := make([]*model.Order, 0)

	result := s.db.Find(&orders)
	if result.Error != nil && result.Error != gorm.ErrRecordNotFound {
		return orders, nil
	}

	return lo.Filter(orders, func(order *model.Order, _ int) bool {
		for _, filter := range filters {
			if !filter(*order) {
				return false
			}
		}
		return true
	}), nil
}

// CreateSession creates a new session in the database
func (s *SQL) CreateSession(session *model.Session) error {
	return s.db.Create(session).Error
}

// UpdateSession updates an existing session
func (s *SQL) UpdateSession(session *model.Session) error {
	return s.db.Save(session).Error
}

// GetSessionsByType returns all sessions of a specific type with their orders.
func (s *SQL) GetSessionsByType(sessionType string) ([]*model.Session, error) {
	var sessions []*model.Session
	err := s.db.Preload("Orders").Where("type = ?", sessionType).Order("created_at desc").Find(&sessions).Error
	return sessions, err
}

// GetSessionByID returns a specific session by its ID, including its orders and events.
func (s *SQL) GetSessionByID(id string) (*model.Session, error) {
	var session model.Session
	err := s.db.Preload("Orders").Preload("Events", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at asc")
	}).Where("id = ?", id).First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("session %s: %w", id, storage.ErrNotFound)
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (s *SQL) DeleteSession(id string) error {
	if err := s.db.Where("session_id = ?", id).Delete(&model.SessionEvent{}).Error; err != nil {
		return err
	}
	if err := s.db.Where("session_id = ?", id).Delete(&model.Order{}).Error; err != nil {
		return err
	}
	result := s.db.Where("id = ?", id).Delete(&model.Session{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("session %s: %w", id, storage.ErrNotFound)
	}
	return nil
}

func (s *SQL) CreateSessionEvent(event *model.SessionEvent) error {
	return s.db.Create(event).Error
}

func (s *SQL) GetSessionEvents(sessionID string) ([]model.SessionEvent, error) {
	var events []model.SessionEvent
	err := s.db.Where("session_id = ?", sessionID).Order("created_at asc").Find(&events).Error
	return events, err
}
