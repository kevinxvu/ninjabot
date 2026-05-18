import type { ChangeEvent } from 'react';
import { Activity } from 'lucide-react';

export interface StrategyEngineValues {
  strategy: string;
  fast_period: number;
  slow_period: number;
  dca_interval?: number;
  dca_buy_amount?: number;
}

export interface StrategyOption {
  value: string;
  label: string;
}

interface StrategyEngineProps {
  values: StrategyEngineValues;
  options?: StrategyOption[];
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

export const DEFAULT_STRATEGY_OPTIONS: StrategyOption[] = [
  { value: 'emacross', label: 'EMA Crossover' },
  { value: 'dca', label: 'DCA (Dollar Cost Averaging)' },
  { value: 'ocosell', label: 'OCO Sell (Stochastic)' },
  { value: 'trailingstop', label: 'Trailing Stop' },
  { value: 'turtle', label: 'Turtle Trading' },
];

const FIXED_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  ocosell: 'Uses Stochastic Oscillator for entry and OCO orders for exit. No extra parameters required. Timeframe is fixed to 1d.',
  trailingstop: 'Uses EMA Crossover with trailing stop for exits. No extra parameters required. Timeframe is fixed to 4h.',
  turtle: 'Turtle trading strategy using 40-period High and 20-period Low. No extra parameters required. Timeframe is fixed to 4h.',
};

export function StrategyEngine({ values, options = DEFAULT_STRATEGY_OPTIONS, onChange }: StrategyEngineProps) {
  const fixedStrategyDescription = FIXED_STRATEGY_DESCRIPTIONS[values.strategy];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
        <Activity size={16} className="text-[var(--text-secondary)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">Strategy Engine</h2>
      </div>

      <div>
        <label className="label-style">Algorithm</label>
        <select
          name="strategy"
          value={values.strategy}
          onChange={onChange}
          className="input-field mb-4"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-[var(--bg-tertiary)] p-5 rounded-xl border border-[var(--border-color)]">
        {values.strategy === 'emacross' && (
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="label-style">Fast Period (EMA)</label>
              <input
                name="fast_period"
                type="number"
                value={values.fast_period}
                onChange={onChange}
                min="2"
                max="100"
                className="input-field bg-[var(--bg-primary)]"
                required
              />
              <p className="text-[11px] text-[var(--text-secondary)] mt-2 leading-tight">Buy when EMA crosses above SMA.</p>
            </div>
            <div>
              <label className="label-style">Slow Period (SMA)</label>
              <input
                name="slow_period"
                type="number"
                value={values.slow_period}
                onChange={onChange}
                min="3"
                max="200"
                className="input-field bg-[var(--bg-primary)]"
                required
              />
              <p className="text-[11px] text-[var(--text-secondary)] mt-2 leading-tight">Sell when EMA crosses below SMA.</p>
            </div>
          </div>
        )}

        {values.strategy === 'dca' && (
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="label-style">Interval (Days)</label>
              <input
                name="dca_interval"
                type="number"
                value={values.dca_interval ?? ''}
                onChange={onChange}
                min="1"
                max="365"
                className="input-field bg-[var(--bg-primary)]"
                required
              />
              <p className="text-[11px] text-[var(--text-secondary)] mt-2 leading-tight">Buy at a fixed interval regardless of price movement.</p>
            </div>
            <div>
              <label className="label-style">Buy Amount (USDT)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-medium">$</span>
                <input
                  name="dca_buy_amount"
                  type="number"
                  value={values.dca_buy_amount ?? ''}
                  onChange={onChange}
                  min="10"
                  step="10"
                  className="input-field pl-8 bg-[var(--bg-primary)]"
                  required
                />
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-2 leading-tight">USDT amount invested on each scheduled DCA buy.</p>
            </div>
          </div>
        )}

        {fixedStrategyDescription && (
          <div className="flex items-start gap-3">
            <div className="text-[var(--brand-accent)] mt-0.5">
              <Activity size={16} />
            </div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {fixedStrategyDescription}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
