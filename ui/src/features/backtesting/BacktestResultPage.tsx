import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';
import { backtestApi } from '@/api/backtest';
import { getErrorMessage } from '@/api/client';
import { EquityChart } from '@/components/charts/EquityChart';
import { PriceChart } from '@/components/charts/PriceChart';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { LoadingState } from '@/components/common/LoadingState';
import { SectionCard } from '@/components/common/SectionCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/utils';
import { BacktestSummary } from './components/BacktestSummary';
import { PerformanceChart } from './components/PerformanceChart';
import { StatsGrid } from './components/StatsGrid';
import { TradesTable } from './components/TradesTable';
import { calculateStats } from './stats';

export function BacktestResultPage() {
  const [searchParams] = useSearchParams();
  const pair = searchParams.get('pair');

  const chart = useAsync(pair ? `backtest-chart:${pair}` : null, () => backtestApi.getChartData(pair!));
  // The summary is optional (404 until a backtest has run), so its failure is ignored.
  const summary = useAsync('backtest-summary', backtestApi.getSummary);
  const stats = useMemo(() => calculateStats(chart.data), [chart.data]);

  if (!pair) {
    return (
      <EmptyState
        title="No trading pair selected"
        action={
          <Button asChild variant="link">
            <Link to="/backtesting">Return to Backtest Setup</Link>
          </Button>
        }
      />
    );
  }

  const pairs = summary.data?.pairs?.map((p) => p.pair) ?? [];
  const quote = chart.data?.quote || 'USDT';

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title={`Backtest · ${pair}`}
        description={summary.data?.strategy_info}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/backtesting">
                <Plus /> New Backtest
              </Link>
            </Button>
            <Button asChild>
              <a href={backtestApi.historyCsvUrl(pair)} download>
                <Download /> Export History
              </a>
            </Button>
          </>
        }
      >
        {pairs.length > 1 && (
          <nav className="mt-3 flex flex-wrap gap-2">
            {pairs.map((p) => (
              <Link
                key={p}
                to={`/backtesting/dashboard?pair=${encodeURIComponent(p)}`}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  p === pair
                    ? 'bg-brand-navy text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {p}
              </Link>
            ))}
          </nav>
        )}
      </PageHeader>

      {chart.loading ? (
        <LoadingState label="Loading trading data..." />
      ) : chart.error || !chart.data ? (
        <ErrorAlert message={getErrorMessage(chart.error, 'Failed to load data')} />
      ) : (
        <>
          {stats && <StatsGrid stats={stats} quote={quote} />}

          <PriceChart data={chart.data} />

          {!!chart.data.equity_values?.length && (
            <SectionCard title="Portfolio Equity & Position">
              <EquityChart data={chart.data} />
            </SectionCard>
          )}

          {!!stats?.trades.length && (
            <>
              <SectionCard title="Performance Analysis">
                <PerformanceChart trades={stats.trades} />
              </SectionCard>
              <SectionCard title="Recent Trades">
                <TradesTable trades={stats.trades} />
              </SectionCard>
            </>
          )}

          {summary.data?.pairs && <BacktestSummary summary={summary.data} />}
        </>
      )}
    </div>
  );
}
