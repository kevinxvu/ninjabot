import { useMemo } from 'react';
import type { Data } from 'plotly.js';
import type { MarketCandle } from '@/api/types';
import { isValidCandle, normalizeCandle } from '@/lib/candles';
import { formatPrice, formatUsd, getPriceFractionDigits } from '@/lib/format';
import { formatPlotlyLocalDate } from '@/lib/time';
import { Plot } from './Plot';
import { CHART_COLORS, DATE_HOVER_FORMAT, INTERACTIVE_CONFIG, baseTimeLayout } from './theme';

interface LiveCandleChartProps {
  candles: MarketCandle[];
  /** Latest ticker price; falls back to the last close. */
  currentPrice?: number;
  /** Changing it resets zoom/pan. */
  revision: string;
}

/** Candlestick + volume chart for live market data (Dashboard). */
export function LiveCandleChart({ candles, currentPrice = 0, revision }: LiveCandleChartProps) {
  const figure = useMemo(() => {
    const display = candles.map(normalizeCandle).filter(isValidCandle);
    const lastClose = display.length ? display[display.length - 1].close : 0;
    const price = currentPrice || lastClose;
    const tickFormat = `,.${getPriceFractionDigits(price)}f`;
    const x = display.map((c) => formatPlotlyLocalDate(c.time));

    const traces: Partial<Data>[] = [
      {
        type: 'candlestick',
        x,
        open: display.map((c) => c.open),
        high: display.map((c) => c.high),
        low: display.map((c) => c.low),
        close: display.map((c) => c.close),
        customdata: display.map((c) => [
          formatPrice(c.open),
          formatPrice(c.high),
          formatPrice(c.low),
          formatPrice(c.close),
        ]),
        increasing: { line: { color: '#22c55e' } },
        decreasing: { line: { color: CHART_COLORS.down } },
        hovertemplate: [
          `Time: %{x|${DATE_HOVER_FORMAT}}`,
          'Open: %{customdata[0]}',
          'High: %{customdata[1]}',
          'Low: %{customdata[2]}',
          'Close: %{customdata[3]}',
          '<extra></extra>',
        ].join('<br>'),
      } as Partial<Data>,
      {
        type: 'bar',
        name: 'Volume',
        x,
        y: display.map((c) => c.volume),
        yaxis: 'y2',
        marker: {
          color: display.map((c) =>
            c.close >= c.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
          ),
          line: { width: 0 },
        },
        hovertemplate: 'Volume: %{y:,.2f}<extra></extra>',
      },
    ];

    const layout = baseTimeLayout({
      margin: { l: 40, r: 80, t: 20, b: 40 },
      uirevision: revision,
      showlegend: false,
      xaxis: {
        gridcolor: CHART_COLORS.gridSoft,
        showline: false,
        rangeslider: { visible: false },
        showspikes: true,
        spikemode: 'across',
        spikesnap: 'cursor',
        spikecolor: CHART_COLORS.muted,
        spikethickness: 1,
        spikedash: 'dot',
      },
      yaxis: {
        domain: [0.22, 1],
        gridcolor: CHART_COLORS.gridSoft,
        hoverformat: tickFormat,
        tickformat: tickFormat,
        exponentformat: 'none',
        showexponent: 'none',
        side: 'right',
      },
      yaxis2: {
        domain: [0, 0.16],
        gridcolor: CHART_COLORS.gridSoft,
        showticklabels: false,
        side: 'right',
      },
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: price,
          y1: price,
          line: { color: CHART_COLORS.indigo, width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        {
          xref: 'paper',
          yref: 'y',
          x: 1,
          y: price,
          xanchor: 'left',
          yanchor: 'middle',
          text: formatUsd(price),
          showarrow: false,
          font: { color: '#ffffff', size: 11 },
          bgcolor: CHART_COLORS.indigo,
          bordercolor: CHART_COLORS.indigo,
          borderwidth: 1,
          borderpad: 4,
        },
      ],
    });

    return { traces, layout };
  }, [candles, currentPrice, revision]);

  return (
    <Plot
      key={revision}
      data={figure.traces}
      layout={figure.layout}
      className="h-full w-full"
      style={{ width: '100%', height: '100%' }}
      config={INTERACTIVE_CONFIG}
    />
  );
}
