import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

export function LoadingState({ label = 'Loading...', className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground',
        className,
      )}
    >
      <Spinner className="size-8" />
      {label && <p>{label}</p>}
    </div>
  );
}
