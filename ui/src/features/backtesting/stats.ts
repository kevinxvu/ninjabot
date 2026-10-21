import type { ChartData, Order, Timestamp } from '@/api/types';

export interface TradeRecord extends Order {
  /** Open time of the candle the order was filled in. */
  time: Timestamp;
}

export interface BacktestStats {
  totalTrades: number;
  buyOrders: number;
  sellOrders: number;
  profitableOrders: number;
  losingOrders: number;
  winRate: number;
  totalProfit: number;
  totalVolume: number;
  initialEquity: number;
  finalEquity: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: TradeRecord[];
}

/** Per-pair statistics derived client-side from the chart candles and equity curve. */
export function calculateStats(data: ChartData | undefined): BacktestStats | null {
  if (!data?.candles) return null;

  const trades: TradeRecord[] = data.candles.flatMap((candle) =>
    (candle.orders ?? [])
      .filter((order) => order.status === 'FILLED')
      .map((order) => ({ ...order, time: candle.time })),
  );

  const profitable = trades.filter((t) => t.profit && t.profit > 0).length;
  const losing = trades.filter((t) => t.profit && t.profit < 0).length;
  const decided = profitable + losing;

  const equity = data.equity_values ?? [];
  const initialEquity = equity.length ? equity[0].value : 0;
  const finalEquity = equity.length ? equity[equity.length - 1].value : initialEquity;

  let maxDrawdown = 0;
  let peak = initialEquity;
  for (const point of equity) {
    if (point.value > peak) peak = point.value;
    const drawdown = (peak - point.value) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    returns.push((equity[i].value - equity[i - 1].value) / equity[i - 1].value);
  }
  const avgReturn = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length
    ? Math.sqrt(returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length)
    : 0;

  return {
    totalTrades: trades.length,
    buyOrders: trades.filter((t) => t.side === 'BUY').length,
    sellOrders: trades.filter((t) => t.side === 'SELL').length,
    profitableOrders: profitable,
    losingOrders: losing,
    winRate: decided > 0 ? profitable / decided : 0,
    totalProfit: trades.reduce((sum, t) => sum + (t.profit || 0), 0),
    totalVolume: trades.reduce((sum, t) => sum + t.price * t.quantity, 0),
    initialEquity,
    finalEquity,
    totalReturn: initialEquity > 0 ? (finalEquity - initialEquity) / initialEquity : 0,
    maxDrawdown,
    sharpeRatio: stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0,
    trades,
  };
}
