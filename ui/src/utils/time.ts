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

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatPlotlyLocalDates(values: TimeInput[]) {
  return values.map(formatPlotlyLocalDate);
}
