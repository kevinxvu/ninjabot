import { useMemo } from 'react';
import type { Data } from 'plotly.js';
import { Plot } from '@/components/charts/Plot';
import { CHART_COLORS, INTERACTIVE_CONFIG, baseTimeLayout } from '@/components/charts/theme';
import { formatPlotlyLocalDate } from '@/lib/time';
import type { TradeRecord } from '../stats';

const HEIGHT = 400;

/** Cumulative profit line + per-trade profit bars (both in %). */
export function PerformanceChart({ trades }: { trades: TradeRecord[] }) {
  const figure = useMemo(() => {
    const x = trades.map((t) => formatPlotlyLocalDate(t.time));
    const cumulativeProfit: number[] = [];
    for (const trade of trades) {
      const previous = cumulativeProfit.length ? cumulativeProfit[cumulativeProfit.length - 1] : 0;
      cumulativeProfit.push(previous + (trade.profit || 0) * 100);
    }

    const traces: Partial<Data>[] = [
      {
        name: 'Cumulative Profit',
        x,
        y: cumulativeProfit,
        type: 'scatter',
        mode: 'lines',
        fill: 'tozeroy',
        line: { color: CHART_COLORS.up, width: 2 },
        fillcolor: 'rgba(16, 185, 129, 0.2)',
      },
      {
        name: 'Trade Profit',
        x,
        y: trades.map((t) => (t.profit || 0) * 100),
        type: 'bar',
        yaxis: 'y2',
        marker: {
          color: trades.map((t) =>
            (t.profit || 0) >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)',
          ),
        },
      },
    ];

    const layout = baseTimeLayout({
      height: HEIGHT,
      margin: { t: 20, r: 60, l: 60, b: 40 },
      yaxis: {
        title: { text: 'Cumulative Profit (%)' },
        gridcolor: CHART_COLORS.grid,
        side: 'left',
        tickformat: ',.2f',
        showline: true,
        linecolor: CHART_COLORS.grid,
      },
      yaxis2: { title: { text: 'Trade Profit (%)' }, overlaying: 'y', side: 'right', showgrid: false },
    });

    return { traces, layout };
  }, [trades]);

  return (
    <Plot
      data={figure.traces}
      layout={figure.layout}
      className="w-full"
      style={{ height: HEIGHT }}
      config={INTERACTIVE_CONFIG}
    />
  );
}
