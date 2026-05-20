package sqlite

import (
	"os"
	"testing"
	"time"

	"gorm.io/gorm"

	gosqlite "github.com/glebarez/sqlite"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/stretchr/testify/require"
)

func TestFromSQL(t *testing.T) {
	file, err := os.CreateTemp(os.TempDir(), "*.db")
	require.NoError(t, err)
	defer func() {
		os.RemoveAll(file.Name())
	}()

	repo, err := FromSQL(gosqlite.Open(file.Name()), &gorm.Config{})
	require.NoError(t, err)

	storageUseCase(repo, t)
}

func storageUseCase(repo storage.Storage, t *testing.T) {
	t.Helper()
	now := time.Now()

	firstOrder := &model.Order{
		ExchangeID: 1,
		Pair:       "BTCUSDT",
		Side:       model.SideTypeBuy,
		Type:       model.OrderTypeLimit,
		Status:     model.OrderStatusTypeNew,
		Price:      10,
		Quantity:   1,
		CreatedAt:  now.Add(-time.Minute),
		UpdatedAt:  now.Add(-time.Minute),
	}
	err := repo.CreateOrder(firstOrder)
	require.NoError(t, err)

	secondOrder := &model.Order{
		ExchangeID: 2,
		Pair:       "ETHUSDT",
		Side:       model.SideTypeBuy,
		Type:       model.OrderTypeLimit,
		Status:     model.OrderStatusTypeFilled,
		Price:      10,
		Quantity:   1,
		CreatedAt:  now.Add(time.Minute),
		UpdatedAt:  now.Add(time.Minute),
	}
	err = repo.CreateOrder(secondOrder)
	require.NoError(t, err)

	t.Run("filter with date restriction", func(t *testing.T) {
		orders, err := repo.Orders(storage.WithUpdateAtBeforeOrEqual(now))
		require.NoError(t, err)
		require.Len(t, orders, 1)
		require.Equal(t, orders[0].ExchangeID, int64(1))
	})

	t.Run("get all", func(t *testing.T) {
		orders, err := repo.Orders()
		require.NoError(t, err)
		require.Len(t, orders, 2)
		require.Equal(t, orders[0].ExchangeID, int64(1))
		require.Equal(t, orders[1].ExchangeID, int64(2))
	})

	t.Run("pair filter", func(t *testing.T) {
		orders, err := repo.Orders(storage.WithPair("ETHUSDT"))
		require.NoError(t, err)
		require.Len(t, orders, 1)
		require.Equal(t, orders[0].Pair, "ETHUSDT")
	})

	t.Run("status filter", func(t *testing.T) {
		orders, err := repo.Orders(storage.WithStatusIn(model.OrderStatusTypeFilled))
		require.NoError(t, err)
		require.Len(t, orders, 1)
		require.Equal(t, orders[0].ID, secondOrder.ID)
	})

	t.Run("update", func(t *testing.T) {
		firstOrder.Status = model.OrderStatusTypeCanceled
		err := repo.UpdateOrder(firstOrder)
		require.NoError(t, err)

		orders, err := repo.Orders(storage.WithStatus(model.OrderStatusTypeCanceled))
		require.NoError(t, err)
		require.Len(t, orders, 1)
		require.Equal(t, firstOrder.ID, orders[0].ID)
	})
}
