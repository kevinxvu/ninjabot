import { useEffect, useState, useRef } from 'react';
import { Layout } from '../components/Layout';
import api from '../api/client';
import ReactPlotly from 'react-plotly.js';
const Plot = (ReactPlotly as any).default || ReactPlotly;
import { Activity } from 'lucide-react';

interface TickerData {
  [pair: string]: number;
}

export function Dashboard() {
  const [tickers, setTickers] = useState<TickerData>({});
  const [candles, setCandles] = useState<any[]>([]);
  const [pairsInfo, setPairsInfo] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [mainPair, setMainPair] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1d');
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  
  const defaultPairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Gọi API REST lần đầu để tải nến cũ và thông tin pair
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        // Using axios
        const [tData, cData, iData, pData] = await Promise.all([
          api.get(`/api/market/tickers?pairs=${defaultPairs.join(',')}`),
          api.get(`/api/market/candles?pair=${mainPair}&timeframe=${timeframe}`),
          api.get(`/api/pairs?pairs=${defaultPairs.join(',')}`),
          api.get(`/api/market/portfolio`)
        ]);

        if (isMounted) {
          if (tData) {
            setTickers(tData as unknown as TickerData);
          }
          if (cData && Array.isArray(cData)) {
            setCandles(cData);
          }
          if (iData) {
            setPairsInfo(iData);
          }
          if (pData) {
            const portData = pData as { error?: string, total_value_usdt?: number };
            if (!portData.error && portData.total_value_usdt !== undefined) {
              setPortfolioValue(portData.total_value_usdt);
            }
          }
        }
      } catch (e) {
        console.error('Lỗi khi tải dữ liệu ban đầu:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInitialData();

    // Thiết lập Websocket cho Realtime
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/market`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WS Đã kết nối, gửi yêu cầu theo dõi Nến');
      ws.send(JSON.stringify({
        action: 'SUBSCRIBE_CANDLE',
        pair: mainPair,
        timeframe: timeframe
      }));
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;
      
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'TICKER') {
          setTickers(prev => ({
            ...prev,
            [msg.pair]: msg.price
          }));
        } 
        else if (msg.type === 'CANDLE' && msg.pair === mainPair) {
          const newCandle = msg.data;
          
          setCandles(prev => {
            if (prev.length === 0) return [newCandle];
            
            const lastCandle = prev[prev.length - 1];
            // Nếu cùng thời gian mở nến -> cập nhật nến hiện tại
            if (new Date(lastCandle.Time).getTime() === new Date(newCandle.Time).getTime()) {
              const updated = [...prev];
              updated[updated.length - 1] = newCandle;
              return updated;
            }
            
            // Nếu đã sang nến mới
            return [...prev, newCandle];
          });
        }
      } catch (e) {
        console.error('Lỗi phân tích WS message:', e);
      }
    };

    ws.onclose = () => console.log('WS Bị ngắt kết nối');
    ws.onerror = (err) => console.error('WS Lỗi:', err);

    return () => {
      isMounted = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
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
            {defaultPairs.map(pair => (
              <div key={pair} className="bg-[var(--bg-primary)] p-5 rounded-xl border border-[var(--border-color)] shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <img 
                      src={pairsInfo[pair]?.Logo || `https://assets.coincap.io/assets/icons/${pair.replace('USDT', '').toLowerCase()}@2x.png`}
                      alt={pair.replace('USDT', '')}
                      className="w-8 h-8 rounded-full bg-white shadow-sm"
                    />
                    <div>
                      <h3 className="font-semibold text-sm">{pair.replace('USDT', '-USD')}</h3>
                      <p className="text-xs text-[var(--text-tertiary)]">{pairsInfo[pair]?.Asset || pair.replace('USDT', '')} USD</p>
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
                      dragmode: 'pan',
                      autosize: true,
                      margin: { l: 40, r: 80, t: 20, b: 40 },
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
                      showlegend: false,
                      shapes: [
                        {
                          type: 'line',
                          xref: 'paper',
                          x0: 0,
                          x1: 1,
                          yref: 'y',
                          y0: tickers[mainPair] || (candles.length > 0 ? candles[candles.length - 1].Close : 0),
                          y1: tickers[mainPair] || (candles.length > 0 ? candles[candles.length - 1].Close : 0),
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
                          y: tickers[mainPair] || (candles.length > 0 ? candles[candles.length - 1].Close : 0),
                          xanchor: 'left',
                          yanchor: 'middle',
                          text: formatPrice(tickers[mainPair] || (candles.length > 0 ? candles[candles.length - 1].Close : 0)),
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

            {/* Right Sidebar (Balance / Action) */}
            <div className="space-y-6">
              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <div className="flex items-center gap-4 border-b border-[var(--border-color)] pb-4 mb-4">
                  <button className="flex-1 pb-2 border-b-2 border-[var(--brand-accent)] font-semibold text-sm">Balance</button>
                </div>
                <div>
                  <h3 className="text-[var(--text-secondary)] text-sm mb-1">My Portfolio</h3>
                  <div className="text-3xl font-bold mb-4">
                    {portfolioValue !== null ? formatPrice(portfolioValue) : formatPrice(0)}
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] shadow-sm p-5">
                <h3 className="font-semibold mb-4">Exchange</h3>
                <div className="space-y-4">
                  <div className="bg-[var(--bg-secondary)] p-3 rounded-lg flex items-center justify-between border border-[var(--border-color)]">
                    <div className="flex items-center gap-2">
                      <img 
                        src={`https://assets.coincap.io/assets/icons/btc@2x.png`}
                        alt="BTC"
                        className="w-8 h-8 rounded-full bg-white shadow-sm"
                      />
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
                      <img 
                        src={`https://assets.coincap.io/assets/icons/usdt@2x.png`}
                        alt="USDT"
                        className="w-8 h-8 rounded-full bg-white shadow-sm"
                      />
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
