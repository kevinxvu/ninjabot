import { Check } from 'lucide-react';
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Spinner } from '@/components/common/Spinner';
import { cn } from '@/lib/utils';

// Rendering thousands of Binance symbols at once makes the popover sluggish.
const MAX_VISIBLE_PAIRS = 200;

interface PairOptionListProps {
  pairs: string[];
  loading: boolean;
  isSelected: (pair: string) => boolean;
  isDisabled?: (pair: string) => boolean;
  onSelect: (pair: string) => void;
  emptyText?: string;
}

/** Shared option list for the single and multi pair pickers. */
export function PairOptionList({
  pairs,
  loading,
  isSelected,
  isDisabled,
  onSelect,
  emptyText = 'No pairs found',
}: PairOptionListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading pairs...
      </div>
    );
  }

  const visible = pairs.slice(0, MAX_VISIBLE_PAIRS);

  return (
    <CommandList>
      <CommandEmpty>{emptyText}</CommandEmpty>
      <CommandGroup>
        {visible.map((pair) => {
          const selected = isSelected(pair);
          return (
            <CommandItem
              key={pair}
              value={pair}
              disabled={isDisabled?.(pair)}
              onSelect={() => onSelect(pair)}
              className="justify-between font-medium"
            >
              {pair}
              <Check className={cn('text-primary', selected ? 'opacity-100' : 'opacity-0')} />
            </CommandItem>
          );
        })}
      </CommandGroup>
      {pairs.length > visible.length && (
        <p className="px-3 py-2 text-center text-xs text-muted-foreground">
          Showing {visible.length} of {pairs.length} — type to narrow down
        </p>
      )}
    </CommandList>
  );
}
