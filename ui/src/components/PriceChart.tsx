import React, { useState, useEffect, useMemo } from 'react';
import ReactPlotly from 'react-plotly.js';
import { formatClientDateTime, formatPlotlyLocalDate } from '../utils/time';

const Plot = (ReactPlotly as unknown as { default: React.ComponentType<Record<string, unknown>> }).default || ReactPlotly;

const STATUS_FILLED = "FILLED";
const BUY_SIDE = "BUY";
const SELL_SIDE = "SELL";

function formatNumber(num: number, decimals = 2) {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPriceLabel(num: number) {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}


function formatPercent(num: number) {
  const sign = num >= 0 ? "+" : "";
  return `${sign}${formatNumber(num * 100, 2)}%`;
}

export interface Order {
  id: string | number;
  status: string;
  side: string;
  price: number;
  quantity: number;
  type: string;
  profit?: number;
  updated_at: string | number;
  [key: string]: unknown;
}

export interface Candle {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  orders?: Order[];
  [key: string]: unknown;
}

export type RealtimeCandle = Partial<Candle> & {
  Time?: string | number;
  Open?: number;
  High?: number;
  Low?: number;
  Close?: number;
  Volume?: number;
  Complete?: boolean;
};

export interface Metric {
  name?: string;
  time: (string | number)[];
  value: (number | null)[];
  style?: string;
  color?: string;
}

export interface Indicator {
  name: string;
  overlay: boolean;
  metrics: Metric[];
}

export interface ChartShape {
  x0: string | number;
  y0: number;
  x1: string | number;
  y1: number;
  color: string;
}

export interface SessionEvent {
  id?: string | number;
  type: "START" | "STOP" | "RESUME" | string;
  created_at: string | number;
  [key: string]: unknown;
}

export interface ChartData {
  candles?: Candle[];
  indicators?: Indicator[];
  shapes?: ChartShape[];
  events?: SessionEvent[];
  [key: string]: unknown;
}

export interface PriceChartProps {
  data: ChartData | null;
  currentPrice?: number;
  realtimeCandle?: RealtimeCandle | null;
  timeframe?: string;
}

function parseTimeframeMs(timeframe?: string) {
  const match = timeframe?.match(/^(\d+)([mhdwM])$/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

function normalizeCandle(candle: RealtimeCandle): Candle {
  return {
    ...candle,
    time: candle.time ?? candle.Time ?? Date.now(),
    open: candle.open ?? candle.Open ?? 0,
    high: candle.high ?? candle.High ?? 0,
    low: candle.low ?? candle.Low ?? 0,
    close: candle.close ?? candle.Close ?? 0,
    volume: candle.volume ?? candle.Volume ?? 0,
  };
}

function getCandleTimeMs(candle: Pick<Candle, "time">) {
  const time = typeof candle.time === "number" ? candle.time : new Date(candle.time).getTime();
  return time < 10_000_000_000 ? time * 1000 : time;
}

function buildDisplayCandles(candles: Candle[], currentPrice: number, timeframe?: string, realtimeCandle?: RealtimeCandle | null) {
  if (!candles.length) return candles;

  const displayCandles = candles.map((candle) => ({ ...candle }));

  if (realtimeCandle) {
    const nextCandle = normalizeCandle(realtimeCandle);
    const lastIndex = displayCandles.length - 1;
    const lastTime = getCandleTimeMs(displayCandles[lastIndex]);
    const nextTime = getCandleTimeMs(nextCandle);

    if (nextTime === lastTime) {
      displayCandles[lastIndex] = {
        ...displayCandles[lastIndex],
        ...nextCandle,
      };
    } else if (nextTime > lastTime) {
      displayCandles.push(nextCandle);
    }
  }

  if (currentPrice <= 0) return displayCandles;

  const lastIndex = displayCandles.length - 1;
  const lastCandle = displayCandles[lastIndex];
  const timeframeMs = parseTimeframeMs(timeframe);
  const tickTime = Date.now();
  const lastTime = getCandleTimeMs(lastCandle);

  if (timeframeMs && tickTime >= lastTime + timeframeMs) {
    const bucketTime = Math.floor(tickTime / timeframeMs) * timeframeMs;
    displayCandles.push({
      ...lastCandle,
      time: new Date(bucketTime).toISOString(),
      open: currentPrice,
      high: currentPrice,
      low: currentPrice,
      close: currentPrice,
      volume: 0,
      orders: [],
    });
    return displayCandles;
  }

  displayCandles[lastIndex] = {
    ...lastCandle,
    close: currentPrice,
    high: Math.max(lastCandle.high, currentPrice),
    low: Math.min(lastCandle.low, currentPrice),
  };

  return displayCandles;
}

export function PriceChart({ data, currentPrice = 0, realtimeCandle = null, timeframe }: PriceChartProps) {
  // View controls
  const [showIndicators, setShowIndicators] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showSubIndicators, setShowSubIndicators] = useState(false);
  const [activeSubIndicators, setActiveSubIndicators] = useState<Set<string>>(new Set());

  // Initialize active sub-indicators when data changes
  useEffect(() => {
    if (!data?.indicators) return;
    
    let isMounted = true;
    
    // Defer the state update to avoid cascading render warnings
    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      
      const initialSet = new Set<string>();
      data.indicators!.forEach((ind: Indicator) => {
        if (!ind.overlay && ind.name.startsWith("RSI")) {
          initialSet.add(ind.name);
        }
      });
      
      setActiveSubIndicators(prev => {
        if (prev.size !== initialSet.size) return initialSet;
        for (const item of initialSet) {
          if (!prev.has(item)) return initialSet;
        }
        return prev;
      });
    }, 0);
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [data?.indicators]);

  const toggleSubIndicator = (name: string) => {
    setActiveSubIndicators(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const displayCandles = useMemo(() => {
    if (!data?.candles?.length) return [];
    return buildDisplayCandles(data.candles, currentPrice, timeframe, realtimeCandle);
  }, [data?.candles, currentPrice, timeframe, realtimeCandle]);

  const renderMainChart = () => {
    if (!data?.candles?.length) return null;

    const times = displayCandles.map((c: Candle) => formatPlotlyLocalDate(c.time));
    
    // Process orders for markers and annotations
    const points: { time: string | number; position: number; side: string }[] = [];
    const annotations: Record<string, unknown>[] = [];
    displayCandles.forEach((candle: Candle) => {
      candle.orders
        ?.filter((o: Order) => o.status === STATUS_FILLED)
        .forEach((order: Order) => {
          points.push({
            time: formatPlotlyLocalDate(candle.time),
            position: order.price,
            side: order.side,
          });

          annotations.push({
            x: formatPlotlyLocalDate(candle.time),
            y: order.side === SELL_SIDE ? candle.high : candle.low,
            xref: "x",
            yref: "y",
            text: order.side === SELL_SIDE ? "S" : "B",
            hovertext: `${formatClientDateTime(order.updated_at)}
                      <br>ID: ${order.id}
                      <br>Price: ${formatNumber(order.price, 2)}
                      <br>Size: ${formatNumber(order.quantity, 4)}
                      <br>Type: ${order.type}${order.profit ? `<br>Profit: ${formatPercent(order.profit)}` : ""}`,
            showarrow: true,
            arrowcolor: order.side === SELL_SIDE ? "#ef4444" : "#10b981",
            valign: order.side === SELL_SIDE ? "top" : "bottom",
            borderpad: 4,
            arrowhead: 2,
            ax: 0,
            ay: order.side === SELL_SIDE ? -20 : 20,
            font: {
              size: 11,
              color: order.side === SELL_SIDE ? "#ef4444" : "#10b981",
              family: "Inter, sans-serif",
            },
          } as Record<string, unknown>);
        });
    });

    const sellPoints = points.filter((p: { side: string }) => p.side === SELL_SIDE);
    const buyPoints = points.filter((p: { side: string }) => p.side === BUY_SIDE);

    const traces: Record<string, unknown>[] = [
      {
        x: times,
        close: displayCandles.map((c: Candle) => c.close),
        high: displayCandles.map((c: Candle) => c.high),
        low: displayCandles.map((c: Candle) => c.low),
        open: displayCandles.map((c: Candle) => c.open),
        type: 'candlestick',
        name: 'Price',
        increasing: { line: { color: "#10b981" } },
        decreasing: { line: { color: "#ef4444" } },
        yaxis: 'y'
      },
      {
        name: "Buy",
        x: buyPoints.map((p) => p.time),
        y: buyPoints.map((p) => p.position),
        mode: "markers",
        type: "scatter",
        marker: {
          color: "#10b981",
          size: 10,
          symbol: "triangle-up",
          line: { color: "#059669", width: 1 },
        },
        hovertemplate: "Buy: %{y}<extra></extra>",
      },
      {
        name: "Sell",
        x: sellPoints.map((p) => p.time),
        y: sellPoints.map((p) => p.position),
        mode: "markers",
        type: "scatter",
        marker: {
          color: "#ef4444",
          size: 10,
          symbol: "triangle-down",
          line: { color: "#dc2626", width: 1 },
        },
        hovertemplate: "Sell: %{y}<extra></extra>",
      }
    ];

    if (showVolume) {
      traces.push({
        x: times,
        y: displayCandles.map((c: Candle) => c.volume),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: {
          color: displayCandles.map((c: Candle) => c.close >= c.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'),
          line: { width: 0 }
        }
      });
    }

    let standaloneIndicatorsCount = 0;
    let renderedStandaloneIndicators: Indicator[] = [];
    const layoutAxes: Record<string, unknown> = {};

    if (data.indicators) {
      if (showIndicators) {
        data.indicators.filter((i: Indicator) => i.overlay).forEach((indicator: Indicator) => {
          indicator.metrics.forEach((metric: Metric) => {
            traces.push({
              x: metric.time.map(formatPlotlyLocalDate),
              y: metric.value.map((v: number | null) => v === 0 ? null : v),
              type: metric.style || 'scatter',
              mode: 'lines',
              name: `${indicator.name} ${metric.name || ""}`,
              line: { color: metric.color || '#3b82f6', width: 2 },
              yaxis: 'y',
              hovertemplate: "%{y:.2f}<extra></extra>"
            });
          });
        });
      }

      if (showSubIndicators) {
        const standaloneIndicators = data.indicators.filter((i: Indicator) => !i.overlay);
        renderedStandaloneIndicators = standaloneIndicators.filter((ind: Indicator) => activeSubIndicators.has(ind.name));
        standaloneIndicatorsCount = renderedStandaloneIndicators.length;
      }
    }

    let chartHeight = 600;
    let yaxisDomain = [0.2, 1];
    let yaxis2Domain = [0, 0.15];
    const shapes: Record<string, unknown>[] = (data.shapes || []).map((s: ChartShape) => ({
      type: "rect",
      xref: "x",
      yref: "y",
      x0: formatPlotlyLocalDate(s.x0),
      y0: s.y0,
      x1: formatPlotlyLocalDate(s.x1),
      y1: s.y1,
      line: { width: 0 },
      fillcolor: s.color,
      layer: "below",
    }));

    const sessionEvents = [...(data.events || [])].sort((a: SessionEvent, b: SessionEvent) => (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ));
    const lastEventRangeTime = displayCandles[displayCandles.length - 1]?.time;

    sessionEvents.forEach((event: SessionEvent, index: number) => {
      const isRunningRange = event.type === "START" || event.type === "RESUME";
      if (!isRunningRange) return;

      const nextEvent = sessionEvents[index + 1];
      const rangeEnd = nextEvent?.created_at || lastEventRangeTime;
      if (!rangeEnd) return;

      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: formatPlotlyLocalDate(event.created_at),
        x1: formatPlotlyLocalDate(rangeEnd),
        y0: 0,
        y1: 1,
        line: { width: 0 },
        fillcolor: "rgba(16, 185, 129, 0.07)",
        layer: "below",
      });
    });

    sessionEvents.forEach((event: SessionEvent) => {
      const eventTime = formatPlotlyLocalDate(event.created_at);
      const isStop = event.type === "STOP";
      const isStart = event.type === "START" || event.type === "RESUME";
      const color = isStop ? "#f97316" : isStart ? "#10b981" : "#6366f1";
      const label = event.type === "RESUME" ? "RESUME" : event.type;

      shapes.push({
        type: "line",
        xref: "x",
        yref: "paper",
        x0: eventTime,
        x1: eventTime,
        y0: 0,
        y1: 1,
        line: {
          color,
          width: 1,
          dash: isStop ? "dash" : "dot",
        },
      });

      annotations.push({
        x: eventTime,
        y: 1,
        xref: "x",
        yref: "paper",
        yanchor: "bottom",
        text: label,
        showarrow: false,
        font: {
          family: "Inter, sans-serif",
          size: 10,
          color,
        },
        bgcolor: "#ffffff",
        bordercolor: color,
        borderwidth: 1,
        borderpad: 3,
      } as Record<string, unknown>);
    });

    // Add current price line
    const lastCandle = displayCandles.length > 0 ? displayCandles[displayCandles.length - 1] : null;
    if (lastCandle) {
      const lastPrice = currentPrice > 0 ? currentPrice : lastCandle.close;
      const priceColor = lastPrice >= lastCandle.open ? '#10b981' : '#ef4444';

      shapes.push({
        type: 'line',
        xref: 'paper',
        yref: 'y',
        x0: 0,
        y0: lastPrice,
        x1: 1,
        y1: lastPrice,
        line: {
          color: priceColor,
          width: 1,
          dash: 'dot'
        }
      });
      
      annotations.push({
        xref: 'paper',
        yref: 'y',
        x: 1,
        y: lastPrice,
        xanchor: 'left',
        yanchor: 'middle',
        xshift: 6,
        text: formatPriceLabel(lastPrice),
        showarrow: false,
        font: {
          family: 'Inter, sans-serif',
          size: 11,
          color: '#ffffff'
        },
        bgcolor: priceColor,
        bordercolor: priceColor,
        borderpad: 2
      } as Record<string, unknown>);
    }

    if (showSubIndicators && standaloneIndicatorsCount > 0) {
      const subHeightPx = 150;
      const baseHeightPx = 600;
      chartHeight = baseHeightPx + (standaloneIndicatorsCount * subHeightPx);

      const singleSubRatio = subHeightPx / chartHeight;
      const totalSubHeightRatio = (standaloneIndicatorsCount * subHeightPx) / chartHeight;
      const baseRatio = baseHeightPx / chartHeight;

      yaxisDomain = [totalSubHeightRatio + baseRatio * 0.2, 1];
      yaxis2Domain = [totalSubHeightRatio, totalSubHeightRatio + baseRatio * 0.15];

      let standaloneIndicatorIndex = 0;

      renderedStandaloneIndicators.forEach((indicator: Indicator) => {
        const axisNumber = standaloneIndicatorIndex + 3;
        const heightEnd = totalSubHeightRatio - standaloneIndicatorIndex * singleSubRatio;
        const heightStart = heightEnd - singleSubRatio;

        layoutAxes["yaxis" + axisNumber] = {
          title: indicator.name,
          domain: [heightStart, heightEnd - 0.02],
          showgrid: true,
          gridcolor: "var(--border-color)",
          side: "left",
          tickformat: ",.2f"
        };

        if (indicator.name.startsWith("RSI") || indicator.name.startsWith("Stoch")) {
          const axis = layoutAxes["yaxis" + axisNumber] as Record<string, unknown>;
          layoutAxes["yaxis" + axisNumber] = { ...axis, range: [0, 100], tickvals: [20, 30, 70, 80] };
          
          shapes.push({
            type: "line", xref: "paper", yref: "y" + axisNumber,
            x0: 0, y0: 30, x1: 1, y1: 30,
            line: { color: "var(--text-tertiary)", width: 1, dash: "dot" }
          });
          shapes.push({
            type: "line", xref: "paper", yref: "y" + axisNumber,
            x0: 0, y0: 70, x1: 1, y1: 70,
            line: { color: "var(--text-tertiary)", width: 1, dash: "dot" }
          });
        }

        indicator.metrics.forEach((metric: Metric) => {
          traces.push({
            name: `${indicator.name}${metric.name ? " - " + metric.name : ""}`,
            x: metric.time.map(formatPlotlyLocalDate),
            y: metric.value,
            type: metric.style || "scatter",
            mode: "lines",
            yaxis: "y" + axisNumber,
            line: { color: metric.color || "#8b5cf6", width: 1.5 },
            hovertemplate: "%{y:.2f}<extra></extra>",
          });
        });

        standaloneIndicatorIndex++;
      });
    }

    const layout = {
      height: chartHeight,
      autosize: true,
      margin: { t: 20, r: 96, l: 60, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: "Inter, sans-serif", color: 'var(--text-primary)' },
      dragmode: "pan" as const,
      xaxis: {
        type: 'date' as const,
        gridcolor: 'var(--border-color)',
        rangeslider: { visible: false },
        showline: true,
        linecolor: "var(--border-color)",
        tickformat: "%H:%M\\n%Y-%m-%d",
        hoverformat: "%Y-%m-%d %H:%M:%S"
      },
      yaxis: {
        domain: yaxisDomain,
        gridcolor: 'var(--border-color)',
        title: { text: 'Price' },
        side: "left" as const,
        tickformat: ",.8~f",
        showline: true,
        linecolor: "var(--border-color)"
      },
      yaxis2: {
        domain: yaxis2Domain,
        gridcolor: 'var(--border-color)',
        showticklabels: false,
        side: "right" as const,
        showgrid: false
      },
      showlegend: true,
      legend: { 
        orientation: 'h' as const, 
        yanchor: "bottom" as const,
        y: 1.02,
        xanchor: "left" as const,
        x: 0,
        bgcolor: "#ffffff",
        bordercolor: "#e2e8f0",
        borderwidth: 1
      },
      hovermode: "x unified" as const,
      hoverlabel: {
        bgcolor: "#ffffff",
        font: { color: "#0f172a" },
        bordercolor: "#e2e8f0",
      },
      annotations,
      shapes,
      ...layoutAxes
    };

    return (
      <Plot
        data={traces}
        layout={layout}
        useResizeHandler
        className="w-full"
        style={{ height: chartHeight }}
        config={{ responsive: true, scrollZoom: true, displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] }}
      />
    );
  };

  return (
    <div className="bg-[var(--bg-primary)] p-5 rounded-xl border border-[var(--border-color)] shadow-[var(--input-shadow)] mt-6">
      <div className="flex justify-between items-center mb-6 border-b border-[var(--border-color)] pb-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Price Action & Execution</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Interactive chart with indicators and order history</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors ${showIndicators ? 'bg-[var(--brand-accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'}`}
          >
            Indicators
          </button>
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors ${showVolume ? 'bg-[var(--brand-accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'}`}
          >
            Volume
          </button>
          <button
            onClick={() => setShowSubIndicators(!showSubIndicators)}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors ${showSubIndicators ? 'bg-[var(--brand-accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'}`}
          >
            Sub-Indicators
          </button>
        </div>
      </div>
      
      {showSubIndicators && (data?.indicators || []).filter((i: Indicator) => !i.overlay).length > 0 && (
        <div className="flex gap-2 mb-4 justify-end flex-wrap">
          {(data?.indicators || []).filter((i: Indicator) => !i.overlay).map((ind: Indicator) => (
            <button
              key={ind.name}
              onClick={() => toggleSubIndicator(ind.name)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${activeSubIndicators.has(ind.name) ? 'bg-[var(--brand-color)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-white'}`}
            >
              {ind.name}
            </button>
          ))}
        </div>
      )}
      
      {renderMainChart()}
    </div>
  );
}
