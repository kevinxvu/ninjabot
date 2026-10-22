export type TimeInput = string | number | Date | null | undefined;

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

export function toClientDate(value: TimeInput) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const epochMs = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(epochMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatClientDateTime(value: TimeInput) {
  const date = toClientDate(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatClientTime(value: TimeInput) {
  const date = toClientDate(value);
  if (!date) return '-';

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatPlotlyLocalDate(value: TimeInput) {
  const date = toClientDate(value);
  if (!date) return '';

  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-') +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function formatPlotlyLocalDates(values: TimeInput[]) {
  return values.map(formatPlotlyLocalDate);
}

/** Converts a candle/order timestamp (seconds, ms or date string) to epoch ms. */
export function toEpochMs(value: TimeInput) {
  return toClientDate(value)?.getTime() ?? Number.NaN;
}

const TIMEFRAME_UNIT_MS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  M: 30 * 24 * 60 * 60 * 1000,
};

/** Parses a Binance-style timeframe ("15m", "4h", "1d") into milliseconds. */
export function parseTimeframeMs(timeframe?: string) {
  const match = timeframe?.match(/^(\d+)([mhdwM])$/);
  if (!match) return null;
  return Number(match[1]) * TIMEFRAME_UNIT_MS[match[2]];
}
