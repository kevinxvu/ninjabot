import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Clock, Info, X } from 'lucide-react';
import { SectionCard } from '@/components/common/SectionCard';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  STRATEGIES,
  STRATEGY_PICKS,
  getStrategy,
  type StrategyDefinition,
} from '@/components/strategy/strategies';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export function StrategyGuidePage() {
  const [params] = useSearchParams();
  const selected = params.get('s');

  // Deep links from the setup forms (?s=turtle) scroll to that strategy.
  useEffect(() => {
    if (selected) document.getElementById(`strategy-${selected}`)?.scrollIntoView({ block: 'start' });
  }, [selected]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        icon={<BookOpen />}
        title="Strategy Guide"
        description="How each built-in strategy trades, and which market it suits"
        className="mb-0"
      />

      <Alert>
        <Info />
        <AlertTitle>No strategy wins in every market</AlertTitle>
        <AlertDescription>
          Backtest a strategy on the pair and period you care about before trusting it, and compare it with
          simply holding the asset. Past results do not guarantee future returns. Backtests and realtime
          signals only use a simulated wallet: nothing is traded on Binance.
        </AlertDescription>
      </Alert>

      <SectionCard title="Which strategy should I use?">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="label-style">Market situation</TableHead>
              <TableHead className="label-style">Strategy</TableHead>
              <TableHead className="label-style">Timeframe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {STRATEGY_PICKS.map(({ situation, strategy: value }) => {
              const strategy = getStrategy(value);
              if (!strategy) return null;
              return (
                <TableRow key={value}>
                  <TableCell className="whitespace-normal">{situation}</TableCell>
                  <TableCell>
                    <Link to={`/strategies?s=${value}`} className="font-medium text-primary hover:underline">
                      {strategy.label}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{strategy.fixedTimeframe ?? 'Any'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionCard>

      {STRATEGIES.map((strategy) => (
        <StrategyCard key={strategy.value} strategy={strategy} highlighted={strategy.value === selected} />
      ))}
    </div>
  );
}

function StrategyCard({ strategy, highlighted }: { strategy: StrategyDefinition; highlighted: boolean }) {
  return (
    <section id={`strategy-${strategy.value}`} className="scroll-mt-6">
      <SectionCard
        title={strategy.label}
        description={strategy.summary}
        className={cn(highlighted && 'ring-2 ring-primary/40')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={`/backtesting?strategy=${strategy.value}`}>
              Backtest <ArrowRight />
            </Link>
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant="muted">{strategy.style}</Badge>
            <Badge variant="muted">
              <Clock /> {strategy.fixedTimeframe ? `${strategy.fixedTimeframe} only` : 'Any timeframe'}
            </Badge>
            <Badge variant={strategy.realtime ? 'success' : 'muted'}>
              {strategy.realtime ? 'Backtest + realtime signals' : 'Backtest only'}
            </Badge>
          </div>

          <dl className="grid gap-4 sm:grid-cols-3">
            <Rule label="Buys when" text={strategy.entry} />
            <Rule label="Sells when" text={strategy.exit} />
            <Rule label="Position size" text={strategy.sizing} />
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <FitList title="Good fit" items={strategy.bestFor} good />
            <FitList title="Poor fit" items={strategy.avoidWhen} />
          </div>

          {strategy.tip && (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Reading the results: </span>
              {strategy.tip}
            </p>
          )}
        </div>
      </SectionCard>
    </section>
  );
}

function Rule({ label, text }: { label: string; text: string }) {
  return (
    <div className="space-y-1">
      <dt className="label-style">{label}</dt>
      <dd className="text-sm leading-relaxed">{text}</dd>
    </div>
  );
}

function FitList({ title, items, good = false }: { title: string; items: string[]; good?: boolean }) {
  const Icon = good ? Check : X;
  return (
    <div className="space-y-2">
      <h3 className="label-style">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
            <Icon className={cn('mt-0.5 size-4 shrink-0', good ? 'text-success' : 'text-destructive')} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
