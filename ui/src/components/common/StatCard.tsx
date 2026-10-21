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
    <div className={cn('flex flex-col rounded-xl border bg-card p-5 shadow-card', className)}>
      <div className="mb-2 label-style">{label}</div>
      <div className={cn('text-2xl font-bold tracking-tight tabular-nums', valueClassName)}>{value}</div>
      {hint && <div className={cn('mt-1 text-xs font-medium', TREND_CLASS[trend])}>{hint}</div>}
    </div>
  );
}
