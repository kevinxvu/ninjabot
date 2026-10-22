import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Number input with a leading "$" adornment. */
export function MoneyInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-medium text-muted-foreground">
        $
      </span>
      <Input type="number" className={cn('pl-7', className)} {...props} />
    </div>
  );
}
