package main

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"

	ninjabot "github.com/rodrigo-brito/ninjabot"
	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/tools/log"
	"github.com/rodrigo-brito/ninjabot/tools/metrics"
)

// computeHistogram divides returns (as fractions, e.g. 0.032 = 3.2%) into
// numBuckets equal-width bins and returns each bin's %count and display label.
func computeHistogram(returns []float64, numBuckets int) []returnBucket {
	if len(returns) == 0 || numBuckets <= 0 {
		return nil
	}

	sorted := make([]float64, len(returns))
	copy(sorted, returns)
	sort.Float64s(sorted)

	minVal := sorted[0] * 100
	maxVal := sorted[len(sorted)-1] * 100

	if minVal == maxVal {
		return []returnBucket{{
			Label: fmt.Sprintf("%.2f%%", minVal),
			From:  minVal, To: maxVal,
			Count: len(returns), Pct: 100,
		}}
	}

	width := (maxVal - minVal) / float64(numBuckets)
	buckets := make([]returnBucket, numBuckets)
	for i := range buckets {
		from := minVal + float64(i)*width
		to := minVal + float64(i+1)*width
		buckets[i] = returnBucket{
			Label: fmt.Sprintf("%.1f / %.1f", from, to),
			From:  math.Round(from*100) / 100,
			To:    math.Round(to*100) / 100,
		}
	}

	for _, r := range returns {
		pct := r * 100
		idx := int((pct - minVal) / width)
		if idx >= numBuckets {
			idx = numBuckets - 1
		}
		if idx < 0 {
			idx = 0
		}
		buckets[idx].Count++
	}

	total := len(returns)
	for i := range buckets {
		buckets[i].Pct = math.Round(float64(buckets[i].Count)/float64(total)*1000) / 10
	}
	return buckets
}

