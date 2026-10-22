import type { Annotations, Data, Layout, Shape } from 'plotly.js';
import type { ChartCandle, ChartShape, Indicator, SessionEvent } from '@/api/types';
import { formatNumber, formatPercent } from '@/lib/format';
import { formatClientDateTime, formatPlotlyLocalDate, toEpochMs } from '@/lib/time';
import { CHART_COLORS, FONT_FAMILY, baseTimeLayout } from './theme';

const BASE_HEIGHT_PX = 600;
const SUB_INDICATOR_HEIGHT_PX = 150;

export interface PriceFigureInput {
  candles: ChartCandle[];
  indicators?: Indicator[];
  shapes?: ChartShape[];
  events?: SessionEvent[];
  currentPrice: number;
  showIndicators: boolean;
  showVolume: boolean;
  /** Non-overlay indicators rendered in their own panes under the price. */
  subIndicators: Indicator[];
  xRange: [string, string] | null;
  yRange: [number, number] | null;
  dragmode: Layout['dragmode'];
}

function orderAnnotations(candles: ChartCandle[]) {
  const buys: { x: string; y: number }[] = [];
  const sells: { x: string; y: number }[] = [];
  const annotations: Partial<Annotations>[] = [];

  for (const candle of candles) {
    const x = formatPlotlyLocalDate(candle.time);
    for (const order of candle.orders ?? []) {
      if (order.status !== 'FILLED') continue;
      const isSell = order.side === 'SELL';
      const color = isSell ? CHART_COLORS.down : CHART_COLORS.up;
      (isSell ? sells : buys).push({ x, y: order.price });

      annotations.push({
        x,
        y: isSell ? candle.high : candle.low,
        xref: 'x',
        yref: 'y',
        text: isSell ? 'S' : 'B',
        hovertext: [
          formatClientDateTime(order.updated_at),
          `ID: ${order.id}`,
          `Price: ${formatNumber(order.price, 2)}`,
          `Size: ${formatNumber(order.quantity, 4)}`,
          `Type: ${order.type}`,
          ...(order.profit ? [`Profit: ${formatPercent(order.profit)}`] : []),
        ].join('<br>'),
        showarrow: true,
        arrowcolor: color,
        valign: isSell ? 'top' : 'bottom',
        borderpad: 4,
        arrowhead: 2,
        ax: 0,
        ay: isSell ? -20 : 20,
        font: { size: 11, color, family: FONT_FAMILY },
      });
    }
  }

  return { buys, sells, annotations };
}

function sessionEventMarks(events: SessionEvent[]) {
  const shapes: Partial<Shape>[] = [];
  const annotations: Partial<Annotations>[] = [];

  const sorted = [...events].sort((a, b) => toEpochMs(a.created_at) - toEpochMs(b.created_at));
  for (const event of sorted) {
    const x = formatPlotlyLocalDate(event.created_at);
    const isStop = event.type === 'STOP';
    const isStart = event.type === 'START' || event.type === 'RESUME';
    const color = isStop ? CHART_COLORS.orange : isStart ? CHART_COLORS.up : CHART_COLORS.indigo;

    shapes.push({
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: x,
      x1: x,
      y0: 0,
      y1: 1,
      line: { color, width: 1, dash: isStop ? 'dash' : 'dot' },
    });
    annotations.push({
      x,
      y: 1,
      xref: 'x',
      yref: 'paper',
      yanchor: 'bottom',
      text: event.type,
      showarrow: false,
      font: { family: FONT_FAMILY, size: 10, color },
      bgcolor: CHART_COLORS.surface,
      bordercolor: color,
      borderwidth: 1,
      borderpad: 3,
    });
  }

  return { shapes, annotations };
}

