import type { ChartCandle, MarketCandle } from '@/api/types';
import { parseTimeframeMs, toEpochMs } from './time';

type AnyCandle = Partial<ChartCandle> & Partial<MarketCandle>;

/** Accepts both plot (lowercase) and model (capitalized) candle shapes. */
export function normalizeCandle(candle: AnyCandle): ChartCandle {
  return {
    ...candle,
    time: candle.time ?? candle.Time ?? Date.now(),
    open: Number(candle.open ?? candle.Open ?? 0),
    high: Number(candle.high ?? candle.High ?? 0),
    low: Number(candle.low ?? candle.Low ?? 0),
    close: Number(candle.close ?? candle.Close ?? 0),
    volume: Number(candle.volume ?? candle.Volume ?? 0),
  };
}

export function isValidCandle(candle: ChartCandle) {
  return (
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.volume) &&
    !Number.isNaN(toEpochMs(candle.time))
  );
}

/** Merges into the last candle when the update has the same open time, otherwise appends. */
export function upsertCandle<T extends AnyCandle>(candles: T[], next: T): T[] {
  if (candles.length === 0) return [next];
  const last = candles[candles.length - 1];
  const lastTime = toEpochMs(last.time ?? last.Time);
  const nextTime = toEpochMs(next.time ?? next.Time);
  if (nextTime === lastTime) return [...candles.slice(0, -1), { ...last, ...next }];
  if (nextTime > lastTime) return [...candles, next];
  return candles;
}

/**
 * Merges live data into server candles: the streaming candle (if any), then the latest ticker
 * price — updating the open candle or starting a new bucket once the timeframe has elapsed.
 */
export function buildLiveCandles(
  candles: ChartCandle[],
  currentPrice: number,
  timeframe?: string,
  realtimeCandle?: MarketCandle | null,
) {
  if (!candles.length) return candles;

  const display = realtimeCandle ? upsertCandle(candles, normalizeCandle(realtimeCandle)) : [...candles];
  if (currentPrice <= 0) return display;

  const lastIndex = display.length - 1;
  const last = display[lastIndex];
  const timeframeMs = parseTimeframeMs(timeframe);
  const now = Date.now();

  if (timeframeMs && now >= toEpochMs(last.time) + timeframeMs) {
    const bucketTime = Math.floor(now / timeframeMs) * timeframeMs;
    display.push({
      ...last,
      time: new Date(bucketTime).toISOString(),
      open: currentPrice,
      high: currentPrice,
      low: currentPrice,
      close: currentPrice,
      volume: 0,
      orders: [],
    });
    return display;
  }

  display[lastIndex] = {
    ...last,
    close: currentPrice,
    high: Math.max(last.high, currentPrice),
    low: Math.min(last.low, currentPrice),
  };
  return display;
}

/** Price range of the candles inside `xRange` (plus padding) so zooming x rescales y. */
export function visiblePriceRange(
  candles: ChartCandle[],
  xRange: [string, string] | null,
  currentPrice = 0,
): [number, number] | null {
  if (!candles.length) return null;

  let visible = candles;
  if (xRange) {
    const start = new Date(xRange[0]).getTime();
    const end = new Date(xRange[1]).getTime();
    // Small buffer so candles at the edge aren't clipped.
    const filtered = candles.filter((candle) => {
      const time = toEpochMs(candle.time);
      return time >= start - 60_000 && time <= end + 60_000;
    });
    if (filtered.length) visible = filtered;
  }

  const prices = visible.flatMap((candle) => [candle.high, candle.low]);
  if (currentPrice > 0) prices.push(currentPrice);

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min || max * 0.01) * 0.1;
  return [min - padding, max + padding];
}
