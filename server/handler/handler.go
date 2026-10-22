package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"

	exbinance "github.com/rodrigo-brito/ninjabot/exchange/binance"
	"github.com/rodrigo-brito/ninjabot/plot"
	serverws "github.com/rodrigo-brito/ninjabot/server/ws"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// Handler bundles all HTTP handler dependencies.
type Handler struct {
	mu          sync.Mutex
	running     bool
	chart       *plot.Chart
	summaryJSON json.RawMessage
	exc         *exbinance.Binance
	wsManager   *serverws.MarketWebsocketManager
	pairsData   map[string]interface{}
	db          storage.Storage
	signalMgr   *SignalManager
}

// New creates a Handler with all its dependencies.
func New(
	chart *plot.Chart,
	exc *exbinance.Binance,
	wsManager *serverws.MarketWebsocketManager,
	pairsData map[string]interface{},
	db storage.Storage,
) *Handler {
	h := &Handler{
		chart:     chart,
		exc:       exc,
		wsManager: wsManager,
		pairsData: pairsData,
		db:        db,
	}
	h.signalMgr = NewSignalManager(db, exc, wsManager)
	return h
}

// parsePairs splits a comma-separated pair string and normalises each entry.
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

// writeJSON writes v as JSON with the given HTTP status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Errorf("write json response: %v", err)
	}
}

// writeError writes a JSON error body ({"error": msg}) with the given status.
// Every API error goes through it so the UI can rely on a single shape.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// errorStatus maps domain errors to HTTP status codes.
func errorStatus(err error) int {
	switch {
	case errors.Is(err, storage.ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrSessionBusy):
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

// allowMethod writes a 405 and returns false when r does not use method.
func allowMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	return false
}

// HandleNotFound answers unknown /api/ paths with a JSON 404 instead of
// falling through to the SPA index.html.
func (h *Handler) HandleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotFound, "not found")
}

// WithRecovery wraps an http.HandlerFunc with panic recovery.
// Any panic is logged as an error and a 500 response is returned to the client.
func WithRecovery(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Errorf("panic recovered [%s %s]: %v", r.Method, r.URL.Path, rec)
				writeError(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next(w, r)
	}
}

// withRequestLog logs the incoming request method, full URL (path + query),
// and — for POST requests — the request body (restored for downstream handlers).
func withRequestLog(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fullURL := r.URL.Path
		if q := r.URL.RawQuery; q != "" {
			fullURL += "?" + q
		}

		if r.Method == http.MethodPost {
			body, err := io.ReadAll(r.Body)
			if err != nil {
				log.Errorf("request log read body [%s %s]: %v", r.Method, fullURL, err)
			} else {
				log.Infof("request [%s %s] body: %s", r.Method, fullURL, strings.TrimSpace(string(body)))
				// Restore body so downstream handlers can read it again.
				r.Body = io.NopCloser(bytes.NewReader(body))
			}
		} else {
			log.Infof("request [%s %s]", r.Method, fullURL)
		}

		next(w, r)
	}
}

// Middleware combines request logging and panic recovery into a single wrapper.
// Usage: mux.HandleFunc("/path", Middleware(h.HandleSomething))
func Middleware(next http.HandlerFunc) http.HandlerFunc {
	return WithRecovery(withRequestLog(next))
}
