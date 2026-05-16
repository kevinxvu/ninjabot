import React, { useState, useRef, useEffect } from 'react';
import { Search, X, CheckSquare, Loader2 } from 'lucide-react';
import api from '../api/client';

interface MultiSelectPairsProps {
  value: string; // Comma separated string e.g. "BTCUSDT,ETHUSDT"
  maxPairs?: number;
  onChange: (value: string) => void;
}

export function MultiSelectPairs({ value, maxPairs, onChange }: MultiSelectPairsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [availablePairs, setAvailablePairs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedPairs = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch available pairs
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

  const togglePair = (pair: string) => {
    let newPairs;
    if (selectedPairs.includes(pair)) {
      newPairs = selectedPairs.filter(p => p !== pair);
    } else {
      if (maxPairs && selectedPairs.length >= maxPairs) {
        alert(`You can only select up to ${maxPairs} pairs.`);
        return;
      }
      newPairs = [...selectedPairs, pair];
    }
    onChange(newPairs.join(','));
  };

  const removePair = (pair: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedPairs.filter(p => p !== pair).join(','));
  };

  const handleCustomAdd = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm) {
      e.preventDefault();
      const newPair = searchTerm.toUpperCase().trim();
      if (newPair && !selectedPairs.includes(newPair)) {
        if (maxPairs && selectedPairs.length >= maxPairs) {
          alert(`You can only select up to ${maxPairs} pairs.`);
          return;
        }
        onChange([...selectedPairs, newPair].join(','));
      }
      setSearchTerm('');
    }
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

        // Exact match
        if (aLower === lowerSearch) return -1;
        if (bLower === lowerSearch) return 1;

        // Default alphabetical
        return a.localeCompare(b);
      });
  };

  const filteredPairs = filterAndSortPairs();

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div
        className="input-field min-h-[44px] flex flex-wrap gap-2 items-center cursor-pointer pb-1.5 pt-1.5 transition-all bg-[var(--bg-primary)] hover:border-[#cbd5e1]"
        onClick={() => setIsOpen(true)}
      >
        {selectedPairs.length === 0 && (
          <span className="text-[var(--text-tertiary)] text-sm py-1 pl-1">Select pairs...</span>
        )}

        {selectedPairs.map(pair => (
          <span
            key={pair}
            className="bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)] text-[11px] font-semibold tracking-wide px-2.5 py-1 rounded flex items-center gap-1.5 shadow-sm transition-colors hover:bg-[var(--border-color)]"
          >
            {pair}
            <X
              size={12}
              className="cursor-pointer text-[var(--text-secondary)] hover:text-[var(--error-color)]"
              onClick={(e) => removePair(pair, e)}
            />
          </span>
        ))}
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl shadow-lg overflow-hidden max-h-60 flex flex-col">
          <div className="p-3 border-b border-[var(--border-color)] flex items-center gap-2 bg-[var(--bg-primary)] sticky top-0">
            <Search size={16} className="text-[var(--text-tertiary)]" />
            <input
              type="text"
              className="w-full bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
              placeholder="Search pairs..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={handleCustomAdd}
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
                  const isSelected = selectedPairs.includes(pair);
                  return (
                    <div
                      key={pair}
                      className={`flex items-center gap-3 px-3 py-2 text-sm font-medium cursor-pointer rounded-lg transition-colors ${
                        isSelected ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                      } ${
                        !isSelected && maxPairs && selectedPairs.length >= maxPairs ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''
                      }`}
                      onClick={() => togglePair(pair)}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-[var(--brand-accent)] border-[var(--brand-accent)]' : 'border-[var(--border-color)] bg-white'}`}>
                        {isSelected && <CheckSquare size={12} strokeWidth={3} className="text-white bg-[var(--brand-accent)] rounded-sm" />}
                      </div>
                      {pair}
                    </div>
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