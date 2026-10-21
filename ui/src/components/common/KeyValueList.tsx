import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
}

/** Two-column label/value rows separated by borders. */
export function KeyValueList({ items, className }: { items: KeyValueItem[]; className?: string }) {
  return (
    <dl className={cn('divide-y text-sm', className)}>
      {items.map((item, index) => (
        <div key={index} className="flex justify-between gap-4 py-2">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className={cn('font-semibold tabular-nums', item.valueClassName)}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
