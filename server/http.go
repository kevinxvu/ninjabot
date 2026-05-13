package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rodrigo-brito/ninjabot/tools/log"
)

func parsePairs(raw string) []string {
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(strings.ToUpper(p)); v != "" {
			result = append(result, v)
		}
	}
	return result
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Errorf("write json response: %v", err)
	}
}
