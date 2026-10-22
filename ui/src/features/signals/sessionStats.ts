import type { SessionStats, SignalSession } from '@/api/types';
import { splitPair } from '@/lib/pairs';

/**
 * Re-values the session stats at a live ticker price (same formula as the
 * backend), so PnL moves between session reloads. Returns the server stats
 * unchanged when the price or an asset value is unknown.
 */
export function liveSessionStats(session: SignalSession, price: number): SessionStats | undefined {
  const stats = session.stats;
  if (!stats || price <= 0) return stats;

  const { asset: base, quote } = splitPair(session.pair);
  const valueOf = (asset: string, amount: number) =>
    asset === quote ? amount : asset === base ? amount * price : null;

  const initialValue = valueOf(session.initial_asset, session.initial_amount);
  if (initialValue === null) return stats;

  let currentValue = 0;
  for (const balance of session.balances ?? []) {
    const amount = balance.free + balance.lock;
    const value = valueOf(balance.asset, amount);
    if (value === null) {
      if (amount === 0) continue;
      return stats;
    }
    currentValue += value;
  }

  const pnl = currentValue - initialValue;
  return {
    ...stats,
    current_price: price,
    initial_value: initialValue,
    current_value: currentValue,
    pnl,
    pnl_pct: initialValue > 0 ? (pnl / initialValue) * 100 : null,
  };
}
