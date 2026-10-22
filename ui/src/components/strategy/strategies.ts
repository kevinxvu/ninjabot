export type StrategyParams = 'ema' | 'dca' | 'none';

export interface StrategyDefinition {
  value: string;
  label: string;
  params: StrategyParams;
  /** Strategies tuned for one timeframe force it in the setup form. */
  fixedTimeframe?: string;
  /** Short style label shown next to the name, e.g. "Trend following". */
  style: string;
  /** One-sentence explanation for tooltips and the setup form. */
  summary: string;
  /** Rules, mirroring strategy/strategies/*.go. Keep in sync with the Go code. */
  entry: string;
  exit: string;
  sizing: string;
  bestFor: string[];
  avoidWhen: string[];
  /** How to read this strategy's backtest results. */
  tip?: string;
  /** Whether realtime signal sessions can run it. */
  realtime: boolean;
}

export const STRATEGIES: StrategyDefinition[] = [
  {
    value: 'emacross',
    label: 'EMA Crossover',
    params: 'ema',
    style: 'Trend following',
    summary: 'Buys when a fast EMA crosses above a slow SMA and sells when it crosses back below.',
    entry: 'On a closed candle, the fast EMA crosses above the slow SMA while you hold at least 10 USDT.',
    exit: 'On a closed candle, the fast EMA crosses below the slow SMA. There is no stop-loss.',
    sizing: 'Buys with the whole quote balance and sells the whole position.',
    bestFor: [
      'Markets with clear, lasting up-trends',
      'A first strategy to test: two parameters, easy to read on the chart',
    ],
    avoidWhen: [
      'Sideways, choppy markets: frequent crosses cause many small losing trades',
      'You need protection against sudden crashes (no stop-loss)',
    ],
    tip: 'Shorter periods (e.g. 5/13) react faster but give more false signals; longer ones (e.g. 20/50) trade less and lag more.',
    realtime: true,
  },
  {
    value: 'dca',
    label: 'DCA (Dollar Cost Averaging)',
    params: 'dca',
    fixedTimeframe: '1d',
    style: 'Accumulation',
    summary: 'Buys a fixed USDT amount every N days, whatever the price, and never sells.',
    entry: 'On the first daily candle, then every time the chosen interval has passed since the last buy.',
    exit: 'None: it only accumulates.',
    sizing:
      'Spends the fixed amount per buy; the last buy uses what is left (at least 10 USDT), then it stops.',
    bestFor: [
      'Long-term accumulation of an asset you believe in',
      'Avoiding market timing: the average entry price smooths out volatility',
    ],
    avoidWhen: [
      'You want trades that take profit',
      'Long bear markets: the position stays at an unrealized loss',
    ],
    tip: 'DCA never closes a trade, so win rate and trade counts stay at 0. Judge it by final portfolio and gross profit.',
    realtime: false,
  },
  {
    value: 'ocosell',
    label: 'OCO Sell (Stochastic)',
    params: 'none',
    fixedTimeframe: '1d',
    style: 'Swing / mean reversion',
    summary: 'Buys when the Stochastic turns up and immediately sets a +10% take-profit and a -5% stop-loss.',
    entry: 'On a daily close, Stochastic %K (8, 3, 3) crosses above %D.',
    exit: 'An OCO order: take profit at +10% or stop-loss at -5% from the entry price, whichever is hit first.',
    sizing:
      'Up to 4,000 USDT per signal (the whole balance if less). A new signal can open another position.',
    bestFor: [
      'Markets swinging up and down in a range by 10% or more',
      'Fixed risk: every trade risks 5% to make 10% (2:1 reward/risk)',
    ],
    avoidWhen: [
      'Strong down-trends: the -5% stop is hit again and again',
      'Very calm markets: neither level is reached for a long time',
    ],
    tip: 'Each closed trade should show about +10% or -5%. Profit depends on win rate: above ~34% wins is profitable before fees.',
    realtime: false,
  },
  {
    value: 'trailingstop',
    label: 'Trailing Stop',
    params: 'none',
    fixedTimeframe: '4h',
    style: 'Trend following with stop',
    summary: 'Enters on an EMA 8 / SMA 21 cross and exits with a stop that follows the price up.',
    entry: 'On a closed 4h candle, EMA 8 crosses above SMA 21 while there is no open position.',
    exit: 'The stop starts at the entry candle low and rises as the price rises (never down). It sells when the price touches it, checked inside the candle.',
    sizing: 'Buys with the whole quote balance and sells the whole position.',
    bestFor: [
      'Strong trends: lets winners run while locking in gains',
      'Limiting the loss of a failed entry',
    ],
    avoidWhen: [
      'Choppy markets: normal pullbacks hit the stop early',
      'Very volatile coins where the entry candle low is far from the price',
    ],
    tip: 'Backtests feed hourly candles so the stop reacts inside each 4h candle, like it would live.',
    realtime: false,
  },
  {
    value: 'turtle',
    label: 'Turtle Trading',
    params: 'none',
    fixedTimeframe: '4h',
    style: 'Breakout',
    summary: 'Buys a breakout to a new 40-candle high and sells on a new 20-candle low.',
    entry: 'With no open position, the 4h close is the highest close of the last 40 candles.',
    exit: 'The 4h close is the lowest close of the last 20 candles.',
    sizing: 'Buys with half of the quote balance, keeping the rest in USDT.',
    bestFor: [
      'Markets breaking out of a range into a long trend',
      'Riding big moves for weeks with few trades',
    ],
    avoidWhen: [
      'Range-bound markets: false breakouts buy the top of the range',
      'You want quick exits: waiting for a 20-candle low gives back part of the gain',
    ],
    tip: 'Expect a low win rate with a few large winners; payoff and profit factor matter more than win rate.',
    realtime: false,
  },
];

/** Strategies the realtime signal engine can run. */
export const REALTIME_STRATEGIES = STRATEGIES.filter((strategy) => strategy.realtime);

export function getStrategy(value: string) {
  return STRATEGIES.find((strategy) => strategy.value === value);
}

/** Which strategy fits which market, for the guide's quick pick table. */
export const STRATEGY_PICKS: { situation: string; strategy: string }[] = [
  { situation: 'Clear up-trend, you want simple signals', strategy: 'emacross' },
  { situation: 'Strong trend, you want to protect profits', strategy: 'trailingstop' },
  { situation: 'Range that may break out into a big move', strategy: 'turtle' },
  { situation: 'Price swinging up and down in a range', strategy: 'ocosell' },
  { situation: 'Long-term buying, no market timing', strategy: 'dca' },
];
