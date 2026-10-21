import { StatCard } from '@/components/common/StatCard';
import { formatNumber, formatPercent, trendOf } from '@/lib/format';
import type { BacktestStats } from '../stats';

export function StatsGrid({ stats, quote }: { stats: BacktestStats; quote: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <StatCard
        label="Portfolio Return"
        value={formatPercent(stats.totalReturn)}
        hint={`${formatNumber(stats.finalEquity - stats.initialEquity, 2)} ${quote}`}
        trend={trendOf(stats.totalReturn)}
      />
      <StatCard
        label="Win Rate"
        value={formatPercent(stats.winRate)}
        hint={`${stats.profitableOrders}W / ${stats.losingOrders}L`}
        trend={trendOf(stats.winRate, 0.5)}
      />
      <StatCard
        label="Total Trades"
        value={stats.totalTrades}
        hint={`${stats.buyOrders} Buy / ${stats.sellOrders} Sell`}
      />
      <StatCard
        label="Portfolio Max Drawdown"
        value={formatPercent(-stats.maxDrawdown)}
        hint="Peak to trough"
        trend={stats.maxDrawdown < 0.2 ? 'positive' : 'negative'}
      />
      <StatCard
        label="Portfolio Sharpe Ratio"
        value={formatNumber(stats.sharpeRatio, 2)}
        hint="Risk-adjusted return"
        trend={stats.sharpeRatio > 1 ? 'positive' : 'negative'}
      />
      <StatCard label="Total Volume" value={formatNumber(stats.totalVolume, 0)} hint={quote} />
    </div>
  );
}
