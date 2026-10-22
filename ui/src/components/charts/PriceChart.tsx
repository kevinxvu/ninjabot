import { useMemo, useState, type ComponentProps } from 'react';
import type { Layout, PlotRelayoutEvent, PlotRestyleEvent } from 'plotly.js';
import type { ChartData, MarketCandle } from '@/api/types';
import { SectionCard } from '@/components/common/SectionCard';
import { Toggle } from '@/components/ui/toggle';
import { buildLiveCandles, visiblePriceRange } from '@/lib/candles';
import { Plot } from './Plot';
import { buildPriceFigure } from './priceFigure';
import { INTERACTIVE_CONFIG } from './theme';

interface PriceChartProps {
  data: ChartData | null | undefined;
  /** Latest ticker price; > 0 updates the open candle and price line. */
  currentPrice?: number;
  /** Streaming candle from the market websocket. */
  realtimeCandle?: MarketCandle | null;
  timeframe?: string;
}

interface ChartView {
  xRange: [string, string] | null;
  dragmode: Layout['dragmode'];
}

const isDefaultSubIndicator = (name: string) => name.startsWith('RSI');

export function PriceChart({ data, currentPrice = 0, realtimeCandle = null, timeframe }: PriceChartProps) {
  const [showIndicators, setShowIndicators] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showSubIndicators, setShowSubIndicators] = useState(false);
  // Explicit user choices; indicators without a choice fall back to isDefaultSubIndicator.
  const [subIndicatorChoice, setSubIndicatorChoice] = useState<Record<string, boolean>>({});
  // User zoom/pan and legend visibility must survive realtime re-renders.
  const [view, setView] = useState<ChartView>({ xRange: null, dragmode: 'pan' });
  const [hiddenTraces, setHiddenTraces] = useState<ReadonlySet<string>>(new Set());

  const candles = useMemo(
    () => buildLiveCandles(data?.candles ?? [], currentPrice, timeframe, realtimeCandle),
    [data?.candles, currentPrice, timeframe, realtimeCandle],
  );

  const standaloneIndicators = useMemo(
    () => (data?.indicators ?? []).filter((indicator) => !indicator.overlay),
    [data?.indicators],
  );
  const isSubIndicatorActive = (name: string) => subIndicatorChoice[name] ?? isDefaultSubIndicator(name);

  const figure = useMemo(() => {
    if (!candles.length) return null;
    return buildPriceFigure({
      candles,
      indicators: data?.indicators,
      shapes: data?.shapes,
      events: data?.events,
      currentPrice,
      showIndicators,
      showVolume,
      subIndicators: showSubIndicators
        ? standaloneIndicators.filter(
            (indicator) => subIndicatorChoice[indicator.name] ?? isDefaultSubIndicator(indicator.name),
          )
        : [],
      xRange: view.xRange,
      yRange: visiblePriceRange(candles, view.xRange, currentPrice),
      dragmode: view.dragmode,
    });
  }, [
    candles,
    data?.indicators,
    data?.shapes,
    data?.events,
    currentPrice,
    showIndicators,
    showVolume,
    showSubIndicators,
    standaloneIndicators,
    subIndicatorChoice,
    view,
  ]);

  const traces = useMemo(
    () =>
      (figure?.traces ?? []).map((trace) =>
        trace.name && hiddenTraces.has(trace.name) ? { ...trace, visible: 'legendonly' as const } : trace,
      ),
    [figure, hiddenTraces],
  );

  const handleRelayout = (event: Readonly<PlotRelayoutEvent>) => {
    const raw = event as Record<string, unknown>;
    setView((prev) => {
      let next = prev;
      if (typeof raw.dragmode === 'string') {
        next = { ...next, dragmode: raw.dragmode as Layout['dragmode'] };
      }
      if (raw['xaxis.autorange'] === true) {
        next = { ...next, xRange: null };
      } else if (raw['xaxis.range[0]'] !== undefined && raw['xaxis.range[1]'] !== undefined) {
        next = { ...next, xRange: [String(raw['xaxis.range[0]']), String(raw['xaxis.range[1]'])] };
      }
      return next;
    });
  };

  // Legend clicks toggle trace visibility; remember it by trace name.
  const handleRestyle = (event: Readonly<PlotRestyleEvent>) => {
    const [update, indices] = event as unknown as [Record<string, unknown[]>, number[]];
    const visibility = update.visible;
    if (!visibility) return;
    setHiddenTraces((prev) => {
      const next = new Set(prev);
      indices.forEach((traceIndex, i) => {
        const name = traces[traceIndex]?.name;
        if (!name) return;
        if (visibility[i] === 'legendonly') next.add(name);
        else next.delete(name);
      });
      return next;
    });
  };

  return (
    <SectionCard
      title="Price Action & Execution"
      description="Interactive chart with indicators and order history"
      action={
        <div className="flex flex-wrap gap-2">
          <ChartToggle pressed={showIndicators} onPressedChange={setShowIndicators}>
            Indicators
          </ChartToggle>
          <ChartToggle pressed={showVolume} onPressedChange={setShowVolume}>
            Volume
          </ChartToggle>
          <ChartToggle pressed={showSubIndicators} onPressedChange={setShowSubIndicators}>
            Sub-Indicators
          </ChartToggle>
        </div>
      }
    >
      {showSubIndicators && standaloneIndicators.length > 0 && (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {standaloneIndicators.map((indicator) => (
            <ChartToggle
              key={indicator.name}
              size="sm"
              pressed={isSubIndicatorActive(indicator.name)}
              onPressedChange={(pressed) =>
                setSubIndicatorChoice((prev) => ({ ...prev, [indicator.name]: pressed }))
              }
            >
              {indicator.name}
            </ChartToggle>
          ))}
        </div>
      )}

      {figure ? (
        <Plot
          data={traces}
          layout={figure.layout}
          onRelayout={handleRelayout}
          onRestyle={handleRestyle}
          className="w-full"
          style={{ height: figure.height }}
          config={INTERACTIVE_CONFIG}
        />
      ) : (
        <p className="py-16 text-center text-sm text-muted-foreground">No candle data available.</p>
      )}
    </SectionCard>
  );
}

function ChartToggle(props: ComponentProps<typeof Toggle>) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      className="px-3 text-xs font-semibold tracking-wider uppercase data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      {...props}
    />
  );
}
