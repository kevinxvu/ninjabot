const numberFormatCache = new Map<string, Intl.NumberFormat>();

function getFormatter(options: Intl.NumberFormatOptions, locale?: string) {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  let formatter = numberFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, formatter);
  }
  return formatter;
}

function isMissing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/** Fixed-decimals number using the client locale. */
export function formatNumber(value: number | null | undefined, decimals = 2) {
  if (isMissing(value)) return '-';
  return getFormatter({ minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** Formats a ratio (0.12 → "+12.00%"). */
export function formatPercent(ratio: number | null | undefined) {
  if (isMissing(ratio)) return '-';
  return formatSignedPct(ratio * 100);
}

/** Formats a value that is already a percentage (12 → "+12.00%"). */
export function formatSignedPct(pct: number | null | undefined, decimals = 2) {
  if (isMissing(pct)) return '-';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${formatNumber(pct, decimals)}%`;
}

/** Number of fraction digits that keeps small-cap prices readable. */
export function getPriceFractionDigits(price: number) {
  const abs = Math.abs(price || 0);
  if (abs >= 1 || abs === 0) return 2;
  if (abs >= 0.01) return 4;
  if (abs >= 0.0001) return 6;
  return 8;
}

/** Price with adaptive precision, e.g. 64,210.50 or 0.000123. */
export function formatPrice(price: number | null | undefined) {
  if (isMissing(price)) return '-';
  const big = price === 0 || Math.abs(price) >= 1;
  return getFormatter(
    { minimumFractionDigits: big ? 2 : 0, maximumFractionDigits: getPriceFractionDigits(price) },
    'en-US',
  ).format(price);
}

/** USD price with adaptive precision, e.g. $64,210.50. */
export function formatUsd(price: number | null | undefined) {
  if (isMissing(price)) return '-';
  const big = price === 0 || Math.abs(price) >= 1;
  return getFormatter(
    {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: big ? 2 : 0,
      maximumFractionDigits: getPriceFractionDigits(price),
    },
    'en-US',
  ).format(price);
}

/** Tailwind text color for a signed value: green for >= 0, red otherwise. */
export function pnlTextClass(value: number | null | undefined) {
  if (isMissing(value)) return 'text-foreground';
  return value >= 0 ? 'text-success' : 'text-destructive';
}

export type Trend = 'positive' | 'negative' | 'neutral';

/** 'positive' when value >= threshold, else 'negative'. */
export function trendOf(value: number, threshold = 0): Trend {
  return value >= threshold ? 'positive' : 'negative';
}
