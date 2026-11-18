import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional icon rendered in a brand tile before the title. */
  icon?: ReactNode;
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon, actions, children, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-4 sm:mb-6', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm [&_svg]:size-5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
