import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandInput } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTradingPairs } from '@/hooks/useTradingPairs';
import { filterPairs } from '@/lib/pairs';
import { cn } from '@/lib/utils';
import { PairOptionList } from './PairOptionList';

interface PairSelectProps {
  value: string;
  onChange: (pair: string) => void;
  id?: string;
  className?: string;
}

/** Searchable single trading pair picker. */
export function PairSelect({ value, onChange, id, className }: PairSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { pairs, loading } = useTradingPairs();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between bg-card font-semibold', className)}
        >
          <span className={cn('truncate', !value && 'font-normal text-muted-foreground')}>
            {value || 'Select pair...'}
          </span>
          <ChevronDown className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search pairs..." value={search} onValueChange={setSearch} />
          <PairOptionList
            pairs={filterPairs(pairs, search)}
            loading={loading}
            isSelected={(pair) => pair === value}
            onSelect={(pair) => {
              onChange(pair);
              handleOpenChange(false);
            }}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
