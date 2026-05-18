import ReactPlotly from 'react-plotly.js';
import { SelectPair } from './SelectPair';
import { TimeframeSelect } from './TimeframeSelect';
import { formatPlotlyLocalDate } from '../utils/time';

const Plot = (ReactPlotly as any).default || ReactPlotly;

export const DEFAULT_LIVE_CHART_PAIR = 'BTCUSDT';
export const DEFAULT_LIVE_CHART_TIMEFRAME = '1d';

export interface CryptoLiveCandle {
  Time: string | number;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

interface CryptoLiveChartProps {
  candles?: CryptoLiveCandle[];
  currentPrice?: number;
  pair?: string;
  timeframe?: string;
  loading?: boolean;
  error?: string | null;
  onPairChange?: (pair: string) => void;
  onTimeframeChange?: (timeframe: string) => void;
}

function getPriceFractionDigits(price: number) {
  const absPrice = Math.abs(price || 0);

  if (absPrice >= 1 || absPrice === 0) return 2;
  if (absPrice >= 0.01) return 4;
  if (absPrice >= 0.0001) return 6;
  return 8;
}

function formatPriceValue(price: number) {
  const fractionDigits = getPriceFractionDigits(price);

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: price === 0 || Math.abs(price) >= 1 ? 2 : 0,
    maximumFractionDigits: fractionDigits,
  }).format(price || 0);
}

function formatCurrencyPrice(price: number) {
  const fractionDigits = getPriceFractionDigits(price);

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: price === 0 || Math.abs(price) >= 1 ? 2 : 0,
    maximumFractionDigits: fractionDigits,
  }).format(price || 0);
}

function getPriceTickFormat(price: number) {
  return `,.${getPriceFractionDigits(price)}f`;
}

function normalizeCandles(candles: CryptoLiveCandle[]) {
  return candles
    .map(candle => ({
      ...candle,
      Open: Number(candle.Open),
      High: Number(candle.High),
      Low: Number(candle.Low),
      Close: Number(candle.Close),
      Volume: Number(candle.Volume),
    }))
    .filter(candle => (
      Number.isFinite(candle.Open) &&
      Number.isFinite(candle.High) &&
      Number.isFinite(candle.Low) &&
      Number.isFinite(candle.Close) &&
      Number.isFinite(candle.Volume) &&
      !Number.isNaN(new Date(candle.Time).getTime())
    ));
}

export function CryptoLiveChart({
  candles = [],
  currentPrice = 0,
  pair = DEFAULT_LIVE_CHART_PAIR,
  timeframe = DEFAULT_LIVE_CHART_TIMEFRAME,
  loading = false,
  error = null,
  onPairChange = () => {},
  onTimeframeChange = () => {},
}: CryptoLiveChartProps) {
  const displayCandles = normalizeCandles(candles);
  const lastCandlePrice = displayCandles.length > 0 ? displayCandles[displayCandles.length - 1].Close : 0;
  const displayPrice = currentPrice || lastCandlePrice;
  const priceTickFormat = getPriceTickFormat(displayPrice);
  const chartTimes = displayCandles.map(c => formatPlotlyLocalDate(c.Time));

  const priceChartData = {
    x: chartTimes,
    close: displayCandles.map(c => c.Close),
    customdata: displayCandles.map(c => [
      formatPriceValue(c.Open),
      formatPriceValue(c.High),
      formatPriceValue(c.Low),
      formatPriceValue(c.Close),
    ]),
    decreasing: { line: { color: '#ef4444' } },
    high: displayCandles.map(c => c.High),
    increasing: { line: { color: '#22c55e' } },
    line: { color: 'rgba(31,119,180,1)' },
    low: displayCandles.map(c => c.Low),
    open: displayCandles.map(c => c.Open),
    type: 'candlestick',
    xaxis: 'x',
    yaxis: 'y',
    hovertemplate: [
      'Time: %{x|%Y-%m-%d %H:%M:%S}',
      'Open: %{customdata[0]}',
      'High: %{customdata[1]}',
      'Low: %{customdata[2]}',
      'Close: %{customdata[3]}',
      '<extra></extra>'
    ].join('<br>')
  };

  const volumeChartData = {
    x: chartTimes,
    y: displayCandles.map(c => c.Volume),
    type: 'bar',
    name: 'Volume',
    yaxis: 'y2',
    marker: {
      color: displayCandles.map(c => c.Close >= c.Open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)'),
      line: { width: 0 }
    },
    hovertemplate: 'Volume: %{y:,.2f}<extra></extra>'
  };

  return (
    <div className="lg:col-span-2 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm p-4 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">Crypto Live</h2>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <SelectPair
              value={pair}
              onChange={onPairChange}
            />
          </div>
          <div className="w-28">
            <TimeframeSelect
              value={timeframe}
              onChange={onTimeframeChange}
            />
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-[400px]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            {error}
          </div>
        ) : displayCandles.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            No candle data for {pair} ({timeframe})
          </div>
        ) : (
          <Plot
            key={`${pair}-${timeframe}`}
            data={[priceChartData as any, volumeChartData as any]}
            layout={{
              dragmode: 'pan',
              autosize: true,
              margin: { l: 40, r: 80, t: 20, b: 40 },
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              uirevision: pair + timeframe,
              xaxis: {
                type: 'date',
                gridcolor: 'rgba(0,0,0,0.05)',
                rangeslider: { visible: false },
                showspikes: true,
                spikemode: 'across',
                spikesnap: 'cursor',
                spikecolor: '#64748b',
                spikethickness: 1,
                spikedash: 'dot',
                tickformat: '%H:%M %Y-%m-%d',
                hoverformat: '%Y-%m-%d %H:%M:%S'
              },
              yaxis: {
                domain: [0.22, 1],
                gridcolor: 'rgba(0,0,0,0.05)',
                hoverformat: priceTickFormat,
                exponentformat: 'none',
                showexponent: 'none',
                side: 'right',
                tickformat: priceTickFormat
              },
              yaxis2: {
                domain: [0, 0.16],
                gridcolor: 'rgba(0,0,0,0.05)',
                showticklabels: false,
                side: 'right'
              },
              showlegend: false,
              hovermode: 'x unified',
              hoverlabel: {
                bgcolor: '#ffffff',
                font: { color: '#0f172a' },
                bordercolor: '#e2e8f0'
              },
              shapes: [
                {
                  type: 'line',
                  xref: 'paper',
                  x0: 0,
                  x1: 1,
                  yref: 'y',
                  y0: displayPrice,
                  y1: displayPrice,
                  line: {
                    color: '#6366f1',
                    width: 1,
                    dash: 'dot'
                  }
                }
              ],
              annotations: [
                {
                  xref: 'paper',
                  yref: 'y',
                  x: 1,
                  y: displayPrice,
                  xanchor: 'left',
                  yanchor: 'middle',
                  text: formatCurrencyPrice(displayPrice),
                  showarrow: false,
                  font: {
                    color: '#ffffff',
                    size: 11
                  },
                  bgcolor: '#6366f1',
                  borderpad: 4,
                  bordercolor: '#6366f1',
                  borderwidth: 1
                }
              ]
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
            config={{ responsive: true, scrollZoom: true, displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] }}
          />
        )}
      </div>
    </div>
  );
}
