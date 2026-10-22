// Shapes of the JSON returned by the Go server (server/handler, plot, model packages).

export type Timestamp = string | number;

export type OrderSide = 'BUY' | 'SELL';

export interface Order {
  id: number;
  pair?: string;
  side: OrderSide | string;
  type: string;
  status: string;
  price: number;
  quantity: number;
  /** Realized profit ratio; non-zero only for orders that reduced or closed a position. */
  profit?: number;
  created_at?: Timestamp;
  updated_at?: Timestamp;
  session_id?: string;
}

/** Candle as serialized by the plot package (lowercase keys). */
export interface ChartCandle {
  time: Timestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  orders?: Order[];
}

/** Candle as serialized by model.Candle (Binance REST / websocket, capitalized keys). */
export interface MarketCandle {
  Time: Timestamp;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  Complete?: boolean;
}

export interface IndicatorMetric {
  name?: string;
  time: Timestamp[];
  value: (number | null)[];
  style?: string;
  color?: string;
}

export interface Indicator {
  name: string;
  overlay: boolean;
  metrics: IndicatorMetric[];
}

export interface ChartShape {
  x0: Timestamp;
  x1: Timestamp;
  y0: number;
  y1: number;
  color: string;
}

export interface TimeValue {
  time: Timestamp;
  value: number;
}

export type SessionEventType = 'START' | 'STOP' | 'RESUME';

export interface SessionEvent {
  id?: number;
  session_id?: string;
  type: SessionEventType | string;
  created_at: Timestamp;
}

export interface ChartData {
  candles: ChartCandle[];
  indicators?: Indicator[];
  shapes?: ChartShape[];
  events?: SessionEvent[];
  asset_values?: TimeValue[];
  equity_values?: TimeValue[];
  quote?: string;
  asset?: string;
  /** Max drawdown window; `value` is a non-positive percentage (-12.5 = -12.5%). Null when equity never dropped. */
  max_drawdown?: { start: Timestamp; end: Timestamp; value: number } | null;
}

export interface PairInfo {
  asset: string;
  quote: string;
  logo?: string;
}

export interface AssetBalance {
  asset: string;
  value_usdt: number;
}

/** GET /api/market/portfolio; the endpoint answers 503 when the Binance account is unavailable. */
export interface Portfolio {
  total_value_usdt: number;
  assets: AssetBalance[] | null;
}

// ---- Backtest ----

export interface BacktestRequest {
  pairs: string;
  timeframe: string;
  days: number;
  initial_capital: number;
  strategy: string;
  fast_period: number;
  slow_period: number;
  dca_interval: number;
  dca_buy_amount: number;
}

export interface PairStat {
  pair: string;
  trades: number;
  win: number;
  loss: number;
  win_pct: number;
  payoff: number;
  profit_factor: number;
  sqn: number;
  profit: number;
  volume: number;
  ci_return_mean: number;
  ci_return_lower: number;
  ci_return_upper: number;
  ci_payoff_mean: number;
  ci_payoff_lower: number;
  ci_payoff_upper: number;
  ci_pf_mean: number;
  ci_pf_lower: number;
  ci_pf_upper: number;
  avg_entry_price: number;
}

export interface ReturnBucket {
  label: string;
  from: number;
  to: number;
  count: number;
  pct: number;
}

export interface BacktestSummary {
  strategy_info: string;
  base_coin: string;
  initial_capital: number;
  final_portfolio: number;
  gross_profit: number;
  gross_profit_pct: number;
  max_drawdown_pct: number;
  total_trades: number;
  total_wins: number;
  total_losses: number;
  total_profit: number;
  total_volume: number;
  win_rate: number;
  avg_payoff: number;
  avg_profit_factor: number;
  avg_sqn: number;
  pairs: PairStat[];
  return_buckets: ReturnBucket[] | null;
  final_assets: AssetBalance[] | null;
  base_balance: number;
}

// ---- Realtime signals ----

export type SessionStatus = 'running' | 'stopped' | string;

export interface WalletBalance {
  asset: string;
  free: number;
  lock: number;
  leverage: number;
}

export interface SignalSession {
  id: string;
  type: string;
  status: SessionStatus;
  pair: string;
  strategy: string;
  timeframe: string;
  initial_asset: string;
  initial_amount: number;
  /** EMA periods for emacross sessions (0 means the strategy default; older sessions). */
  fast_period?: number;
  slow_period?: number;
  /** Sends a Telegram message on each BUY/SELL signal (see TelegramSettings). */
  telegram_alerts?: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  orders?: Order[] | null;
  events?: SessionEvent[] | null;
  balances?: WalletBalance[];
  stats?: SessionStats;
}

/** Session performance in the pair's quote asset; values are null when the price is unknown. */
export interface SessionStats {
  quote: string;
  current_price: number | null;
  /** Initial capital valued at the current price (PnL is measured against holding it). */
  initial_value: number | null;
  current_value: number | null;
  pnl: number | null;
  /** Percentage, e.g. 5 means +5%. */
  pnl_pct: number | null;
  /** Filled orders. */
  trades: number;
  /** Orders that realized a profit or loss. */
  closed_trades: number;
  wins: number;
  /** Ratio, null without closed trades. */
  win_rate: number | null;
}

export interface StartSignalRequest {
  pair: string;
  timeframe: string;
  strategy: string;
  initial_asset: string;
  initial_amount: number;
  fast_period: number;
  slow_period: number;
  telegram_alerts?: boolean;
}

// ---- Settings ----

/** Mirrors telegramSettingsResponse in server/handler/types.go. The bot token is never returned. */
export interface TelegramSettings {
  enabled: boolean;
  has_token: boolean;
  /** Masked token, e.g. "123456789:••••abcd". */
  token_hint: string;
  /** Numeric user/group ID or @channel. */
  chat_id: string;
  notify_buy: boolean;
  notify_sell: boolean;
  notify_session_events: boolean;
  silent: boolean;
  updated_at: Timestamp | null;
}

/** Body of PUT /api/settings/telegram and POST /api/settings/telegram/test. An empty bot_token keeps the saved one. */
export interface TelegramSettingsRequest {
  enabled: boolean;
  bot_token: string;
  chat_id: string;
  notify_buy: boolean;
  notify_sell: boolean;
  notify_session_events: boolean;
  silent: boolean;
}

// ---- Websocket ----

export type MarketSocketMessage =
  | { type: 'TICKER'; pair: string; price: number }
  | { type: 'CANDLE'; pair: string; data: MarketCandle }
  | { type: 'ORDER'; pair: string; session_id: string; data: Order }
  | { type: 'ERROR'; session_id: string; data: string };
