import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Activity, Clock, DollarSign, Calendar, PlaySquare, Square } from 'lucide-react';
import ReactPlotly from 'react-plotly.js';
import { PriceChart, type RealtimeCandle } from '../components/PriceChart';
import api from '../api/client';
import { formatClientDateTime, formatClientTime, formatPlotlyLocalDate } from '../utils/time';

const Plot = (ReactPlotly as any).default || ReactPlotly;

function normalizeChartData(chartData: any) {
  if (!chartData?.candles) return chartData;

  return {
    ...chartData,
    candles: chartData.candles.map((candle: any) => ({
      ...candle,
      time: candle.time ?? candle.Time,
      open: candle.open ?? candle.Open,
      high: candle.high ?? candle.High,
      low: candle.low ?? candle.Low,
      close: candle.close ?? candle.Close,
      volume: candle.volume ?? candle.Volume,
    })),
  };
}

export function SignalDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [realtimeCandle, setRealtimeCandle] = useState<RealtimeCandle | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [chartData, setChartData] = useState<any>(null); // State mới lưu toàn bộ JSON từ backend

  const fetchSession = async () => {
    try {
      const data: any = await api.get(`/api/realtime-signals/${id}`);
      setSession(data);
      if (data && data.orders) {
        setOrders(data.orders);
      }

      if (data && data.pair) {
        try {
          const cData: any = await api.get(`/api/realtime-signals/${id}/chart`);
          if (cData) {
            setChartData(cData);
            if (cData.candles) setCandles(cData.candles);
          }
        } catch(err) {
          console.error("Failed to load chart data", err);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch session data on mount
  useEffect(() => {
    fetchSession();
  }, [id]);

  // Setup Websocket connection when session is loaded
  useEffect(() => {
    if (!session || !session.pair) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/market`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        action: 'SUBSCRIBE_CANDLE',
        pair: session.pair,
        timeframe: session.timeframe
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'TICKER' && msg.pair === session.pair) {
          setCurrentPrice(msg.price);
        } else if (msg.type === 'CANDLE' && msg.pair === session.pair) {
           setRealtimeCandle(msg.data);

           // Fetch only when a candle closes so backend-calculated indicators/orders stay authoritative.
           if (msg.data?.complete || msg.data?.Complete) {
             fetchSession();
           }
        } else if (msg.type === 'ORDER' && msg.session_id === id) {
           setOrders(prev => [msg.data, ...prev]);
           fetchSession(); // Update chart shapes for new order
        }
      } catch (e) {
        console.error('Lỗi parse ws message', e);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [session?.pair, session?.timeframe, id]);

  const stopSession = async () => {
    try {
      await api.post(`/api/realtime-signals/${id}/stop`, {});
      fetchSession();
    } catch (e) {
      console.error(e);
    }
  };

  const resumeSession = async () => {
    try {
      setLoading(true);
      await api.post(`/api/realtime-signals/${id}/resume`, {});
      await fetchSession();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  if (loading) return <Layout><div className="p-8">Loading...</div></Layout>;
  if (!session) return <Layout><div className="p-8">Session not found</div></Layout>;

  const priceChartData = normalizeChartData(chartData);
  const signalHistory = [
    ...(session.events || []).map((event: any) => ({
      kind: 'event',
      time: event.created_at,
      event,
    })),
    ...orders.map((order: any) => ({
      kind: 'order',
      time: order.created_at || order.updated_at || order.Time,
      order,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const renderEquityChart = () => {
    if (!chartData || !chartData.asset_values || !chartData.equity_values) return null;

    const hasData = chartData.asset_values.length > 0;
    if (!hasData) return null;

    const dates = (chartData.candles || candles).map((c: any) => formatPlotlyLocalDate(c.time || c.Time));

    const len = Math.min(dates.length, chartData.asset_values.length);
    const matchedDates = dates.slice(0, len);

    const traces = [
      {
        x: matchedDates,
        y: chartData.asset_values.slice(0, len),
        type: 'scatter',
        mode: 'lines',
        name: 'Buy & Hold',
        line: { color: '#94a3b8', width: 2, dash: 'dash' },
      },
      {
        x: matchedDates,
        y: chartData.equity_values.slice(0, len),
        type: 'scatter',
        mode: 'lines',
        name: 'Strategy Equity',
        line: { color: '#8b5cf6', width: 2 },
        fill: 'tozeroy',
        fillcolor: 'rgba(139, 92, 246, 0.1)',
      }
    ];

    return (
      <div className="bg-[var(--bg-primary)] p-5 rounded-xl border border-[var(--border-color)] mt-6">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Portfolio Equity</h2>
        <Plot
          data={traces as any}
          layout={{
            height: 300,
            autosize: true,
            margin: { l: 40, r: 20, t: 10, b: 30 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            xaxis: {
              type: 'date',
              gridcolor: 'var(--border-color)',
              tickformat: "%H:%M\\n%Y-%m-%d",
              hoverformat: "%Y-%m-%d %H:%M:%S"
            },
            yaxis: { gridcolor: 'var(--border-color)' },
            showlegend: true,
            legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1 },
            hovermode: "x unified",
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
          config={{ responsive: true, displayModeBar: false }}
        />
      </div>
    );
  };

  return (
    <Layout>
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{session.pair}</h1>
            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold ${
              session.status === 'running' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
            }`}>
              {session.status === 'running' ? <PlaySquare size={12} /> : <Square size={12} />}
              {session.status.toUpperCase()}
            </span>
          </div>
          
            <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)]">
              <div className="flex items-center gap-1.5">
                <Activity size={14} className="text-indigo-500" />
                <span className="font-medium text-[var(--text-primary)]">{session.strategy}</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-gray-300"></div>
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-orange-500" />
                <span className="font-medium text-[var(--text-primary)]">{session.timeframe}</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-gray-300"></div>
              <div className="flex items-center gap-1.5">
                <DollarSign size={14} className="text-green-500" />
                <span>Initial: <span className="font-medium text-[var(--text-primary)]">{session.initial_amount} {session.initial_asset}</span></span>
              </div>
              <div className="w-1 h-1 rounded-full bg-gray-300"></div>
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-blue-500" />
                <span>Started: <span className="font-medium text-[var(--text-primary)]">{formatClientDateTime(session.created_at)}</span></span>
              </div>
            </div>
            
            {/* Wallet Balances Summary */}
            {session.balances && session.balances.length > 0 && (
              <div className="flex gap-2 mt-3 p-2 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] inline-flex flex-wrap">
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase self-center mr-1">Wallet:</span>
                {session.balances.map((b: any) => (
                   <span key={b.Asset} className="text-xs font-medium bg-[var(--bg-primary)] px-2 py-1 rounded shadow-sm">
                     <span className="text-[var(--text-primary)]">{b.Free.toFixed(4)}</span> <span className="text-[var(--text-secondary)]">{b.Asset}</span>
                   </span>
                ))}
              </div>
            )}
          </div>

        <div className="flex gap-2">
          {session.status === 'running' ? (
             <button onClick={stopSession} className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-100 font-semibold text-sm transition-colors">
               <Square size={16} /> Stop Bot
             </button>
          ) : (
             <button onClick={resumeSession} className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100 font-semibold text-sm transition-colors">
               <PlaySquare size={16} /> Resume Bot
             </button>
          )}
          <button onClick={() => navigate('/realtime-signals')} className="px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg hover:bg-gray-50 font-semibold text-sm transition-colors">
            Back to List
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 min-h-[500px] flex flex-col">
          <PriceChart
            data={priceChartData}
            currentPrice={currentPrice}
            realtimeCandle={realtimeCandle}
            timeframe={session.timeframe}
          />

          {renderEquityChart()}
        </div>

        <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)] max-h-[600px] overflow-y-auto">
          <h2 className="font-bold border-b border-[var(--border-color)] pb-2 mb-4">Signal History</h2>
          <div className="space-y-3">
            {signalHistory.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] text-center py-4">No signals yet...</p>
            ) : (
              signalHistory.map((item, idx) => {
                if (item.kind === 'event') {
                  const event = item.event;
                  const isStop = event.type === 'STOP';
                  const label = event.type === 'RESUME' ? 'RESUME' : event.type;
                  return (
                    <div key={`event-${event.id || idx}`} className={`p-3 rounded border text-sm ${isStop ? 'border-orange-200 bg-orange-50' : 'border-emerald-200 bg-emerald-50'}`}>
                      <div className="flex justify-between font-bold mb-1">
                        <span className={isStop ? 'text-orange-700' : 'text-emerald-700'}>{label}</span>
                        <span className="text-[var(--text-secondary)]">Session</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{isStop ? 'Paused realtime tracking' : event.type === 'RESUME' ? 'Resumed realtime tracking' : 'Started realtime tracking'}</span>
                        <span>{formatClientTime(event.created_at)}</span>
                      </div>
                    </div>
                  );
                }

                const o = item.order;
                return (
                  <div key={`order-${o.id || idx}`} className={`p-3 rounded border text-sm ${o.side === 'BUY' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex justify-between font-bold mb-1">
                      <span className={o.side === 'BUY' ? 'text-green-700' : 'text-red-700'}>{o.side}</span>
                      <span>${o.price?.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Qty: {o.quantity}</span>
                      <span>{formatClientTime(o.created_at || o.Time)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
