package server

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoadConfig(t *testing.T) {
	t.Run("defaults", func(t *testing.T) {
		t.Setenv("PORT", "")
		t.Setenv("DB_PATH", "")
		cfg := LoadConfig()
		require.Equal(t, 8080, cfg.Port)
		require.Equal(t, "ninjabot.db", cfg.DBPath)
	})

	t.Run("environment", func(t *testing.T) {
		t.Setenv("PORT", "9090")
		t.Setenv("DB_PATH", "/data/ninjabot.db")
		cfg := LoadConfig()
		require.Equal(t, 9090, cfg.Port)
		require.Equal(t, "/data/ninjabot.db", cfg.DBPath)
	})
}
