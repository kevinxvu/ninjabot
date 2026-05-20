package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/model"
)

// HandleStartRealtimeSignal POST /api/realtime-signals/start
func (h *Handler) HandleStartRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req StartSignalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.Pair == "" || req.Timeframe == "" || req.Strategy == "" || req.InitialAsset == "" || req.InitialAmount <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing required fields"})
		return
	}

	session, err := h.signalMgr.StartSession(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, session)
}

// HandleDeleteRealtimeSignal DELETE /api/realtime-signals/:id
func (h *Handler) HandleDeleteRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	sessionID := pathParts[3]

	h.signalMgr.StopSession(sessionID)

	err := h.db.DeleteSession(sessionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// HandleStopRealtimeSignal POST /api/realtime-signals/:id/stop
func (h *Handler) HandleStopRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	sessionID := pathParts[3]

	err := h.signalMgr.StopSession(sessionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// HandleResumeRealtimeSignal POST /api/realtime-signals/:id/resume
func (h *Handler) HandleResumeRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	sessionID := pathParts[3]

	session, err := h.signalMgr.ResumeSession(r.Context(), sessionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, session)
}

// HandleListRealtimeSignals GET /api/realtime-signals
func (h *Handler) HandleListRealtimeSignals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessions, err := h.db.GetSessionsByType("REALTIME_SIGNAL")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	for _, sess := range sessions {
		h.signalMgr.mu.Lock()
		if _, ok := h.signalMgr.bots[sess.ID]; ok {
			sess.Status = "running"
		} else if sess.Status == "running" {
			sess.Status = "stopped"
			h.db.UpdateSession(sess)
		}
		h.signalMgr.mu.Unlock()
	}

	writeJSON(w, http.StatusOK, sessions)
}

func (h *Handler) HandleSessionChart(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	id := parts[2]

	chart, err := h.signalMgr.GetSessionChart(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	session, err := h.signalMgr.db.GetSessionByID(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-type", "application/json")

	asset, quote := exchange.SplitAssetQuote(session.Pair)
	assetValues, equityValues := chart.EquityValuesByPair(session.Pair)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"candles":       chart.CandlesByPair(session.Pair),
		"indicators":    chart.IndicatorsByPair(session.Pair),
		"shapes":        chart.ShapesByPair(session.Pair),
		"events":        sessionEventsForDisplay(session),
		"asset_values":  assetValues,
		"equity_values": equityValues,
		"quote":         quote,
		"asset":         asset,
	})
}

// HandleGetRealtimeSignal GET /api/realtime-signals/:id
func (h *Handler) HandleGetRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid path"})
		return
	}
	sessionID := pathParts[3]

	session, err := h.db.GetSessionByID(sessionID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	h.signalMgr.mu.Lock()
	if _, ok := h.signalMgr.bots[sessionID]; ok {
		session.Status = "running"
	}
	h.signalMgr.mu.Unlock()

	if session.Status == "running" {
		balances, err := h.signalMgr.GetSessionBalances(sessionID)
		if err == nil {
			session.Balances = balances
		}
	} else {
		balancesMap := CalculateBalancesFromOrders(session)

		for asset, amount := range balancesMap {
			if amount > 0.00000001 {
				session.Balances = append(session.Balances, model.Balance{
					Asset: asset,
					Free:  amount,
					Lock:  0,
				})
			}
		}
	}
	session.Events = sessionEventsForDisplay(session)

	writeJSON(w, http.StatusOK, session)
}
