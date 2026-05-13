package server

type backtestRequest struct {
	Pairs          string  `json:"pairs"`
	Timeframe      string  `json:"timeframe"`
	Days           int     `json:"days"`
	InitialCapital float64 `json:"initial_capital"`
	Strategy       string  `json:"strategy"`
	FastPeriod     int     `json:"fast_period"`
	SlowPeriod     int     `json:"slow_period"`
	DCAInterval    int     `json:"dca_interval"`
	DCABuyAmount   float64 `json:"dca_buy_amount"`
}

type backtestResponse struct {
	Pairs []string `json:"pairs,omitempty"`
	Error string   `json:"error,omitempty"`
}

type summaryStat struct {
	StrategyInfo    string         `json:"strategy_info"`
	BaseCoin        string         `json:"base_coin"`
	InitialCapital  float64        `json:"initial_capital"`
	FinalPortfolio  float64        `json:"final_portfolio"`
	GrossProfit     float64        `json:"gross_profit"`
	GrossProfitPct  float64        `json:"gross_profit_pct"`
	MaxDrawdownPct  float64        `json:"max_drawdown_pct"`
	TotalTrades     int            `json:"total_trades"`
	TotalWins       int            `json:"total_wins"`
	TotalLosses     int            `json:"total_losses"`
	TotalProfit     float64        `json:"total_profit"`
	TotalVolume     float64        `json:"total_volume"`
	WinRate         float64        `json:"win_rate"`
	AvgPayoff       float64        `json:"avg_payoff"`
	AvgProfitFactor float64        `json:"avg_profit_factor"`
	AvgSQN          float64        `json:"avg_sqn"`
	Pairs           []pairStat     `json:"pairs"`
	ReturnBuckets   []returnBucket `json:"return_buckets"`
	FinalAssets     []assetBalance `json:"final_assets"`
	BaseBalance     float64        `json:"base_balance"`
}

type pairStat struct {
	Pair          string  `json:"pair"`
	Trades        int     `json:"trades"`
	Win           int     `json:"win"`
	Loss          int     `json:"loss"`
	WinPct        float64 `json:"win_pct"`
	Payoff        float64 `json:"payoff"`
	ProfitFactor  float64 `json:"profit_factor"`
	SQN           float64 `json:"sqn"`
	Profit        float64 `json:"profit"`
	Volume        float64 `json:"volume"`
	CIReturnMean  float64 `json:"ci_return_mean"`
	CIReturnLower float64 `json:"ci_return_lower"`
	CIReturnUpper float64 `json:"ci_return_upper"`
	CIPayoffMean  float64 `json:"ci_payoff_mean"`
	CIPayoffLower float64 `json:"ci_payoff_lower"`
	CIPayoffUpper float64 `json:"ci_payoff_upper"`
	CIPFMean      float64 `json:"ci_pf_mean"`
	CIPFLower     float64 `json:"ci_pf_lower"`
	CIPFUpper     float64 `json:"ci_pf_upper"`
	AvgEntryPrice float64 `json:"avg_entry_price"`
}

type returnBucket struct {
	Label string  `json:"label"`
	From  float64 `json:"from"`
	To    float64 `json:"to"`
	Count int     `json:"count"`
	Pct   float64 `json:"pct"`
}

type assetBalance struct {
	Asset     string  `json:"asset"`
	ValueUSDT float64 `json:"value_usdt"`
}
