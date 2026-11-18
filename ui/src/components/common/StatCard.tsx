import type { ReactNode } from 'react';
import type { Trend } from '@/lib/format';
import { cn } from '@/lib/utils';

const TREND_CLASS: Record<Trend, string> = {
  positive: 'text-success',
  negative: 'text-destructive',
  neutral: 'text-muted-foreground',
};

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Secondary line under the value. */
  hint?: ReactNode;
  /** Colors the hint line. */
  trend?: Trend;
  /** Overrides the value color, e.g. "text-success". */
  valueClassName?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  trend = 'neutral',
  valueClassName,
  className,
}: StatCardProps) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-card sm:p-5', className)}>
      <div className="mb-2 label-style">{label}</div>
      <div
        className={cn(
          'text-xl font-bold tracking-tight break-words tabular-nums sm:text-2xl',
          valueClassName,
        )}
      >
        {value}
      </div>
      {hint && <div className={cn('mt-1 text-xs font-medium', TREND_CLASS[trend])}>{hint}</div>}
    </div>
  );
}
