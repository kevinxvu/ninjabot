package server

import (
	"os"
	"strconv"
)

type Config struct {
	Port          int
	APIKey        string
	APISecret     string
	TelegramToken string
	TelegramUser  int
}

func LoadConfig() Config {
	user, _ := strconv.Atoi(os.Getenv("TELEGRAM_USER"))
	cfg := Config{
		Port:          8080, // Default port
		APIKey:        os.Getenv("API_KEY"),
		APISecret:     os.Getenv("API_SECRET"),
		TelegramToken: os.Getenv("TELEGRAM_TOKEN"),
		TelegramUser:  user,
	}

	if portStr, ok := os.LookupEnv("PORT"); ok {
		if port, err := strconv.Atoi(portStr); err == nil {
			cfg.Port = port
		}
	}

	return cfg
}
