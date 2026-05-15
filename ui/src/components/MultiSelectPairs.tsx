import React, { useState, useRef, useEffect } from 'react';
import { Search, X, CheckSquare, Square, Loader2 } from 'lucide-react';

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
        const res = await fetch('/api/pairs');
        if (res.ok) {
          const data = await res.json();
          if (data.pairs && Array.isArray(data.pairs)) {
            setAvailablePairs(data.pairs);
          }
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
        className="input-field min-h-[42px] flex flex-wrap gap-2 items-center cursor-pointer pb-1"
        onClick={() => setIsOpen(true)}
      >
        {selectedPairs.length === 0 && (
          <span className="text-[var(--text-tertiary)] py-1 pl-1">Select pairs...</span>
        )}

        {selectedPairs.map(pair => (
          <span
            key={pair}
            className="bg-[var(--brand-color)] text-white text-xs px-2 py-1 rounded-md flex items-center gap-1"
          >
            {pair}
            <X
              size={14}
              className="cursor-pointer hover:opacity-75"
              onClick={(e) => removePair(pair, e)}
            />
          </span>
        ))}
      </div>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-lg overflow-hidden max-h-60 flex flex-col">
          <div className="p-2 border-b border-[var(--border-color)] flex items-center gap-2 bg-[var(--bg-secondary)] sticky top-0">
            <Search size={16} className="text-[var(--text-tertiary)]" />
            <input
              type="text"
              className="w-full bg-transparent outline-none text-sm text-[var(--text-primary)]"
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
                      className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--bg-secondary)] rounded text-[var(--text-primary)] ${
                        !isSelected && maxPairs && selectedPairs.length >= maxPairs ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      onClick={() => togglePair(pair)}
                    >
                      {isSelected ? <CheckSquare size={16} className="text-[var(--brand-color)]"/> : <Square size={16} className="text-[var(--text-tertiary)]"/>}
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