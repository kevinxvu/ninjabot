import type { ReactNode } from 'react';
import type { BacktestSummary as Summary, PairStat, ReturnBucket } from '@/api/types';
import { KeyValueList } from '@/components/common/KeyValueList';
import { SectionCard } from '@/components/common/SectionCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber, formatSignedPct, pnlTextClass } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Bordered sub-panel with a small uppercase title. */
function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border p-4', className)}>
      <h4 className="mb-4 label-style text-primary">{title}</h4>
      {children}
    </div>
  );
}

const winRateClass = (pct: number) => (pct >= 50 ? 'text-success' : 'text-destructive');

/** Aggregate result of the last backtest run across all pairs (from /api/summary). */
export function BacktestSummary({ summary }: { summary: Summary }) {
  const base = summary.base_coin || 'USDT';
  const grossClass = pnlTextClass(summary.gross_profit_pct);

  return (
    <SectionCard
      title="Backtest Summary"
      action={
        summary.strategy_info && (
          <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
            {summary.strategy_info}
          </Badge>
        )
      }
      contentClassName="space-y-6"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <StatCard label="Initial Capital" value={`${formatNumber(summary.initial_capital)} ${base}`} />
        <StatCard
          label="Final Portfolio"
          value={`${formatNumber(summary.final_portfolio)} ${base}`}
          valueClassName={grossClass}
          hint={`${formatSignedPct(summary.gross_profit_pct)} gross return`}
        />
        <StatCard
          label="Gross Profit"
          value={`${formatNumber(summary.gross_profit)} ${base}`}
          valueClassName={grossClass}
        />
        <StatCard
          label="Win Rate"
          value={`${formatNumber(summary.win_rate, 1)}%`}
          valueClassName={winRateClass(summary.win_rate)}
          hint={`${summary.total_wins} W / ${summary.total_losses} L / ${summary.total_trades} trades`}
        />
        <StatCard
          label="Avg Payoff"
          value={formatNumber(summary.avg_payoff, 3)}
          hint="avg win / avg loss ratio"
        />
        <StatCard
          label="Profit Factor"
          value={formatNumber(summary.avg_profit_factor, 3)}
          hint="gross win / gross loss"
        />
        <StatCard label="SQN" value={formatNumber(summary.avg_sqn, 1)} hint="System Quality Number" />
        <StatCard
          label="Max Drawdown"
          value={`${formatNumber(summary.max_drawdown_pct, 2)}%`}
          valueClassName={summary.max_drawdown_pct < 0 ? 'text-destructive' : undefined}
        />
        <StatCard label="Total Volume" value={`${formatNumber(summary.total_volume)} ${base}`} />
      </div>

      <Panel title="Per-Pair Performance">
        <PairPerformanceTable summary={summary} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Confidence Intervals (95%)">
          <ConfidenceIntervals pairs={summary.pairs} />
        </Panel>
        <Panel title="Return Distribution (%)">
          <ReturnDistribution buckets={summary.return_buckets ?? []} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Final Wallet">
          <KeyValueList
            items={[
              ...(summary.final_assets ?? []).map((asset) => ({
                label: <span className="font-semibold text-foreground">{asset.asset}</span>,
                value: `${formatNumber(asset.value_usdt)} USDT`,
                valueClassName: 'font-normal',
              })),
              {
                label: <span className="font-semibold text-foreground">{base}</span>,
                value: `${formatNumber(summary.base_balance)} USDT`,
                valueClassName: 'font-normal',
              },
              {
                label: <span className="font-bold text-foreground">Total Portfolio</span>,
                value: `${formatNumber(summary.final_portfolio)} USDT`,
                valueClassName: cn('font-bold', grossClass),
              },
            ]}
          />
        </Panel>
        <Panel title="Risk & Returns">
          <KeyValueList
            items={[
              { label: 'Start Portfolio', value: `${formatNumber(summary.initial_capital)} USDT` },
              { label: 'Final Portfolio', value: `${formatNumber(summary.final_portfolio)} USDT` },
              {
                label: 'Gross Profit',
                value: `${formatNumber(summary.gross_profit)} USDT (${formatSignedPct(summary.gross_profit_pct)})`,
                valueClassName: grossClass,
              },
              {
                label: 'Max Drawdown',
                value: `${formatNumber(summary.max_drawdown_pct, 2)}%`,
                valueClassName: 'text-destructive',
              },
              { label: 'Total Volume', value: `${formatNumber(summary.total_volume)} USDT` },
            ]}
          />
        </Panel>
      </div>
    </SectionCard>
  );
}

