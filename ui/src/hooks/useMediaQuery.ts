import { useCallback, useSyncExternalStore } from 'react';

/** Matches phones (below Tailwind's `sm` breakpoint). */
export const COMPACT_QUERY = '(max-width: 639px)';
/** Matches touch-first devices (phones, tablets), where dragging should scroll the page. */
export const TOUCH_QUERY = '(pointer: coarse)';

/** Current result of a CSS media query; false where matchMedia is unavailable. */
export function matchesMedia(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

/** Subscribes to a CSS media query and re-renders when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => matchesMedia(query),
    () => false,
  );
}
