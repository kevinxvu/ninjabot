import { marketApi } from '@/api/market';
import { useAsync } from './useAsync';

// The pair list is static for the server lifetime, so share one request across selects.
let pairsPromise: Promise<string[]> | null = null;

function loadPairs() {
  pairsPromise ??= marketApi.listPairs().catch((error: unknown) => {
    pairsPromise = null;
    throw error;
  });
  return pairsPromise;
}

export function useTradingPairs() {
  const { data, loading, error } = useAsync('trading-pairs', loadPairs);
  return { pairs: data ?? [], loading, error };
}
