import type { ChangeEvent } from 'react';
import { Activity, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
      <FormField label="Algorithm" htmlFor="strategy">
        <Select value={values.strategy} onValueChange={(value) => onChange({ strategy: value })}>
          <SelectTrigger id="strategy" className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {strategies.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
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

        {strategy?.description && (
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-muted-foreground">{strategy.description}</p>
          </div>
        )}
      </div>
    </FormSection>
  );
}
