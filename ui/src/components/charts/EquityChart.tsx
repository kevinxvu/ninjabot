import { useMemo } from 'react';
import type { Annotations, Data, Shape } from 'plotly.js';
import type { ChartData } from '@/api/types';
import { formatPlotlyLocalDate, toEpochMs } from '@/lib/time';
import { Plot } from './Plot';
import { CHART_COLORS, FONT_FAMILY, INTERACTIVE_CONFIG, baseTimeLayout } from './theme';

type EquityChartData = Pick<ChartData, 'equity_values' | 'asset_values' | 'max_drawdown' | 'quote' | 'asset'>;

/** Portfolio equity (quote) vs position value (asset), with the max drawdown window shaded. */
export function EquityChart({ data, height = 300 }: { data: EquityChartData; height?: number }) {
  const figure = useMemo(() => {
    const equity = data.equity_values ?? [];
    const assets = data.asset_values ?? [];
    const quote = data.quote || 'USDT';
    const asset = data.asset || 'ASSET';

    const traces: Partial<Data>[] = [
      {
        name: `Equity (${quote})`,
        x: equity.map((v) => formatPlotlyLocalDate(v.time)),
        y: equity.map((v) => v.value),
        type: 'scatter',
        mode: 'lines',
        fill: 'tozeroy',
        line: { color: CHART_COLORS.blue, width: 2 },
        fillcolor: 'rgba(59, 130, 246, 0.2)',
      },
      {
        name: `Position (${asset})`,
        x: assets.map((v) => formatPlotlyLocalDate(v.time)),
        y: assets.map((v) => v.value),
        type: 'scatter',
        mode: 'lines',
        line: { color: CHART_COLORS.violet, width: 2 },
        yaxis: 'y2',
      },
    ];

    const shapes: Partial<Shape>[] = [];
    const annotations: Partial<Annotations>[] = [];
    const drawdown = data.max_drawdown;

    if (drawdown && equity.length) {
      const values = equity.map((v) => v.value);
      const top = Math.max(...values);
      shapes.push({
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: formatPlotlyLocalDate(drawdown.start),
        x1: formatPlotlyLocalDate(drawdown.end),
        y0: Math.min(...values) * 0.95,
        y1: top,
        line: { width: 0 },
        fillcolor: 'rgba(239, 68, 68, 0.15)',
        layer: 'below',
      });
      annotations.push({
        x: formatPlotlyLocalDate((toEpochMs(drawdown.start) + toEpochMs(drawdown.end)) / 2),
        y: top * 0.95,
        xref: 'x',
        yref: 'y',
        text: `Drawdown<br>${drawdown.value}%`,
        showarrow: false,
        font: { size: 11, color: CHART_COLORS.down, family: FONT_FAMILY },
      });
    }

    const layout = baseTimeLayout({
      height,
      margin: { t: 20, r: 60, l: 60, b: 40 },
      yaxis: {
        title: { text: `Equity (${quote})` },
        gridcolor: CHART_COLORS.grid,
        side: 'left',
        tickformat: ',.8~f',
        showline: true,
        linecolor: CHART_COLORS.grid,
      },
      yaxis2: {
        title: { text: `Position (${asset})` },
        overlaying: 'y',
        side: 'right',
        showgrid: false,
      },
      shapes,
      annotations,
    });

    return { traces, layout };
  }, [data, height]);

  return (
    <Plot
      data={figure.traces}
      layout={figure.layout}
      className="w-full"
      style={{ height }}
      config={INTERACTIVE_CONFIG}
    />
  );
}
