package storage

import (
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"sync/atomic"

	"github.com/tidwall/buntdb"

	"github.com/rodrigo-brito/ninjabot/model"
)

type Bunt struct {
	lastID int64
	db     *buntdb.DB
}

func FromMemory() (Storage, error) {
	return newBunt(":memory:")
}

func FromFile(file string) (Storage, error) {
	return newBunt(file)
}

func newBunt(sourceFile string) (Storage, error) {
	db, err := buntdb.Open(sourceFile)
	if err != nil {
		return nil, err
	}

	err = db.CreateIndex("update_index", "*", buntdb.IndexJSON("updated_at"))
	if err != nil {
		return nil, err
	}

	return &Bunt{
		db: db,
	}, nil
}

func (b *Bunt) getID() int64 {
	return atomic.AddInt64(&b.lastID, 1)
}

func (b *Bunt) CreateOrder(order *model.Order) error {
	return b.db.Update(func(tx *buntdb.Tx) error {
		order.ID = b.getID()
		content, err := json.Marshal(order)
		if err != nil {
			return err
		}

		_, _, err = tx.Set(strconv.FormatInt(order.ID, 10), string(content), nil)
		return err
	})
}

func (b Bunt) UpdateOrder(order *model.Order) error {
	return b.db.Update(func(tx *buntdb.Tx) error {
		id := strconv.FormatInt(order.ID, 10)

		content, err := json.Marshal(order)
		if err != nil {
			return err
		}

		_, _, err = tx.Set(id, string(content), nil)
		return err
	})
}

func (b Bunt) Orders(filters ...OrderFilter) ([]*model.Order, error) {
	orders := make([]*model.Order, 0)
	err := b.db.View(func(tx *buntdb.Tx) error {
		err := tx.Ascend("update_index", func(_, value string) bool {
			var order model.Order
			err := json.Unmarshal([]byte(value), &order)
			if err != nil {
				log.Println(err)
				return true
			}

			for _, filter := range filters {
				if ok := filter(order); !ok {
					return true
				}
			}

			orders = append(orders, &order)

			return true
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	return orders, nil
}

func (b *Bunt) CreateSession(session *model.Session) error {
	return b.db.Update(func(tx *buntdb.Tx) error {
		content, err := json.Marshal(session)
		if err != nil {
			return err
		}
		_, _, err = tx.Set("session_"+session.ID, string(content), nil)
		return err
	})
}

func (b *Bunt) UpdateSession(session *model.Session) error {
	return b.CreateSession(session) // BuntDB Set works as upsert
}

func (b *Bunt) GetSessionsByType(sessionType string) ([]*model.Session, error) {
	var sessions []*model.Session
	err := b.db.View(func(tx *buntdb.Tx) error {
		err := tx.AscendKeys("session_*", func(key, value string) bool {
			var session model.Session
			if err := json.Unmarshal([]byte(value), &session); err != nil {
				return true
			}
			if session.Type == sessionType {
				sessions = append(sessions, &session)
			}
			return true
		})
		return err
	})
	return sessions, err
}

func (b *Bunt) GetSessionByID(id string) (*model.Session, error) {
	return nil, fmt.Errorf("not implemented")
}

func (b *Bunt) DeleteSession(id string) error {
	return fmt.Errorf("not implemented")
}

func (b *Bunt) CreateSessionEvent(event *model.SessionEvent) error {
	return fmt.Errorf("not implemented")
}

func (b *Bunt) GetSessionEvents(sessionID string) ([]model.SessionEvent, error) {
	return nil, fmt.Errorf("not implemented")
}
