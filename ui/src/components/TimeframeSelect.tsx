export type TimeframeOption = {
  value: string;
  label: string;
};

export const DEFAULT_TIMEFRAME_OPTIONS: TimeframeOption[] = [
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

interface TimeframeSelectProps {
  value: string;
  name?: string;
  disabled?: boolean;
  options?: TimeframeOption[];
  onChange: (value: string) => void;
}

export function TimeframeSelect({
  value,
  name = 'timeframe',
  disabled = false,
  options = DEFAULT_TIMEFRAME_OPTIONS,
  onChange,
}: TimeframeSelectProps) {
  return (
    <select
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="input-field"
      disabled={disabled}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
