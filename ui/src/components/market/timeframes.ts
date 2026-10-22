export interface TimeframeOption {
  value: string;
  label: string;
}

export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { value: '1m', label: '1 minute' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '4h', label: '4 hours' },
  { value: '6h', label: '6 hours' },
  { value: '12h', label: '12 hours' },
  { value: '1d', label: '1 day' },
];

/** Timeframes supported by realtime signal sessions. */
export const REALTIME_TIMEFRAME_OPTIONS = TIMEFRAME_OPTIONS.filter((option) =>
  ['1m', '15m', '1h', '4h', '1d'].includes(option.value),
);
