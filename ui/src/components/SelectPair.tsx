import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import api from '../api/client';

interface SelectPairProps {
  value: string;
  onChange: (value: string) => void;
}

export function SelectPair({ value, onChange }: SelectPairProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [availablePairs, setAvailablePairs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedPair = value ? value.split(',').map(s => s.trim()).filter(Boolean)[0] || '' : '';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    async function fetchPairs() {
      setLoading(true);
      try {
        const data = await api.get('/api/pairs') as { pairs: string[] };
        if (data && data.pairs && Array.isArray(data.pairs)) {
          setAvailablePairs(data.pairs);
        }
      } catch (err) {
        console.error('Failed to fetch trading pairs', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPairs();
  }, []);

  const selectPair = (pair: string) => {
    onChange(pair);
    setIsOpen(false);
    setSearchTerm('');
  };

  const filterAndSortPairs = () => {
    if (!searchTerm) {
      return availablePairs;
    }

    const lowerSearch = searchTerm.toLowerCase();
    return availablePairs
      .filter(p => p.toLowerCase().startsWith(lowerSearch))
      .sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();

        if (aLower === lowerSearch) return -1;
        if (bLower === lowerSearch) return 1;

        return a.localeCompare(b);
      });
  };

  const filteredPairs = filterAndSortPairs();

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <button
        type="button"
        className="input-field min-h-[44px] flex items-center justify-between gap-2 cursor-pointer text-left bg-[var(--bg-primary)] hover:border-[#cbd5e1]"
        onClick={() => setIsOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selectedPair ? 'font-semibold text-[var(--text-primary)] truncate' : 'text-[var(--text-tertiary)] truncate'}>
          {selectedPair || 'Select pair...'}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-[var(--text-tertiary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-lg overflow-hidden max-h-72 flex flex-col">
          <div className="p-3 border-b border-[var(--border-color)] flex items-center gap-2 bg-[var(--bg-primary)] sticky top-0">
            <Search size={16} className="text-[var(--text-tertiary)]" />
            <input
              ref={searchInputRef}
              type="text"
              className="w-full bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
              placeholder="Search pairs..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="overflow-y-auto flex-1 p-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-[var(--text-tertiary)]">
                <Loader2 size={16} className="animate-spin" />
                Loading pairs...
              </div>
            ) : (
              <>
                {filteredPairs.map(pair => {
                  const isSelected = selectedPair === pair;
                  return (
                    <button
                      type="button"
                      key={pair}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium cursor-pointer rounded-lg transition-colors ${
                        isSelected ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                      }`}
                      onClick={() => selectPair(pair)}
                    >
                      <span className="truncate">{pair}</span>
                      {isSelected && (
                        <Check size={16} className="shrink-0 text-[var(--brand-accent)]" />
                      )}
                    </button>
                  );
                })}

                {filteredPairs.length === 0 && (
                  <div className="px-3 py-4 text-sm text-[var(--text-tertiary)] text-center">
                    No pairs found
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
