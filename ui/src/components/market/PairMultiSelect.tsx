import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Command, CommandInput } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useTradingPairs } from '@/hooks/useTradingPairs';
import { filterPairs } from '@/lib/pairs';
import { PairOptionList } from './PairOptionList';

interface PairMultiSelectProps {
  value: string[];
  onChange: (pairs: string[]) => void;
  maxPairs?: number;
  id?: string;
}

/** Searchable multi pair picker rendered as removable chips. Enter adds a custom symbol. */
export function PairMultiSelect({ value, onChange, maxPairs, id }: PairMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { pairs, loading } = useTradingPairs();

  const isFull = maxPairs !== undefined && value.length >= maxPairs;
  const filtered = filterPairs(pairs, search);

  const toggle = (pair: string) => {
    if (value.includes(pair)) {
      onChange(value.filter((p) => p !== pair));
    } else if (!isFull) {
      onChange([...value, pair]);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // cmdk handles Enter for highlighted items; only add free text when nothing matches.
    if (event.key !== 'Enter' || filtered.length > 0) return;
    const custom = search.trim().toUpperCase();
    if (!custom) return;
    event.preventDefault();
    if (!value.includes(custom) && !isFull) onChange([...value, custom]);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          id={id}
          role="combobox"
          aria-expanded={open}
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => event.key === 'ArrowDown' && setOpen(true)}
          className="flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {value.length === 0 && <span className="px-1 text-sm text-muted-foreground">Select pairs...</span>}
          {value.map((pair) => (
            <span
              key={pair}
              className="flex items-center gap-1 rounded border bg-muted px-2 py-0.5 text-[11px] font-semibold tracking-wide"
            >
              {pair}
              <button
                type="button"
                aria-label={`Remove ${pair}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(value.filter((p) => p !== pair));
                }}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search pairs..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={handleKeyDown}
          />
          {isFull && (
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              Maximum of {maxPairs} pairs selected.
            </p>
          )}
          <PairOptionList
            pairs={filtered}
            loading={loading}
            isSelected={(pair) => value.includes(pair)}
            isDisabled={(pair) => isFull && !value.includes(pair)}
            onSelect={toggle}
            emptyText="No pairs found — press Enter to add it"
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
