import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface AsyncResult<T> {
  /** Key + reload counter of the request that produced this result. */
  requestKey: string | null;
  key: string | null;
  data?: T;
  error?: unknown;
}

/**
 * Minimal data-fetching hook: runs `fetcher` whenever `key` changes (pass `null` to skip),
 * ignores stale responses and keeps the previous data while reloading the same key.
 */
export function useAsync<T>(key: string | null, fetcher: () => Promise<T>) {
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<AsyncResult<T>>({ requestKey: null, key: null });
  const requestKey = key === null ? null : `${key}#${reloadCount}`;

  useEffect(() => {
    if (requestKey === null) return;
    let active = true;
    fetcherRef.current().then(
      (data) => {
        if (active) setResult({ requestKey, key, data });
      },
      (error: unknown) => {
        if (!active) return;
        setResult((prev) => ({
          requestKey,
          key,
          data: prev.key === key ? prev.data : undefined,
          error,
        }));
      },
    );
    return () => {
      active = false;
    };
  }, [key, requestKey]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  /** Locally patch the cached data (e.g. append a websocket update). */
  const mutate = useCallback((updater: (data: T | undefined) => T | undefined) => {
    setResult((prev) => ({ ...prev, data: updater(prev.data) }));
  }, []);

  const isCurrentKey = key !== null && result.key === key;

  return {
    data: isCurrentKey ? result.data : undefined,
    error: isCurrentKey ? result.error : undefined,
    /** True until the first response for the current key arrives. */
    loading: key !== null && !isCurrentKey,
    /** True while any request (including a reload) is in flight. */
    fetching: requestKey !== null && result.requestKey !== requestKey,
    reload,
    mutate,
  };
}
