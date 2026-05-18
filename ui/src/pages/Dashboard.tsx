import { useEffect, useState, useRef } from 'react';
import { Layout } from '../components/Layout';
import api from '../api/client';
import { Activity } from 'lucide-react';
import {
  CryptoLiveChart,
  DEFAULT_LIVE_CHART_PAIR,
  DEFAULT_LIVE_CHART_TIMEFRAME,
} from '../components/CryptoLiveChart';

interface TickerData {
  [pair: string]: number;
}

const DASHBOARD_PAIR_KEY = 'ninjabot.dashboard.mainPair';
const DASHBOARD_TIMEFRAME_KEY = 'ninjabot.dashboard.timeframe';

function getStoredDashboardValue(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function Dashboard() {
  const [tickers, setTickers] = useState<TickerData>({});
  const [candles, setCandles] = useState<any[]>([]);
  const [pairsInfo, setPairsInfo] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [mainPair, setMainPair] = useState(() => getStoredDashboardValue(DASHBOARD_PAIR_KEY, DEFAULT_LIVE_CHART_PAIR));
  const [timeframe, setTimeframe] = useState(() => getStoredDashboardValue(DASHBOARD_TIMEFRAME_KEY, DEFAULT_LIVE_CHART_TIMEFRAME));
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  
  const defaultPairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];

  const wsRef = useRef<WebSocket | null>(null);
  const marketRequestRef = useRef(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_PAIR_KEY, mainPair);
      window.localStorage.setItem(DASHBOARD_TIMEFRAME_KEY, timeframe);
    } catch (e) {
      console.error('Không thể lưu lựa chọn dashboard:', e);
    }
  }, [mainPair, timeframe]);

  useEffect(() => {
    let isMounted = true;
    const requestId = marketRequestRef.current + 1;
    marketRequestRef.current = requestId;
    
    // Gọi API REST lần đầu để tải nến cũ và thông tin pair
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setCandles([]);
        setChartError(null);

        const [tData, cData, iData, pData] = await Promise.allSettled([
          api.get(`/api/market/tickers?pairs=${defaultPairs.join(',')}`),
          api.get(`/api/market/candles?pair=${encodeURIComponent(mainPair)}&timeframe=${encodeURIComponent(timeframe)}`),
          api.get(`/api/pairs?pairs=${defaultPairs.join(',')}`),
          api.get(`/api/market/portfolio`)
        ]);

        if (isMounted && marketRequestRef.current === requestId) {
          if (tData.status === 'fulfilled' && tData.value) {
            setTickers(tData.value as unknown as TickerData);
          }
          if (cData.status === 'fulfilled' && Array.isArray(cData.value) && cData.value.length > 0) {
            setCandles(cData.value);
          } else {
            setCandles([]);
            setChartError(
              cData.status === 'rejected'
                ? `Could not load candle data for ${mainPair} (${timeframe}).`
                : `No candle data for ${mainPair} (${timeframe}).`
            );
          }
          if (iData.status === 'fulfilled' && iData.value) {
            setPairsInfo(iData.value);
          }
          if (pData.status === 'fulfilled' && pData.value) {
            const portData = pData.value as { error?: string, total_value_usdt?: number };
            if (!portData.error && portData.total_value_usdt !== undefined) {
              setPortfolioValue(portData.total_value_usdt);
            }
          }
        }
      } catch (e) {
        console.error('Lỗi khi tải dữ liệu ban đầu:', e);
        if (isMounted && marketRequestRef.current === requestId) {
          setCandles([]);
          setChartError(`Could not load candle data for ${mainPair} (${timeframe}).`);
        }
      } finally {
        if (isMounted && marketRequestRef.current === requestId) setLoading(false);
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
          setChartError(null);
          
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
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
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
            <CryptoLiveChart
              candles={candles}
              currentPrice={tickers[mainPair]}
              pair={mainPair}
              timeframe={timeframe}
              loading={loading}
              error={chartError}
              onPairChange={setMainPair}
              onTimeframeChange={setTimeframe}
            />

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
