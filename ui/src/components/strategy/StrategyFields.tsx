import type { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BookOpen, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FormField } from '@/components/common/FormField';
import { FormSection } from '@/components/common/FormSection';
import { MoneyInput } from '@/components/common/MoneyInput';
import { STRATEGIES, getStrategy, type StrategyDefinition } from './strategies';

export interface StrategyValues {
  strategy: string;
  fast_period: number;
  slow_period: number;
  dca_interval?: number;
  dca_buy_amount?: number;
  fib_pivot?: number;
  fib_level?: number;
}

interface StrategyFieldsProps<T extends StrategyValues> {
  values: T;
  onChange: (patch: Partial<StrategyValues>) => void;
  strategies?: StrategyDefinition[];
}

/** "Strategy Engine" form section: algorithm picker + its parameters. */
export function StrategyFields<T extends StrategyValues>({
  values,
  onChange,
  strategies = STRATEGIES,
}: StrategyFieldsProps<T>) {
  const strategy = getStrategy(values.strategy);
  const numberChange = (key: keyof StrategyValues) => (event: ChangeEvent<HTMLInputElement>) =>
    onChange({ [key]: Number(event.target.value) });

  return (
    <FormSection icon={<Activity />} title="Strategy Engine">
      <FormField
        label={
          <span className="flex items-center gap-1.5">
            Algorithm
            {strategy && <StrategyTooltip strategy={strategy} />}
          </span>
        }
        htmlFor="strategy"
      >
        <Select value={values.strategy} onValueChange={(value) => onChange({ strategy: value })}>
          <SelectTrigger id="strategy" className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {strategies.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <span className="text-xs text-muted-foreground">· {option.style}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="rounded-xl border bg-muted p-5">
        {strategy?.params === 'ema' && (
          <div className="grid grid-cols-2 gap-5">
            <FormField label="Fast Period (EMA)" htmlFor="fast_period" hint="Buy when EMA crosses above SMA.">
              <Input
                id="fast_period"
                type="number"
                min={2}
                max={100}
                required
                className="bg-card"
                value={values.fast_period}
                onChange={numberChange('fast_period')}
              />
            </FormField>
            <FormField
              label="Slow Period (SMA)"
              htmlFor="slow_period"
              hint="Sell when EMA crosses below SMA."
            >
              <Input
                id="slow_period"
                type="number"
                min={3}
                max={200}
                required
                className="bg-card"
                value={values.slow_period}
                onChange={numberChange('slow_period')}
              />
            </FormField>
          </div>
        )}

        {strategy?.params === 'dca' && (
          <div className="grid grid-cols-2 gap-5">
            <FormField
              label="Interval (Days)"
              htmlFor="dca_interval"
              hint="Buy at a fixed interval regardless of price movement."
            >
              <Input
                id="dca_interval"
                type="number"
                min={1}
                max={365}
                required
                className="bg-card"
                value={values.dca_interval ?? ''}
                onChange={numberChange('dca_interval')}
              />
            </FormField>
            <FormField
              label="Buy Amount (USDT)"
              htmlFor="dca_buy_amount"
              hint="USDT amount invested on each scheduled DCA buy."
            >
              <MoneyInput
                id="dca_buy_amount"
                min={10}
                step={10}
                required
                className="bg-card"
                value={values.dca_buy_amount ?? ''}
                onChange={numberChange('dca_buy_amount')}
              />
            </FormField>
          </div>
        )}

        {strategy?.params === 'fib' && (
          <div className="grid grid-cols-2 gap-5">
            <FormField
              label="Pivot Length (Candles)"
              htmlFor="fib_pivot"
              hint="A swing low must be the lowest low this many candles on each side."
            >
              <Input
                id="fib_pivot"
                type="number"
                min={2}
                max={10}
                required
                className="bg-card"
                value={values.fib_pivot ?? ''}
                onChange={numberChange('fib_pivot')}
              />
            </FormField>
            <FormField
              label="Entry Level"
              htmlFor="fib_level"
              hint="Retracement where the pullback is bought."
            >
              <Select
                value={String(values.fib_level ?? 0.618)}
                onValueChange={(value) => onChange({ fib_level: Number(value) })}
              >
                <SelectTrigger id="fib_level" className="w-full bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5</SelectItem>
                  <SelectItem value="0.618">0.618</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
        )}

        {strategy && (
          <div className={strategy.params === 'none' ? 'space-y-3' : 'mt-5 space-y-3 border-t pt-4'}>
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                <p>{strategy.summary}</p>
                <p>
                  <span className="font-medium text-foreground">Best for:</span> {strategy.bestFor[0]}.{' '}
                  <span className="font-medium text-foreground">Avoid:</span> {strategy.avoidWhen[0]}.
                </p>
                {strategy.fixedTimeframe && <p>Timeframe is fixed to {strategy.fixedTimeframe}.</p>}
              </div>
            </div>
            <Link
              to={`/strategies?s=${strategy.value}`}
              className="ml-7 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <BookOpen className="size-3.5" /> How this strategy works
            </Link>
          </div>
        )}
      </div>
    </FormSection>
  );
}

/** Info icon with the strategy's summary and when to use it. */
function StrategyTooltip({ strategy }: { strategy: StrategyDefinition }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${strategy.label}`}
          className="inline-flex text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs space-y-1.5 py-2 text-xs normal-case">
        <p className="font-semibold">
          {strategy.label} · {strategy.style}
        </p>
        <p>{strategy.summary}</p>
        <p>
          <span className="font-semibold">Use when:</span> {strategy.bestFor.join('; ')}.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
