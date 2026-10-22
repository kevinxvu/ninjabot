import type { SessionStats } from '@/api/types';
import { StatCard } from '@/components/common/StatCard';
import { formatNumber, formatSignedPct, pnlTextClass, trendOf } from '@/lib/format';

/** KPI row of a realtime session: value, PnL, win rate and trade counts. */
export function SessionStatsGrid({ stats }: { stats: SessionStats }) {
  const { quote } = stats;
  const priced = stats.current_value !== null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Current Value"
        value={priced ? `${formatNumber(stats.current_value, 2)} ${quote}` : '-'}
        hint={
          priced
            ? `Initial capital now worth ${formatNumber(stats.initial_value, 2)} ${quote}`
            : 'Price unavailable'
        }
      />
      <StatCard
        label="PnL"
        value={formatSignedPct(stats.pnl_pct)}
        valueClassName={pnlTextClass(stats.pnl_pct)}
        hint={
          stats.pnl !== null
            ? `${stats.pnl >= 0 ? '+' : ''}${formatNumber(stats.pnl, 2)} ${quote}`
            : undefined
        }
        trend={stats.pnl !== null ? trendOf(stats.pnl) : 'neutral'}
      />
      <StatCard
        label="Win Rate"
        value={stats.win_rate !== null ? `${formatNumber(stats.win_rate * 100, 1)}%` : '-'}
        hint={
          stats.closed_trades > 0
            ? `${stats.wins}W / ${stats.closed_trades - stats.wins}L`
            : 'No closed trades yet'
        }
        trend={stats.win_rate !== null ? trendOf(stats.win_rate, 0.5) : 'neutral'}
      />
      <StatCard label="Trades" value={stats.trades} hint={`${stats.closed_trades} closed`} />
    </div>
  );
}
