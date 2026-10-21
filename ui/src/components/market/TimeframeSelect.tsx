import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TIMEFRAME_OPTIONS, type TimeframeOption } from './timeframes';

interface TimeframeSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: TimeframeOption[];
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function TimeframeSelect({
  value,
  onChange,
  options = TIMEFRAME_OPTIONS,
  disabled,
  id,
  className,
}: TimeframeSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={cn('w-full bg-card', className)}>
        <SelectValue placeholder="Timeframe" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