/** Builds traces + layout for the candlestick / orders / indicators chart. */
export function buildPriceFigure(input: PriceFigureInput) {
  const { candles, currentPrice, subIndicators } = input;
  const times = candles.map((candle) => formatPlotlyLocalDate(candle.time));
  const orders = orderAnnotations(candles);
  // The backend only returns recent history for long sessions; drop older marks so
  // they don't stretch the x-axis far beyond the candles.
  const firstMs = candles.length ? toEpochMs(candles[0].time) : Number.NEGATIVE_INFINITY;
  const events = sessionEventMarks(
    (input.events ?? []).filter((event) => toEpochMs(event.created_at) >= firstMs),
  );

  const traces: Partial<Data>[] = [
    {
      x: times,
      open: candles.map((c) => c.open),
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      type: 'candlestick',
      name: 'Price',
      increasing: { line: { color: CHART_COLORS.up } },
      decreasing: { line: { color: CHART_COLORS.down } },
      yaxis: 'y',
    } as Partial<Data>,
    {
      name: 'Buy',
      x: orders.buys.map((p) => p.x),
      y: orders.buys.map((p) => p.y),
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: CHART_COLORS.up,
        size: 10,
        symbol: 'triangle-up',
        line: { color: '#059669', width: 1 },
      },
      hovertemplate: 'Buy: %{y}<extra></extra>',
    },
    {
      name: 'Sell',
      x: orders.sells.map((p) => p.x),
      y: orders.sells.map((p) => p.y),
      mode: 'markers',
      type: 'scatter',
      marker: {
        color: CHART_COLORS.down,
        size: 10,
        symbol: 'triangle-down',
        line: { color: '#dc2626', width: 1 },
      },
      hovertemplate: 'Sell: %{y}<extra></extra>',
    },
  ];

  if (input.showVolume) {
    traces.push({
      x: times,
      y: candles.map((c) => c.volume),
      type: 'bar',
      name: 'Volume',
      yaxis: 'y2',
      marker: {
        color: candles.map((c) => (c.close >= c.open ? CHART_COLORS.upSoft : CHART_COLORS.downSoft)),
        line: { width: 0 },
      },
    });
  }

  if (input.showIndicators) {
    for (const indicator of input.indicators ?? []) {
      if (!indicator.overlay) continue;
      for (const metric of indicator.metrics) {
        traces.push({
          x: metric.time.map(formatPlotlyLocalDate),
          y: metric.value.map((v) => (v === 0 ? null : v)),
          type: (metric.style || 'scatter') as 'scatter',
          mode: 'lines',
          name: `${indicator.name} ${metric.name || ''}`,
          line: { color: metric.color || CHART_COLORS.blue, width: 2 },
          yaxis: 'y',
          hovertemplate: '%{y:.2f}<extra></extra>',
        });
      }
    }
  }

  const shapes: Partial<Shape>[] = [
    ...(input.shapes ?? [])
      .filter((s) => toEpochMs(s.x1) >= firstMs)
      .map((s): Partial<Shape> => ({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: formatPlotlyLocalDate(s.x0),
        x1: formatPlotlyLocalDate(s.x1),
        y0: s.y0,
        y1: s.y1,
        line: { width: 0 },
        fillcolor: s.color,
        layer: 'below',
      })),
    ...events.shapes,
  ];
  const annotations: Partial<Annotations>[] = [...orders.annotations, ...events.annotations];

  // Last price line + label on the right edge.
  const last = candles[candles.length - 1];
  if (last) {
    const lastPrice = currentPrice > 0 ? currentPrice : last.close;
    const color = lastPrice >= last.open ? CHART_COLORS.up : CHART_COLORS.down;
    shapes.push({
      type: 'line',
      xref: 'paper',
      yref: 'y',
      x0: 0,
      x1: 1,
      y0: lastPrice,
      y1: lastPrice,
      line: { color, width: 1, dash: 'dot' },
    });
    annotations.push({
      xref: 'paper',
      yref: 'y',
      x: 1,
      y: lastPrice,
      xanchor: 'left',
      yanchor: 'middle',
      xshift: 6,
      text: lastPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 }),
      showarrow: false,
      font: { family: FONT_FAMILY, size: 11, color: '#ffffff' },
      bgcolor: color,
      bordercolor: color,
      borderpad: 2,
    });
  }

  // Stack sub-indicator panes under the price + volume area.
  let height = BASE_HEIGHT_PX;
  let priceDomain: [number, number] = [0.2, 1];
  let volumeDomain: [number, number] = [0, 0.15];
  const subAxes: Record<string, unknown> = {};

  if (subIndicators.length > 0) {
    height = BASE_HEIGHT_PX + subIndicators.length * SUB_INDICATOR_HEIGHT_PX;
    const paneRatio = SUB_INDICATOR_HEIGHT_PX / height;
    const subTotal = subIndicators.length * paneRatio;
    const baseRatio = BASE_HEIGHT_PX / height;
    priceDomain = [subTotal + baseRatio * 0.2, 1];
    volumeDomain = [subTotal, subTotal + baseRatio * 0.15];

    subIndicators.forEach((indicator, index) => {
      const axisNumber = index + 3;
      const axisRef = `y${axisNumber}`;
      const top = subTotal - index * paneRatio;
      const bounded = indicator.name.startsWith('RSI') || indicator.name.startsWith('Stoch');

      subAxes[`yaxis${axisNumber}`] = {
        title: { text: indicator.name },
        domain: [top - paneRatio, top - 0.02],
        showgrid: true,
        gridcolor: CHART_COLORS.grid,
        side: 'left',
        tickformat: ',.2f',
        ...(bounded ? { range: [0, 100], tickvals: [20, 30, 70, 80] } : {}),
      };

      if (bounded) {
        for (const level of [30, 70]) {
          shapes.push({
            type: 'line',
            xref: 'paper',
            yref: axisRef as 'y',
            x0: 0,
            x1: 1,
            y0: level,
            y1: level,
            line: { color: CHART_COLORS.slate, width: 1, dash: 'dot' },
          });
        }
      }

      for (const metric of indicator.metrics) {
        traces.push({
          name: `${indicator.name}${metric.name ? ` - ${metric.name}` : ''}`,
          x: metric.time.map(formatPlotlyLocalDate),
          y: metric.value,
          type: (metric.style || 'scatter') as 'scatter',
          mode: 'lines',
          yaxis: axisRef,
          line: { color: metric.color || CHART_COLORS.violet, width: 1.5 },
          hovertemplate: '%{y:.2f}<extra></extra>',
        });
      }
    });
  }

  const layout: Partial<Layout> = {
    ...baseTimeLayout({
      height,
      margin: { t: 20, r: 96, l: 60, b: 40 },
      dragmode: input.dragmode,
      xaxis: {
        rangeslider: { visible: false },
        // Restore the user's zoom so realtime updates don't reset the view.
        ...(input.xRange ? { range: input.xRange, autorange: false } : {}),
      },
    }),
    yaxis: {
      domain: priceDomain,
      gridcolor: CHART_COLORS.grid,
      title: { text: 'Price' },
      side: 'left',
      tickformat: ',.8~f',
      showline: true,
      linecolor: CHART_COLORS.grid,
      ...(input.yRange ? { range: input.yRange, autorange: false } : {}),
    },
    yaxis2: {
      domain: volumeDomain,
      showticklabels: false,
      side: 'right',
      showgrid: false,
    },
    annotations,
    shapes,
    ...subAxes,
  };

  return { traces, layout, height };
}
