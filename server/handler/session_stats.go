package handler

import (
	"context"

	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

// computeSessionStats builds the performance summary of a session from its
// orders and wallet balances. price is the pair's last price; pass ok=false
// when it is unknown and only trade counts are filled.
func computeSessionStats(session *model.Session, balances []model.Balance, price float64, ok bool) *model.SessionStats {
	base, quote := exchange.SplitAssetQuote(session.Pair)
	stats := &model.SessionStats{Quote: quote}

	for _, order := range session.Orders {
		if order.Status != model.OrderStatusTypeFilled {
			continue
		}
		stats.Trades++
		if order.Profit == 0 {
			continue
		}
		stats.ClosedTrades++
		if order.Profit > 0 {
			stats.Wins++
		}
	}
	if stats.ClosedTrades > 0 {
		winRate := float64(stats.Wins) / float64(stats.ClosedTrades)
		stats.WinRate = &winRate
	}

	if !ok || price <= 0 {
		return stats
	}

	valueOf := func(asset string, amount float64) (float64, bool) {
		switch asset {
		case quote:
			return amount, true
		case base:
			return amount * price, true
		}
		return 0, false
	}

	initialValue, known := valueOf(session.InitialAsset, session.InitialAmount)
	if !known {
		return stats
	}

	var currentValue float64
	for _, balance := range balances {
		amount := balance.Free + balance.Lock
		value, known := valueOf(balance.Asset, amount)
		if !known {
			if amount == 0 {
				continue
			}
			return stats
		}
		currentValue += value
	}

	pnl := currentValue - initialValue
	stats.CurrentPrice = &price
	stats.InitialValue = &initialValue
	stats.CurrentValue = &currentValue
	stats.PnL = &pnl
	if initialValue > 0 {
		pnlPct := pnl / initialValue * 100
		stats.PnLPct = &pnlPct
	}
	return stats
}

// sessionBalances returns the wallet of a session: the live paper wallet for
// running sessions, otherwise balances rebuilt from the order history.
func (h *Handler) sessionBalances(session *model.Session) []model.Balance {
	if session.Status == "running" {
		if balances, err := h.signalMgr.GetSessionBalances(session.ID); err == nil {
			return balances
		}
	}

	var balances []model.Balance
	for asset, amount := range CalculateBalancesFromOrders(session) {
		if amount > 0.00000001 {
			balances = append(balances, model.Balance{Asset: asset, Free: amount})
		}
	}
	return balances
}

// sessionPrices returns the last price of each pair. Pairs whose quote fails
// are missing from the result, so their stats only carry trade counts.
func (h *Handler) sessionPrices(ctx context.Context, sessions ...*model.Session) map[string]float64 {
	if h.exc == nil || len(sessions) == 0 {
		return map[string]float64{}
	}

	seen := make(map[string]bool)
	pairs := make([]string, 0, len(sessions))
	for _, session := range sessions {
		if !seen[session.Pair] {
			seen[session.Pair] = true
			pairs = append(pairs, session.Pair)
		}
	}

	prices, err := h.lastQuotes(ctx, pairs)
	if err != nil {
		log.Warnf("session prices: %v", err)
	}
	return prices
}
