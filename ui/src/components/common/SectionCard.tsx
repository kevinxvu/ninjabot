import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/** Card with an optional title row — the standard container for dashboard sections. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn('gap-4 shadow-card', className)}>
      {(title || action) && (
        // Flex instead of the default 2-column grid so the action wraps under the title on phones.
        <CardHeader className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          {(title || description) && (
            <div className="min-w-0 space-y-1.5">
              {title && <CardTitle className="text-lg">{title}</CardTitle>}
              {description && <CardDescription>{description}</CardDescription>}
            </div>
          )}
          {action && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{action}</div>}
        </CardHeader>
      )}
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