function PairPerformanceTable({ summary }: { summary: Summary }) {
  // DCA never closes positions, so win/loss metrics are replaced by entry price.
  const isDCA = summary.strategy_info?.toLowerCase().includes('dca');
  const columns = isDCA
    ? ['Avg Price', 'Realized Profit', 'Volume']
    : ['Win', 'Loss', '% Win', 'Payoff', 'Pr.Fact', 'SQN', 'Profit', 'Volume'];

  const metricCells = (row: {
    win: ReactNode;
    loss: ReactNode;
    winPct: number;
    payoff: number;
    profitFactor: number;
    sqn: number;
    profit: number;
    volume: number;
    avgPrice: ReactNode;
  }) =>
    isDCA ? (
      <>
        <TableCell>{row.avgPrice}</TableCell>
        <TableCell className={pnlTextClass(row.profit)}>{formatNumber(row.profit)}</TableCell>
        <TableCell>{formatNumber(row.volume)}</TableCell>
      </>
    ) : (
      <>
        <TableCell className="text-success">{row.win}</TableCell>
        <TableCell className="text-destructive">{row.loss}</TableCell>
        <TableCell className={winRateClass(row.winPct)}>{formatNumber(row.winPct, 1)}%</TableCell>
        <TableCell>{formatNumber(row.payoff, 3)}</TableCell>
        <TableCell>{formatNumber(row.profitFactor, 3)}</TableCell>
        <TableCell>{formatNumber(row.sqn, 1)}</TableCell>
        <TableCell className={pnlTextClass(row.profit)}>{formatNumber(row.profit)}</TableCell>
        <TableCell>{formatNumber(row.volume)}</TableCell>
      </>
    );

  return (
    <Table className="text-right text-xs tabular-nums">
      <TableHeader>
        <TableRow>
          <TableHead className="text-left label-style">Pair</TableHead>
          <TableHead className="text-right label-style">Trades</TableHead>
          {columns.map((column) => (
            <TableHead key={column} className="text-right label-style">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {summary.pairs.map((pair: PairStat) => (
          <TableRow key={pair.pair}>
            <TableCell className="text-left font-semibold text-brand-navy">{pair.pair}</TableCell>
            <TableCell>{pair.trades}</TableCell>
            {metricCells({
              win: pair.win,
              loss: pair.loss,
              winPct: pair.win_pct,
              payoff: pair.payoff,
              profitFactor: pair.profit_factor,
              sqn: pair.sqn,
              profit: pair.profit,
              volume: pair.volume,
              avgPrice: formatNumber(pair.avg_entry_price, 4),
            })}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="font-semibold">
          <TableCell className="text-left">TOTAL</TableCell>
          <TableCell>{summary.total_trades}</TableCell>
          {metricCells({
            win: summary.total_wins,
            loss: summary.total_losses,
            winPct: summary.win_rate,
            payoff: summary.avg_payoff,
            profitFactor: summary.avg_profit_factor,
            sqn: summary.avg_sqn,
            profit: summary.total_profit,
            volume: summary.total_volume,
            avgPrice: '-',
          })}
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function ConfidenceIntervals({ pairs }: { pairs: PairStat[] }) {
  return (
    <div className="space-y-4">
      {pairs.map((pair) => (
        <div key={pair.pair}>
          <div className="mb-1 text-xs font-bold text-brand-navy">{pair.pair}</div>
          {[
            {
              name: 'Return',
              mean: `${formatNumber(pair.ci_return_mean, 2)}%`,
              range: `${formatNumber(pair.ci_return_lower, 2)}% ~ ${formatNumber(pair.ci_return_upper, 2)}%`,
            },
            {
              name: 'Payoff',
              mean: formatNumber(pair.ci_payoff_mean, 2),
              range: `${formatNumber(pair.ci_payoff_lower, 2)} ~ ${formatNumber(pair.ci_payoff_upper, 2)}`,
            },
            {
              name: 'Prof.Factor',
              mean: formatNumber(pair.ci_pf_mean, 2),
              range: `${formatNumber(pair.ci_pf_lower, 2)} ~ ${formatNumber(pair.ci_pf_upper, 2)}`,
            },
          ].map((row) => (
            <div key={row.name} className="mb-1 flex items-center justify-between text-xs tabular-nums">
              <span className="w-24 tracking-wider text-muted-foreground uppercase">{row.name}</span>
              <span className="font-semibold">{row.mean}</span>
              <span className="w-32 text-right text-muted-foreground">({row.range})</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ReturnDistribution({ buckets }: { buckets: ReturnBucket[] }) {
  if (!buckets.length) return <p className="text-sm text-muted-foreground">Not enough data.</p>;

  const maxPct = Math.max(...buckets.map((bucket) => bucket.pct));

  return (
    <div className="space-y-1.5">
      {buckets.map((bucket) => {
        const width = maxPct > 0 ? (bucket.pct / maxPct) * 100 : 0;
        // Bucket straddling zero is highlighted as neutral.
        const tone =
          bucket.from < 0 && bucket.to > 0 ? 'warning' : bucket.from < 0 ? 'destructive' : 'success';
        const barClass = { warning: 'bg-warning', destructive: 'bg-destructive', success: 'bg-success' }[
          tone
        ];
        const textClass = {
          warning: 'text-warning',
          destructive: 'text-destructive',
          success: 'text-success',
        }[tone];

        return (
          <div key={bucket.label} className="flex items-center gap-2 text-xs tabular-nums">
            <span className="w-24 shrink-0 text-right text-muted-foreground">{bucket.label}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
              <div className={cn('h-full rounded-sm', barClass)} style={{ width: `${width}%` }} />
            </div>
            <span className={cn('w-10 shrink-0 text-right', textClass)}>{formatNumber(bucket.pct, 1)}%</span>
            <span className="w-8 shrink-0 text-right text-muted-foreground">({bucket.count})</span>
          </div>
        );
      })}
    </div>
  );
}
