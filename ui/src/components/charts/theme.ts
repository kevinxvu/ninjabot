import type { Layout, Config } from 'plotly.js';

/**
 * Plotly renders to SVG/canvas and cannot resolve CSS variables,
 * so chart colors are concrete values mirroring the design tokens in index.css.
 */
export const CHART_COLORS = {
  up: '#10b981',
  down: '#ef4444',
  upSoft: 'rgba(16, 185, 129, 0.5)',
  downSoft: 'rgba(239, 68, 68, 0.5)',
  brand: '#635bff',
  indigo: '#6366f1',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  orange: '#f97316',
  slate: '#94a3b8',
  muted: '#64748b',
  grid: '#e2e8f0',
  gridSoft: 'rgba(15, 23, 42, 0.05)',
  text: '#0f172a',
  surface: '#ffffff',
};

export const FONT_FAMILY = 'Inter, system-ui, sans-serif';

export const DATE_TICK_FORMAT = '%H:%M<br>%Y-%m-%d';
export const DATE_HOVER_FORMAT = '%Y-%m-%d %H:%M:%S';

/** Common layout for time-series charts. Merge chart-specific options on top. */
export function baseTimeLayout(overrides: Partial<Layout> = {}): Partial<Layout> {
  return {
    autosize: true,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: FONT_FAMILY, color: CHART_COLORS.text },
    dragmode: 'pan',
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: CHART_COLORS.surface,
      font: { color: CHART_COLORS.text },
      bordercolor: CHART_COLORS.grid,
    },
    showlegend: true,
    legend: {
      orientation: 'h',
      yanchor: 'bottom',
      y: 1.02,
      xanchor: 'left',
      x: 0,
      bgcolor: CHART_COLORS.surface,
      bordercolor: CHART_COLORS.grid,
      borderwidth: 1,
    },
    ...overrides,
    xaxis: {
      type: 'date',
      gridcolor: CHART_COLORS.grid,
      showline: true,
      linecolor: CHART_COLORS.grid,
      tickformat: DATE_TICK_FORMAT,
      hoverformat: DATE_HOVER_FORMAT,
      ...overrides.xaxis,
    },
  };
}

export const INTERACTIVE_CONFIG: Partial<Config> = {
  responsive: true,
  scrollZoom: true,
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
};

export const STATIC_CONFIG: Partial<Config> = {
  responsive: true,
  displayModeBar: false,
};
