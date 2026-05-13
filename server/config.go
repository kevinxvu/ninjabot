package server

import (
	"os"
	"strconv"
)

type Config struct {
	Port int
}

func LoadConfig() Config {
	cfg := Config{
		Port: 8080, // Default port
	}

	if portStr, ok := os.LookupEnv("PORT"); ok {
		if port, err := strconv.Atoi(portStr); err == nil {
			cfg.Port = port
		}
	}

	return cfg
}
