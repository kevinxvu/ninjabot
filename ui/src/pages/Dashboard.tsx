import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import ReactPlotly from 'react-plotly.js';
const Plot = (ReactPlotly as any).default || ReactPlotly;
import { Activity } from 'lucide-react';

interface TickerData {
  [pair: string]: number;
}

export function Dashboard() {
  const [tickers, setTickers] = useState<TickerData>({});
  const [candles, setCandles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainPair, setMainPair] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1d');

  useEffect(() => {
    let isMounted = true;
    const fetchTickers = async () => {
      try {
        const res = await fetch('/api/market/tickers?pairs=BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT');
        if (res.ok && isMounted) {
          const data = await res.json();
          setTickers(data);
        }
      } catch (e) {
        console.error('Failed to fetch tickers', e);
      }
    };

    const fetchCandles = async () => {
      try {
        const res = await fetch(`/api/market/candles?pair=${mainPair}&timeframe=${timeframe}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          setCandles(data);
        }
      } catch (e) {
        console.error('Failed to fetch candles', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setLoading(true);
    fetchTickers();
    fetchCandles();
    
    const interval = setInterval(() => {
      fetchTickers();
      fetchCandles();
    }, 10000); // Cập nhật realtime mỗi 10s
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [mainPair, timeframe]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price || 0);
  };

  const chartData = {
    x: candles.map(c => new Date(c.Time).toISOString()),
    close: candles.map(c => c.Close),
    decreasing: { line: { color: '#ef4444' } },
    high: candles.map(c => c.High),
    increasing: { line: { color: '#22c55e' } },
    line: { color: 'rgba(31,119,180,1)' },
    low: candles.map(c => c.Low),
    open: candles.map(c => c.Open),
    type: 'candlestick',
    xaxis: 'x',
    yaxis: 'y'
  };

  return (
    <Layout>
      
      
      
        {/* Top Header */}
        

        {/* Main Content */}
        <div className="flex-1">
          {/* Ticker Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'].map(pair => (
              <div key={pair} className="bg-[var(--bg-primary)] p-5 rounded-xl border border-[var(--border-color)] shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center font-bold text-xs">
                      {pair.replace('USDT', '')}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{pair.replace('USDT', '-USD')}</h3>
                      <p className="text-xs text-[var(--text-tertiary)]">{pair.replace('USDT', '')} USD</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl font-bold">{formatPrice(tickers[pair])}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart Area */}
            <div className="lg:col-span-2 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">Crypto Live</h2>
                <div className="flex gap-2">
                  <select 
                    className="text-sm px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded cursor-pointer font-medium outline-none"
                    value={mainPair}
                    onChange={(e) => setMainPair(e.target.value)}
                  >
                    <option value="BTCUSDT">BTCUSDT</option>
                    <option value="ETHUSDT">ETHUSDT</option>
                    <option value="SOLUSDT">SOLUSDT</option>
                    <option value="BNBUSDT">BNBUSDT</option>
                  </select>
                  <select 
                    className="text-sm px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded cursor-pointer outline-none"
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                  >
                    <option value="1m">1m</option>
                    <option value="15m">15m</option>
                    <option value="1h">1H</option>
                    <option value="4h">4H</option>
                    <option value="1d">1D</option>
                  </select>
                </div>
              </div>
              <div className="flex-1 min-h-[400px]">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="spinner w-8 h-8"></div>
                  </div>
                ) : (
                  <Plot
                    data={[chartData as any]}
                    layout={{
                      autosize: true,
                      margin: { l: 40, r: 40, t: 20, b: 40 },
                      paper_bgcolor: 'transparent',
                      plot_bgcolor: 'transparent',
                      uirevision: mainPair + timeframe,
                      xaxis: {
                        type: 'date',
                        gridcolor: 'rgba(0,0,0,0.05)',
                        rangeslider: { visible: false }
                      },
                      yaxis: {
                        gridcolor: 'rgba(0,0,0,0.05)',
                        side: 'right'
                      },
                      showlegend: false
                    }}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                    config={{ displayModeBar: false }}
                  />
                )}
              </div>
            </div>

            {/* Right Sidebar (Balance / Action) */}
            <div className="space-y-6">
              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <div className="flex items-center gap-4 border-b border-[var(--border-color)] pb-4 mb-4">
                  <button className="flex-1 pb-2 border-b-2 border-[var(--brand-accent)] font-semibold text-sm">Balance</button>
                  <button className="flex-1 pb-2 text-[var(--text-tertiary)] font-medium text-sm">Pending</button>
                </div>
                <div>
                  <h3 className="text-[var(--text-secondary)] text-sm mb-1">Total Balance</h3>
                  <div className="text-3xl font-bold mb-4">$108,458.98</div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button className="btn-primary py-2 text-sm bg-[var(--brand-accent)] hover:bg-[var(--brand-light)]">Deposit</button>
                    <button className="btn-primary py-2 text-sm bg-white text-[var(--text-primary)] border border-[var(--border-color)] shadow-none hover:bg-[var(--bg-secondary)]">Withdraw</button>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <h3 className="font-semibold mb-4">Exchange</h3>
                <div className="space-y-4">
                  <div className="bg-[var(--bg-secondary)] p-3 rounded-lg flex items-center justify-between border border-[var(--border-color)]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-500 flex items-center justify-center font-bold text-xs">B</div>
                      <span className="font-semibold">BTC</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-[var(--text-secondary)]">You Sell</div>
                      <input type="text" className="bg-transparent text-right outline-none w-24 font-semibold" placeholder="0.00" />
                    </div>
                  </div>
                  <div className="flex justify-center -my-2 relative z-10">
                    <div className="w-8 h-8 rounded-full bg-[var(--bg-primary)] border border-[var(--border-color)] flex items-center justify-center shadow-sm">
                      <Activity size={14} />
                    </div>
                  </div>
                  <div className="bg-[var(--bg-secondary)] p-3 rounded-lg flex items-center justify-between border border-[var(--border-color)]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-bold text-xs">U</div>
                      <span className="font-semibold">USDT</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-[var(--text-secondary)]">You Get</div>
                      <input type="text" className="bg-transparent text-right outline-none w-24 font-semibold" placeholder="0.00" />
                    </div>
                  </div>
                  <button className="btn-primary mt-2">Exchange</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
  );
}
