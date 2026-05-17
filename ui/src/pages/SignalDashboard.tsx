import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Activity, Clock, DollarSign, Calendar, PlaySquare, Square } from 'lucide-react';
import ReactPlotly from 'react-plotly.js';
const Plot = (ReactPlotly as any).default || ReactPlotly;
import api from '../api/client';

export function SignalDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  const [showVolume, setShowVolume] = useState(true);

  const fetchSession = async () => {
    try {
      const data: any = await api.get(`/api/realtime-signals/${id}`);
      setSession(data);
      if (data && data.orders) {
        setOrders(data.orders);
      }
      
      if (data && data.pair) {
        // Fetch historical candles for chart context
        // Ensure we load enough candles to cover the session duration, or default to a safe maximum
        const sessionStart = new Date(data.created_at).getTime();
        const now = Date.now();
        const diffMinutes = Math.ceil((now - sessionStart) / (1000 * 60));
        
        let limit = 100; // default minimum
        if (data.timeframe === '1m') {
          limit = Math.max(100, Math.min(diffMinutes + 60, 1000)); // Cap at 1000 to prevent overload
        } else if (data.timeframe === '5m') {
          limit = Math.max(100, Math.min(Math.ceil(diffMinutes/5) + 20, 1000));
        } else if (data.timeframe === '15m') {
          limit = Math.max(100, Math.min(Math.ceil(diffMinutes/15) + 20, 1000));
        } else if (data.timeframe === '1h') {
          limit = Math.max(100, Math.min(Math.ceil(diffMinutes/60) + 10, 1000));
        } else {
          limit = 500;
        }

        const cData: any = await api.get(`/api/market/candles?pair=${data.pair}&timeframe=${data.timeframe}&limit=${limit}`);
        if (cData && Array.isArray(cData)) {
          setCandles(cData);
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
           setCandles(prev => {
             const newCandle = msg.data;
             if (prev.length === 0) return [newCandle];
             
             const last = prev[prev.length - 1];
             if (new Date(last.Time).getTime() === new Date(newCandle.Time).getTime()) {
               const updated = [...prev];
               updated[updated.length - 1] = newCandle;
               return updated;
             }
             return [...prev, newCandle];
           });
        } else if (msg.type === 'ORDER' && msg.session_id === id) {
           setOrders(prev => [msg.data, ...prev]);
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

  // Prepare chart annotations for orders
  const annotations = orders.map(order => {
    const isBuy = order.side === 'BUY';
    return {
      x: new Date(order.created_at || order.Time).toISOString(),
      y: order.price,
      xref: 'x',
      yref: 'y',
      text: isBuy ? 'B' : 'S',
      showarrow: true,
      arrowhead: 2,
      ax: 0,
      ay: isBuy ? 40 : -40,
      font: { color: 'white', size: 10 },
      bgcolor: isBuy ? '#22c55e' : '#ef4444',
      bordercolor: isBuy ? '#16a34a' : '#dc2626',
      arrowcolor: isBuy ? '#22c55e' : '#ef4444'
    };
  });

  // Thêm annotation cho current price
  const lastPrice = currentPrice || (candles.length > 0 ? candles[candles.length - 1].Close : 0);
  if (lastPrice > 0) {
    annotations.push({
      xref: 'paper',
      yref: 'y',
      x: 1,
      y: lastPrice,
      xanchor: 'left',
      yanchor: 'middle',
      text: lastPrice.toFixed(2),
      showarrow: false,
      font: { color: '#ffffff', size: 11 },
      bgcolor: '#6366f1',
      borderpad: 4,
      bordercolor: '#6366f1',
      borderwidth: 1
    } as any);
  }

  const shapes = [];
  if (lastPrice > 0) {
    shapes.push({
      type: 'line',
      xref: 'paper',
      x0: 0,
      x1: 1,
      yref: 'y',
      y0: lastPrice,
      y1: lastPrice,
      line: {
        color: '#6366f1',
        width: 1,
        dash: 'dot'
      }
    });
  }

  const chartData = {
    x: candles.map(c => new Date(c.Time).toISOString()),
    close: candles.map(c => c.Close),
    decreasing: { line: { color: '#ef4444' }, fillcolor: '#ef4444' },
    high: candles.map(c => c.High),
    increasing: { line: { color: '#22c55e' }, fillcolor: '#22c55e' },
    line: { color: 'rgba(31,119,180,1)' },
    low: candles.map(c => c.Low),
    open: candles.map(c => c.Open),
    type: 'candlestick',
    xaxis: 'x',
    yaxis: 'y',
    name: 'Price'
  };

  const volumeData = {
    x: candles.map(c => new Date(c.Time).toISOString()),
    y: candles.map(c => c.Volume),
    type: 'bar',
    name: 'Volume',
    yaxis: 'y2',
    marker: {
      color: candles.map(c => c.Close >= c.Open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'),
      line: { width: 0 }
    }
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
                <span>Started: <span className="font-medium text-[var(--text-primary)]">{new Date(session.created_at).toLocaleString()}</span></span>
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
        <div className="lg:col-span-3 bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)] min-h-[500px] flex flex-col">
          <div className="flex justify-between items-center mb-4 border-b border-[var(--border-color)] pb-2">
            <h2 className="font-bold">Live Chart</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowVolume(!showVolume)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors ${showVolume ? 'bg-[var(--brand-accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'}`}
              >
                Volume
              </button>
            </div>
          </div>
          <div className="flex-1">
            <Plot
              data={showVolume ? [chartData as any, volumeData as any] : [chartData as any]}
              layout={{
                dragmode: 'pan',
                autosize: true,
                margin: { l: 40, r: 80, t: 10, b: 40 },
                paper_bgcolor: 'transparent',
                plot_bgcolor: 'transparent',
                xaxis: { 
                  type: 'date', 
                  rangeslider: { visible: false },
                  gridcolor: 'var(--border-color)',
                },
                yaxis: { 
                  domain: showVolume ? [0.2, 1] : [0, 1],
                  side: 'right',
                  gridcolor: 'var(--border-color)',
                },
                yaxis2: {
                  domain: [0, 0.15],
                  side: 'right',
                  showgrid: false,
                  showticklabels: false,
                },
                annotations: annotations,
                shapes: shapes as any,
                showlegend: false,
                hovermode: "x unified",
                hoverlabel: {
                  bgcolor: "#ffffff",
                  font: { color: "#0f172a" },
                  bordercolor: "#e2e8f0",
                },
              }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%', minHeight: '500px' }}
              config={{ responsive: true, scrollZoom: true, displayModeBar: true, displaylogo: false }}
            />
          </div>
        </div>
        
        <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)] max-h-[600px] overflow-y-auto">
          <h2 className="font-bold border-b border-[var(--border-color)] pb-2 mb-4">Signal History</h2>
          <div className="space-y-3">
            {orders.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] text-center py-4">No signals yet...</p>
            ) : (
              orders.map((o, idx) => (
                <div key={idx} className={`p-3 rounded border text-sm ${o.side === 'BUY' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex justify-between font-bold mb-1">
                    <span className={o.side === 'BUY' ? 'text-green-700' : 'text-red-700'}>{o.side}</span>
                    <span>${o.price?.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Qty: {o.quantity}</span>
                    <span>{new Date(o.created_at || o.Time).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