// computeSummary builds the full structured summary from the bot results and wallet.
func computeSummary(bot *ninjabot.NinjaBot, wallet *exchange.PaperWallet, req backtestRequest, pairs []string) json.RawMessage {
	ctrl := bot.Controller()
	equityValues := wallet.EquityValues()

	initialCapital := req.InitialCapital
	finalPortfolio := initialCapital
	if len(equityValues) > 0 {
		finalPortfolio = equityValues[len(equityValues)-1].Value
	}
	grossProfit := finalPortfolio - initialCapital
	grossProfitPct := 0.0
	if initialCapital > 0 {
		grossProfitPct = grossProfit / initialCapital * 100
	}
	maxDD, _, _ := wallet.MaxDrawdown()

	var (
		totalTrades         int
		totalWins           int
		totalLosses         int
		totalProfit         float64
		totalVolume         float64
		totalSQN            float64
		totalPayoffWeighted float64
		totalPFWeighted     float64
		totalWeightedCount  int
		allReturns          []float64
	)

	pairStats := make([]pairStat, 0, len(ctrl.Results))
	for pair, sm := range ctrl.Results {
		wins := sm.Win()
		loses := sm.Lose()
		returns := append(sm.WinPercent(), sm.LosePercent()...)
		trades := len(wins) + len(loses)

		var ciReturn, ciPayoff, ciPF metrics.BootstrapInterval
		if len(returns) > 0 {
			ciReturn = metrics.Bootstrap(returns, metrics.Mean, 10000, 0.95)
			ciPayoff = metrics.Bootstrap(returns, metrics.Payoff, 10000, 0.95)
			ciPF = metrics.Bootstrap(returns, metrics.ProfitFactor, 10000, 0.95)
		}

		pairStats = append(pairStats, pairStat{
			Pair:          pair,
			Trades:        trades,
			Win:           len(wins),
			Loss:          len(loses),
			WinPct:        sm.WinPercentage(),
			Payoff:        sm.Payoff(),
			ProfitFactor:  sm.ProfitFactor(),
			SQN:           sm.SQN(),
			Profit:        sm.Profit(),
			Volume:        sm.Volume,
			CIReturnMean:  ciReturn.Mean * 100,
			CIReturnLower: ciReturn.Lower * 100,
			CIReturnUpper: ciReturn.Upper * 100,
			CIPayoffMean:  ciPayoff.Mean,
			CIPayoffLower: ciPayoff.Lower,
			CIPayoffUpper: ciPayoff.Upper,
			CIPFMean:      ciPF.Mean,
			CIPFLower:     ciPF.Lower,
			CIPFUpper:     ciPF.Upper,
		})

		totalTrades += trades
		totalWins += len(wins)
		totalLosses += len(loses)
		totalProfit += sm.Profit()
		totalVolume += sm.Volume
		totalSQN += sm.SQN()
		totalPayoffWeighted += sm.Payoff() * float64(trades)
		totalPFWeighted += sm.ProfitFactor() * float64(trades)
		totalWeightedCount += trades
		allReturns = append(allReturns, returns...)
	}

	sort.Slice(pairStats, func(i, j int) bool { return pairStats[i].Pair < pairStats[j].Pair })

	winRate, avgPayoff, avgPF, avgSQN := 0.0, 0.0, 0.0, 0.0
	if totalTrades > 0 {
		winRate = float64(totalWins) / float64(totalTrades) * 100
	}
	if totalWeightedCount > 0 {
		avgPayoff = totalPayoffWeighted / float64(totalWeightedCount)
		avgPF = totalPFWeighted / float64(totalWeightedCount)
	}
	if n := len(ctrl.Results); n > 0 {
		avgSQN = totalSQN / float64(n)
	}

	// Final asset balances: last value from AssetValues (value in USDT)
	finalAssets := make([]assetBalance, 0, len(pairs))
	totalAssetValue := 0.0
	for _, pair := range pairs {
		asset, _ := exchange.SplitAssetQuote(pair)
		vals := wallet.AssetValues(asset)
		val := 0.0
		if len(vals) > 0 {
			val = vals[len(vals)-1].Value
		}
		finalAssets = append(finalAssets, assetBalance{Asset: asset, ValueUSDT: val})
		totalAssetValue += val
	}
	baseBalance := finalPortfolio - totalAssetValue

	strategyTitle := "EMA Crossover"
	if req.Strategy == "ocosell" {
		strategyTitle = "OCO Sell (Stochastic)"
	} else if req.Strategy == "trailingstop" {
		strategyTitle = "Trailing Stop"
	} else if req.Strategy == "turtle" {
		strategyTitle = "Turtle Trading"
	} else if req.Strategy == "dca" {
		strategyTitle = "DCA (Dollar Cost Averaging)"
	}

	strategyInfo := fmt.Sprintf("%s │ Timeframe: %s │ History: %d days", strategyTitle, req.Timeframe, req.Days)
	if req.Strategy == "emacross" {
		strategyInfo = fmt.Sprintf("%s (Fast=%d, Slow=%d) │ Timeframe: %s │ History: %d days", strategyTitle, req.FastPeriod, req.SlowPeriod, req.Timeframe, req.Days)
	} else if req.Strategy == "dca" {
		strategyInfo = fmt.Sprintf("%s (Interval=%d days, Buy=%.2f USDT) │ Timeframe: %s │ History: %d days", strategyTitle, req.DCAInterval, req.DCABuyAmount, req.Timeframe, req.Days)
	}

	data := summaryStat{
		StrategyInfo:    strategyInfo,
		BaseCoin:        strings.Split(pairs[0], "USDT")[0], // Fallback if needed, we'll display USDT anyway below
		InitialCapital:  initialCapital,
		FinalPortfolio:  math.Round(finalPortfolio*100) / 100,
		GrossProfit:     math.Round(grossProfit*100) / 100,
		GrossProfitPct:  math.Round(grossProfitPct*100) / 100,
		MaxDrawdownPct:  math.Round(maxDD*10000) / 100,
		TotalTrades:     totalTrades,
		TotalWins:       totalWins,
		TotalLosses:     totalLosses,
		TotalProfit:     math.Round(totalProfit*100) / 100,
		TotalVolume:     math.Round(totalVolume*100) / 100,
		WinRate:         math.Round(winRate*10) / 10,
		AvgPayoff:       math.Round(avgPayoff*1000) / 1000,
		AvgProfitFactor: math.Round(avgPF*1000) / 1000,
		AvgSQN:          math.Round(avgSQN*10) / 10,
		Pairs:           pairStats,
		ReturnBuckets:   computeHistogram(allReturns, 15),
		FinalAssets:     finalAssets,
		BaseBalance:     math.Round(baseBalance*100) / 100,
	}

	// Always override baseCoin to USDT for correct summary display
	data.BaseCoin = "USDT"

	b, err := json.Marshal(data)
	if err != nil {
		log.Errorf("marshal summary: %v", err)
		return nil
	}
	return b
}
