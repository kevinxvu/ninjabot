import type { SignalSession } from '@/api/types';

/** Strategy name with EMA periods when known, e.g. "emacross (8/21)". */
export function sessionStrategyLabel(session: SignalSession) {
  const periods =
    session.strategy === 'emacross' && session.fast_period && session.slow_period
      ? ` (${session.fast_period}/${session.slow_period})`
      : '';
  return `${session.strategy}${periods}`;
}

/** Short, stable session identifier for telling similar sessions apart. */
export function shortSessionId(session: SignalSession) {
  return `#${session.id.slice(0, 8)}`;
}
