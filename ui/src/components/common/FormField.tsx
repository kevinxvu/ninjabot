import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control + optional hint, using the shared `label-style` caption. */
export function FormField({ label, htmlFor, hint, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="block label-style">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}
