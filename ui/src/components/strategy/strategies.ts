export type StrategyParams = 'ema' | 'dca' | 'none';

export interface StrategyDefinition {
  value: string;
  label: string;
  params: StrategyParams;
  /** Strategies tuned for one timeframe force it in the setup form. */
  fixedTimeframe?: string;
  description?: string;
}

export const STRATEGIES: StrategyDefinition[] = [
  { value: 'emacross', label: 'EMA Crossover', params: 'ema' },
  { value: 'dca', label: 'DCA (Dollar Cost Averaging)', params: 'dca', fixedTimeframe: '1d' },
  {
    value: 'ocosell',
    label: 'OCO Sell (Stochastic)',
    params: 'none',
    fixedTimeframe: '1d',
    description:
      'Uses Stochastic Oscillator for entry and OCO orders for exit. No extra parameters required. Timeframe is fixed to 1d.',
  },
  {
    value: 'trailingstop',
    label: 'Trailing Stop',
    params: 'none',
    fixedTimeframe: '4h',
    description:
      'Uses EMA Crossover with trailing stop for exits. No extra parameters required. Timeframe is fixed to 4h.',
  },
  {
    value: 'turtle',
    label: 'Turtle Trading',
    params: 'none',
    fixedTimeframe: '4h',
    description:
      'Turtle trading strategy using 40-period High and 20-period Low. No extra parameters required. Timeframe is fixed to 4h.',
  },
];

/** Strategies the realtime signal engine can run. */
export const REALTIME_STRATEGIES = STRATEGIES.filter((strategy) => strategy.value === 'emacross');

export function getStrategy(value: string) {
  return STRATEGIES.find((strategy) => strategy.value === value);
}
