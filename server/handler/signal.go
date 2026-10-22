package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/internal/registry"
	"github.com/rodrigo-brito/ninjabot/model"
)

const signalsPathPrefix = "/api/realtime-signals/"

// HandleRealtimeSignal dispatches /api/realtime-signals/:id[/action].
func (h *Handler) HandleRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	id, action, _ := strings.Cut(strings.Trim(strings.TrimPrefix(r.URL.Path, signalsPathPrefix), "/"), "/")
	if id == "" {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	switch action {
	case "":
		if r.Method == http.MethodDelete {
			h.handleDeleteRealtimeSignal(w, id)
			return
		}
		if allowMethod(w, r, http.MethodGet) {
			h.handleGetRealtimeSignal(w, id)
		}
	case "stop":
		if allowMethod(w, r, http.MethodPost) {
			h.handleStopRealtimeSignal(w, id)
		}
	case "resume":
		if allowMethod(w, r, http.MethodPost) {
			h.handleResumeRealtimeSignal(w, r, id)
		}
	case "chart":
		if allowMethod(w, r, http.MethodGet) {
			h.handleSessionChart(w, r, id)
		}
	default:
		writeError(w, http.StatusNotFound, "not found")
	}
}

// HandleStartRealtimeSignal POST /api/realtime-signals/start
func (h *Handler) HandleStartRealtimeSignal(w http.ResponseWriter, r *http.Request) {
	if !allowMethod(w, r, http.MethodPost) {
		return
	}

	var req StartSignalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := normalizeStartRequest(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := h.signalMgr.StartSession(r.Context(), req)
	if err != nil {
		writeError(w, errorStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusOK, session)
}

// handleDeleteRealtimeSignal DELETE /api/realtime-signals/:id
func (h *Handler) handleDeleteRealtimeSignal(w http.ResponseWriter, id string) {
	if err := h.signalMgr.StopSession(id); err != nil {
		writeError(w, errorStatus(err), err.Error())
		return
	}

	if err := h.db.DeleteSession(id); err != nil {
		writeError(w, errorStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// handleStopRealtimeSignal POST /api/realtime-signals/:id/stop
func (h *Handler) handleStopRealtimeSignal(w http.ResponseWriter, id string) {
	if err := h.signalMgr.StopSession(id); err != nil {
		writeError(w, errorStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// handleResumeRealtimeSignal POST /api/realtime-signals/:id/resume
func (h *Handler) handleResumeRealtimeSignal(w http.ResponseWriter, r *http.Request, id string) {
	session, err := h.signalMgr.ResumeSession(r.Context(), id)
	if err != nil {
		writeError(w, errorStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusOK, session)
}

// HandleListRealtimeSignals GET /api/realtime-signals
func (h *Handler) HandleListRealtimeSignals(w http.ResponseWriter, r *http.Request) {
	if !allowMethod(w, r, http.MethodGet) {
		return
	}

	sessions, err := h.db.GetSessionsByType("REALTIME_SIGNAL")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Display-only overlay: the DB is kept in sync by the signal manager
	// (StopSession, bot exit, RecoverStaleSessions), so GET never writes.
	for _, sess := range sessions {
		if h.signalMgr.IsRunning(sess.ID) {
			sess.Status = "running"
		} else if sess.Status == "running" {
			sess.Status = "stopped"
		}
	}

	writeJSON(w, http.StatusOK, sessions)
}

// handleSessionChart GET /api/realtime-signals/:id/chart
func (h *Handler) handleSessionChart(w http.ResponseWriter, r *http.Request, id string) {
	chart, session, err := h.signalMgr.GetSessionChart(r.Context(), id)
	if err != nil {
		writeError(w, errorStatus(err), err.Error())
		return
	}

	asset, quote := exchange.SplitAssetQuote(session.Pair)
	assetValues, equityValues := chart.EquityValuesByPair(session.Pair)

	writeJSON(w, http.StatusOK, map[string]interface{}{
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

// handleGetRealtimeSignal GET /api/realtime-signals/:id
func (h *Handler) handleGetRealtimeSignal(w http.ResponseWriter, id string) {
	session, err := h.db.GetSessionByID(id)
	if err != nil {
		writeError(w, errorStatus(err), err.Error())
		return
	}

	if h.signalMgr.IsRunning(id) {
		session.Status = "running"
	} else if session.Status == "running" {
		session.Status = "stopped"
	}

	if session.Status == "running" {
		balances, err := h.signalMgr.GetSessionBalances(id)
		if err == nil {
			session.Balances = balances
		}
	}
	if session.Balances == nil {
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

// normalizeStartRequest trims and validates a start request and fills the
// strategy defaults, mirroring the backtest validation.
func normalizeStartRequest(req *StartSignalRequest) error {
	req.Pair = strings.ToUpper(strings.TrimSpace(req.Pair))
	req.Timeframe = strings.TrimSpace(req.Timeframe)
	req.Strategy = strings.TrimSpace(req.Strategy)
	req.InitialAsset = strings.ToUpper(strings.TrimSpace(req.InitialAsset))

	if req.Pair == "" || req.Timeframe == "" || req.Strategy == "" || req.InitialAsset == "" || req.InitialAmount <= 0 {
		return errors.New("missing required fields")
	}
	if asset, _ := exchange.SplitAssetQuote(req.Pair); asset == "" {
		return fmt.Errorf("unsupported pair %q", req.Pair)
	}
	if _, ok := timeframeDuration(req.Timeframe); !ok {
		return fmt.Errorf("invalid timeframe %q", req.Timeframe)
	}
	if !slices.Contains(registry.Registered(), req.Strategy) {
		return fmt.Errorf("unknown strategy %q", req.Strategy)
	}

	if req.Strategy != "emacross" {
		req.FastPeriod, req.SlowPeriod = 0, 0
		return nil
	}
	if req.FastPeriod <= 0 {
		req.FastPeriod = 8
	}
	if req.SlowPeriod <= 0 {
		req.SlowPeriod = 21
	}
	if req.FastPeriod >= req.SlowPeriod {
		return errors.New("fast_period must be less than slow_period")
	}
	return nil
}
