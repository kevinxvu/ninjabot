import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import ReactPlotly from 'react-plotly.js';

const Plot = (ReactPlotly as any).default || ReactPlotly;

const STATUS_FILLED = "FILLED";
const BUY_SIDE = "BUY";
const SELL_SIDE = "SELL";

function formatNumber(num: number, decimals = 2) {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}


function formatPctValue(num: number) {
  if (num === undefined || num === null) return "-";
  const sign = num >= 0 ? "+" : "";
  return `${sign}${formatNumber(num, 2)}%`;
}

function colorPct(num: number) {
  if (num === undefined || num === null) return "var(--text-primary)";
  return num >= 0 ? "var(--success-color)" : "var(--error-color)";
}

function formatPercent(num: number) {
  const sign = num >= 0 ? "+" : "";
  return `${sign}${formatNumber(num * 100, 2)}%`;
}

function calculateStats(data: any) {
  if (!data || !data.candles) return null;
  const allOrders: any[] = [];
  data.candles.forEach((candle: any) => {
    candle.orders
      ?.filter((o: any) => o.status === STATUS_FILLED)
      .forEach((order: any) => {
        allOrders.push({ ...order, time: candle.time });
      });
  });

  const buyOrders = allOrders.filter((o: any) => o.side === BUY_SIDE);
  const sellOrders = allOrders.filter((o: any) => o.side === SELL_SIDE);
  const profitableOrders = allOrders.filter((o: any) => o.profit && o.profit > 0);
  const losingOrders = allOrders.filter((o: any) => o.profit && o.profit < 0);

  const totalProfit = allOrders.reduce((sum: number, o: any) => sum + (o.profit || 0), 0);
  const totalVolume = allOrders.reduce(
    (sum: number, o: any) => sum + o.price * o.quantity,
    0
  );

  const winRate =
    profitableOrders.length + losingOrders.length > 0
      ? profitableOrders.length /
        (profitableOrders.length + losingOrders.length)
      : 0;

  const equityValues = data.equity_values || [];
  const initialEquity = equityValues.length > 0 ? equityValues[0].value : 0;
  const finalEquity =
    equityValues.length > 0
      ? equityValues[equityValues.length - 1].value
      : initialEquity;
  const totalReturn =
    initialEquity > 0 ? (finalEquity - initialEquity) / initialEquity : 0;

  let maxDrawdown = 0;
  let peak = initialEquity;
  equityValues.forEach((point: any) => {
    if (point.value > peak) {
      peak = point.value;
    }
    const drawdown = (peak - point.value) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });

  const returns: number[] = [];
  for (let i = 1; i < equityValues.length; i++) {
    const ret =
      (equityValues[i].value - equityValues[i - 1].value) /
      equityValues[i - 1].value;
    returns.push(ret);
  }
  const avgReturn =
    returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;
  const stdDev =
    returns.length > 0
      ? Math.sqrt(
          returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
            returns.length
        )
      : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    totalTrades: allOrders.length,
    buyOrders: buyOrders.length,
    sellOrders: sellOrders.length,
    profitableOrders: profitableOrders.length,
    losingOrders: losingOrders.length,
    winRate: winRate,
    totalProfit: totalProfit,
    totalVolume: totalVolume,
    initialEquity: initialEquity,
    finalEquity: finalEquity,
    totalReturn: totalReturn,
    maxDrawdown: maxDrawdown,
    sharpeRatio: sharpeRatio,
    allOrders
  };
}

export function Chart() {
  const [searchParams] = useSearchParams();
  const currentPair = searchParams.get('pair');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);

  // View controls
  const [showIndicators, setShowIndicators] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showSubIndicators, setShowSubIndicators] = useState(false);
  const [activeSubIndicators, setActiveSubIndicators] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentPair) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dataRes, summaryRes] = await Promise.all([
          fetch(`/data?pair=${currentPair}`),
          fetch('/api/summary')
        ]);

        if (!dataRes.ok) throw new Error('Failed to fetch chart data');

        const chartData = await dataRes.json();
        setData(chartData);

        // Initialize active sub-indicators
        if (chartData.indicators) {
          const initialSet = new Set<string>();
          chartData.indicators.forEach((ind: any) => {
            if (!ind.overlay && ind.name.startsWith("RSI")) {
              initialSet.add(ind.name);
            }
          });
          setActiveSubIndicators(initialSet);
        }

        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          setSummary(summaryData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentPair]);

  const stats = useMemo(() => calculateStats(data), [data]);

  const toggleSubIndicator = (name: string) => {
    setActiveSubIndicators(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (!currentPair) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-primary)]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No trading pair selected</h2>
          <Link to="/" className="text-[var(--brand-color)] hover:underline">Return to Home</Link>
        </div>
      </div>
    );
  }

  const renderStatsGrid = () => {
    if (!stats || !data) return null;
    const quote = data.quote || "USDT";

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title="Portfolio Return"
          value={formatPercent(stats.totalReturn)}
          change={`${formatNumber(stats.finalEquity - stats.initialEquity, 2)} ${quote}`}
          isPositive={stats.totalReturn >= 0}
        />
        <StatCard
          title="Win Rate"
          value={formatPercent(stats.winRate)}
          change={`${stats.profitableOrders}W / ${stats.losingOrders}L`}
          isPositive={stats.winRate >= 0.5}
        />
        <StatCard
          title="Total Trades"
          value={stats.totalTrades.toString()}
          change={`${stats.buyOrders} Buy / ${stats.sellOrders} Sell`}
        />
        <StatCard
          title="Portfolio Max Drawdown"
          value={formatPercent(-stats.maxDrawdown)}
          change="Peak to trough"
          isPositive={stats.maxDrawdown < 0.2}
        />
        <StatCard
          title="Portfolio Sharpe Ratio"
          value={formatNumber(stats.sharpeRatio, 2)}
          change="Risk-adjusted return"
          isPositive={stats.sharpeRatio > 1}
        />
        <StatCard
          title="Total Volume"
          value={formatNumber(stats.totalVolume, 0)}
          change={quote}
        />
      </div>
    );
  };

  const renderMainChart = () => {
    if (!data?.candles?.length) return null;

    const times = data.candles.map((c: any) => c.time);
    
    // Process orders for markers and annotations
    const points: any[] = [];
    const annotations: any[] = [];
    data.candles.forEach((candle: any) => {
      candle.orders
        ?.filter((o: any) => o.status === STATUS_FILLED)
        .forEach((order: any) => {
          points.push({
            time: candle.time,
            position: order.price,
            side: order.side,
          });

          annotations.push({
            x: candle.time,
            y: order.side === SELL_SIDE ? candle.high : candle.low,
            xref: "x",
            yref: "y",
            text: order.side === SELL_SIDE ? "S" : "B",
            hovertext: `${new Date(order.updated_at).toLocaleString()}
                      <br>ID: ${order.id}
                      <br>Price: ${formatNumber(order.price, 2)}
                      <br>Size: ${formatNumber(order.quantity, 4)}
                      <br>Type: ${order.type}${order.profit ? `<br>Profit: ${formatPercent(order.profit)}` : ""}`,
            showarrow: true,
            arrowcolor: order.side === SELL_SIDE ? "#ef4444" : "#10b981",
            valign: order.side === SELL_SIDE ? "top" : "bottom",
            borderpad: 4,
            arrowhead: 2,
            ax: 0,
            ay: order.side === SELL_SIDE ? -20 : 20,
            font: {
              size: 11,
              color: order.side === SELL_SIDE ? "#ef4444" : "#10b981",
              family: "Inter, sans-serif",
            },
          });
        });
    });

    const sellPoints = points.filter((p) => p.side === SELL_SIDE);
    const buyPoints = points.filter((p) => p.side === BUY_SIDE);

    const traces: any[] = [
      {
        x: times,
        close: data.candles.map((c: any) => c.close),
        high: data.candles.map((c: any) => c.high),
        low: data.candles.map((c: any) => c.low),
        open: data.candles.map((c: any) => c.open),
        type: 'candlestick',
        name: 'Price',
        increasing: { line: { color: "#10b981" } },
        decreasing: { line: { color: "#ef4444" } },
        yaxis: 'y'
      },
      {
        name: "Buy",
        x: buyPoints.map((p) => p.time),
        y: buyPoints.map((p) => p.position),
        mode: "markers",
        type: "scatter",
        marker: {
          color: "#10b981",
          size: 10,
          symbol: "triangle-up",
          line: { color: "#059669", width: 1 },
        },
        hovertemplate: "Buy: %{y}<extra></extra>",
      },
      {
        name: "Sell",
        x: sellPoints.map((p) => p.time),
        y: sellPoints.map((p) => p.position),
        mode: "markers",
        type: "scatter",
        marker: {
          color: "#ef4444",
          size: 10,
          symbol: "triangle-down",
          line: { color: "#dc2626", width: 1 },
        },
        hovertemplate: "Sell: %{y}<extra></extra>",
      }
    ];

    if (showVolume) {
      traces.push({
        x: times,
        y: data.candles.map((c: any) => c.volume),
        type: 'bar',
        name: 'Volume',
        yaxis: 'y2',
        marker: {
          color: data.candles.map((c: any) => c.close >= c.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'),
          line: { width: 0 }
        }
      });
    }

    let standaloneIndicatorsCount = 0;
    let renderedStandaloneIndicators: any[] = [];
    const layoutAxes: any = {};

    if (data.indicators) {
      if (showIndicators) {
        data.indicators.filter((i: any) => i.overlay).forEach((indicator: any) => {
          indicator.metrics.forEach((metric: any) => {
            traces.push({
              x: metric.time,
              y: metric.value,
              type: metric.style || 'scatter',
              mode: 'lines',
              name: `${indicator.name} ${metric.name || ""}`,
              line: { color: metric.color || '#3b82f6', width: 2 },
              yaxis: 'y',
              hovertemplate: "%{y:.2f}<extra></extra>"
            });
          });
        });
      }

      if (showSubIndicators) {
        const standaloneIndicators = data.indicators.filter((i: any) => !i.overlay);
        renderedStandaloneIndicators = standaloneIndicators.filter((ind: any) => activeSubIndicators.has(ind.name));
        standaloneIndicatorsCount = renderedStandaloneIndicators.length;
      }
    }

    let chartHeight = 600;
    let yaxisDomain = [0.2, 1];
    let yaxis2Domain = [0, 0.15];
    const shapes: any[] = (data.shapes || []).map((s: any) => ({
      type: "rect",
      xref: "x",
      yref: "y",
      x0: s.x0,
      y0: s.y0,
      x1: s.x1,
      y1: s.y1,
      line: { width: 0 },
      fillcolor: s.color,
      layer: "below",
    }));

    if (showSubIndicators && standaloneIndicatorsCount > 0) {
      const subHeightPx = 150;
      const baseHeightPx = 600;
      chartHeight = baseHeightPx + (standaloneIndicatorsCount * subHeightPx);

      const singleSubRatio = subHeightPx / chartHeight;
      const totalSubHeightRatio = (standaloneIndicatorsCount * subHeightPx) / chartHeight;
      const baseRatio = baseHeightPx / chartHeight;

      yaxisDomain = [totalSubHeightRatio + baseRatio * 0.2, 1];
      yaxis2Domain = [totalSubHeightRatio, totalSubHeightRatio + baseRatio * 0.15];

      let standaloneIndicatorIndex = 0;

      renderedStandaloneIndicators.forEach((indicator) => {
        const axisNumber = standaloneIndicatorIndex + 3;
        const heightEnd = totalSubHeightRatio - standaloneIndicatorIndex * singleSubRatio;
        const heightStart = heightEnd - singleSubRatio;

        layoutAxes["yaxis" + axisNumber] = {
          title: indicator.name,
          domain: [heightStart, heightEnd - 0.02],
          showgrid: true,
          gridcolor: "var(--border-color)",
          side: "left",
          tickformat: ",.2f"
        };

        if (indicator.name.startsWith("RSI") || indicator.name.startsWith("Stoch")) {
          layoutAxes["yaxis" + axisNumber].range = [0, 100];
          layoutAxes["yaxis" + axisNumber].tickvals = [20, 30, 70, 80];
          
          shapes.push({
            type: "line", xref: "paper", yref: "y" + axisNumber,
            x0: 0, y0: 30, x1: 1, y1: 30,
            line: { color: "var(--text-tertiary)", width: 1, dash: "dot" }
          });
          shapes.push({
            type: "line", xref: "paper", yref: "y" + axisNumber,
            x0: 0, y0: 70, x1: 1, y1: 70,
            line: { color: "var(--text-tertiary)", width: 1, dash: "dot" }
          });
        }

        indicator.metrics.forEach((metric: any) => {
          traces.push({
            name: `${indicator.name}${metric.name ? " - " + metric.name : ""}`,
            x: metric.time,
            y: metric.value,
            type: metric.style || "scatter",
            mode: "lines",
            yaxis: "y" + axisNumber,
            line: { color: metric.color || "#8b5cf6", width: 1.5 },
            hovertemplate: "%{y:.2f}<extra></extra>",
          });
        });

        standaloneIndicatorIndex++;
      });
    }

    const layout = {
      height: chartHeight,
      autosize: true,
      margin: { t: 20, r: 20, l: 60, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: "Inter, sans-serif", color: 'var(--text-primary)' },
      dragmode: "pan" as any,
      xaxis: {
        type: 'date' as any,
        gridcolor: 'var(--border-color)',
        rangeslider: { visible: false },
        showline: true,
        linecolor: "var(--border-color)"
      },
      yaxis: {
        domain: yaxisDomain,
        gridcolor: 'var(--border-color)',
        title: { text: 'Price' },
        side: "left" as any,
        tickformat: ",.8~f",
        showline: true,
        linecolor: "var(--border-color)"
      },
      yaxis2: {
        domain: yaxis2Domain,
        gridcolor: 'var(--border-color)',
        showticklabels: false,
        side: "right" as any,
        showgrid: false
      },
      showlegend: true,
      legend: { 
        orientation: 'h' as any, 
        yanchor: "bottom" as any,
        y: 1.02,
        xanchor: "left" as any,
        x: 0,
        bgcolor: "var(--bg-primary)",
        bordercolor: "var(--border-color)",
        borderwidth: 1
      },
      hovermode: "x unified" as any,
      hoverlabel: {
        bgcolor: "var(--bg-primary)",
        font: { color: "var(--text-primary)" },
        bordercolor: "var(--border-color)",
      },
      annotations,
      shapes,
      ...layoutAxes
    };

    return (
      <Plot
        data={traces}
        layout={layout}
        useResizeHandler
        className="w-full"
        style={{ height: chartHeight }}
        config={{ responsive: true, scrollZoom: true, displayModeBar: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] }}
      />
    );
  };

  const renderEquityChart = () => {
    if (!data?.equity_values?.length) return null;

    const equityData = {
      name: `Equity (${data.quote || 'USDT'})`,
      x: data.equity_values.map((v: any) => v.time),
      y: data.equity_values.map((v: any) => v.value),
      type: "scatter",
      mode: "lines",
      fill: "tozeroy",
      line: { color: "#3b82f6", width: 2 },
      fillcolor: "rgba(59, 130, 246, 0.2)",
    };
  
    const assetData = {
      name: `Position (${data.asset || 'ASSET'})`,
      x: (data.asset_values || []).map((v: any) => v.time),
      y: (data.asset_values || []).map((v: any) => v.value),
      type: "scatter",
      mode: "lines",
      line: { color: "#8b5cf6", width: 2 },
      yaxis: "y2",
    };

    const shapes: any[] = [];
    const annotations: any[] = [];
  
    if (data.max_drawdown) {
      const topPosition = data.equity_values.length > 0 ?
        data.equity_values.reduce((p: number, v: any) => (p > v.value ? p : v.value), data.equity_values[0].value) : 0;
  
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "y",
        x0: data.max_drawdown.start,
        y0: Math.min(...data.equity_values.map((v: any) => v.value)) * 0.95,
        x1: data.max_drawdown.end,
        y1: topPosition,
        line: { width: 0 },
        fillcolor: "rgba(239, 68, 68, 0.15)",
        layer: "below"
      });
  
      const annotationPosition = new Date(
        (new Date(data.max_drawdown.start).getTime() +
          new Date(data.max_drawdown.end).getTime()) /
          2
      );
  
      annotations.push({
        x: annotationPosition,
        y: topPosition - (topPosition * 0.05),
        xref: "x",
        yref: "y",
        text: `Drawdown<br>${data.max_drawdown.value}%`,
        showarrow: false,
        font: {
          size: 11,
          color: "#ef4444",
          family: "Inter, sans-serif"
        }
      });
    }

    const layout = {
      height: 300,
      autosize: true,
      margin: { t: 20, r: 60, l: 60, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: "Inter, sans-serif", color: 'var(--text-primary)' },
      dragmode: "pan" as any,
      xaxis: {
        type: 'date' as any,
        gridcolor: 'var(--border-color)',
        showline: true,
        linecolor: "var(--border-color)"
      },
      yaxis: {
        title: `Equity (${data.quote || 'USDT'})`,
        gridcolor: 'var(--border-color)',
        side: "left" as any,
        tickformat: ",.8~f",
        showline: true,
        linecolor: "var(--border-color)"
      },
      yaxis2: {
        title: `Position (${data.asset || 'ASSET'})`,
        overlaying: "y" as any,
        side: "right" as any,
        showgrid: false
      },
      showlegend: true,
      legend: { 
        orientation: 'h' as any, 
        yanchor: "bottom" as any,
        y: 1.02,
        xanchor: "left" as any,
        x: 0,
        bgcolor: "var(--bg-primary)",
        bordercolor: "var(--border-color)",
        borderwidth: 1
      },
      hovermode: "x unified" as any,
      hoverlabel: {
        bgcolor: "var(--bg-primary)",
        font: { color: "var(--text-primary)" },
        bordercolor: "var(--border-color)",
      },
      shapes,
      annotations
    };

    return (
      <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
        <h2 className="text-lg font-bold mb-4">Portfolio Equity & Position</h2>
        <Plot
          data={[equityData, assetData]}
          layout={layout}
          useResizeHandler
          className="w-full h-[300px]"
          config={{ responsive: true, scrollZoom: true, displayModeBar: true, displaylogo: false }}
        />
      </div>
    );
  };

  const renderPerformanceChart = () => {
    if (!stats || !stats.allOrders.length) return null;

    let cumulativeProfit = 0;
    const cumulativeProfits = stats.allOrders.map((order: any) => {
      cumulativeProfit += order.profit || 0;
      return { time: order.time, profit: cumulativeProfit };
    });

    const cumulativeProfitTrace = {
      name: "Cumulative Profit",
      x: cumulativeProfits.map(p => p.time),
      y: cumulativeProfits.map(p => p.profit * 100),
      type: "scatter",
      mode: "lines",
      fill: "tozeroy",
      line: { color: "#10b981", width: 2 },
      fillcolor: "rgba(16, 185, 129, 0.2)",
    };

    const tradeProfits = {
      name: "Trade Profit",
      x: stats.allOrders.map((o: any) => o.time),
      y: stats.allOrders.map((o: any) => (o.profit || 0) * 100),
      type: "bar",
      marker: {
        color: stats.allOrders.map((o: any) =>
          (o.profit || 0) >= 0 ? "rgba(16, 185, 129, 0.6)" : "rgba(239, 68, 68, 0.6)"
        ),
      },
      yaxis: "y2",
    };

    const layout = {
      height: 400,
      autosize: true,
      margin: { t: 20, r: 60, l: 60, b: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: "Inter, sans-serif", color: 'var(--text-primary)' },
      dragmode: "pan" as any,
      xaxis: {
        type: 'date' as any,
        gridcolor: 'var(--border-color)',
        showline: true,
        linecolor: "var(--border-color)"
      },
      yaxis: {
        title: "Cumulative Profit (%)",
        gridcolor: 'var(--border-color)',
        side: "left" as any,
        tickformat: ",.2f",
        showline: true,
        linecolor: "var(--border-color)"
      },
      yaxis2: {
        title: "Trade Profit (%)",
        overlaying: "y" as any,
        side: "right" as any,
        showgrid: false
      },
      showlegend: true,
      legend: { 
        orientation: 'h' as any, 
        yanchor: "bottom" as any,
        y: 1.02,
        xanchor: "left" as any,
        x: 0,
        bgcolor: "var(--bg-primary)",
        bordercolor: "var(--border-color)",
        borderwidth: 1
      },
      hovermode: "x unified" as any,
      hoverlabel: {
        bgcolor: "var(--bg-primary)",
        font: { color: "var(--text-primary)" },
        bordercolor: "var(--border-color)",
      },
    };

    return (
      <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
        <h2 className="text-lg font-bold mb-4">Performance Analysis</h2>
        <Plot
          data={[cumulativeProfitTrace, tradeProfits]}
          layout={layout}
          useResizeHandler
          className="w-full h-[400px]"
          config={{ responsive: true, scrollZoom: true, displayModeBar: true, displaylogo: false }}
        />
      </div>
    );
  };

  const renderTradeTable = () => {
    if (!stats || !stats.allOrders.length) return null;
    const recentOrders = stats.allOrders.slice(-50).reverse();

    return (
      <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm overflow-x-auto">
        <h2 className="text-lg font-bold mb-4">Recent Trades</h2>
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-[var(--text-secondary)] uppercase bg-[var(--bg-secondary)]">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Side</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Profit</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((order: any, idx: number) => (
              <tr key={idx} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                <td className="px-4 py-3">{new Date(order.time).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    order.side === BUY_SIDE ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
                  }`}>
                    {order.side}
                  </span>
                </td>
                <td className="px-4 py-3">{order.type}</td>
                <td className="px-4 py-3">{formatNumber(order.price, 2)}</td>
                <td className="px-4 py-3">{formatNumber(order.quantity, 6)}</td>
                <td className="px-4 py-3">{formatNumber(order.price * order.quantity, 2)}</td>
                <td className="px-4 py-3">
                  {order.profit !== undefined ? (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      order.profit >= 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'
                    }`}>
                      {formatPercent(order.profit)}
                    </span>
                  ) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };


  const renderBacktestSummary = () => {
    if (!summary || !summary.pairs) return null;

    const isDCA = summary.strategy_info?.toLowerCase().includes('dca');
    const grossColor = colorPct(summary.gross_profit_pct);
    const ddColor = summary.max_drawdown_pct <= 0 ? 'var(--error-color)' : 'var(--success-color)';

    return (
      <div className="bg-[var(--bg-primary)] p-6 rounded-xl border border-[var(--border-color)] shadow-sm mt-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-bold m-0 flex items-center gap-2">📊 Backtest Summary</h2>
          {summary.strategy_info && (
            <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md px-3 py-1 font-mono">
              {summary.strategy_info}
            </span>
          )}
        </div>

        {/* Top-level KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
          <KPICard label="Initial Capital" value={`${formatNumber(summary.initial_capital)} ${summary.base_coin || 'USDT'}`} />
          <KPICard 
            label="Final Portfolio" 
            value={`${formatNumber(summary.final_portfolio)} ${summary.base_coin || 'USDT'}`}
            sub={`${formatPctValue(summary.gross_profit_pct)} gross return`}
            valueColor={grossColor}
          />
          <KPICard label="Gross Profit" value={`${formatNumber(summary.gross_profit)} ${summary.base_coin || 'USDT'}`} valueColor={grossColor} />
          <KPICard 
            label="Win Rate" 
            value={`${formatNumber(summary.win_rate, 1)}%`}
            sub={`${summary.total_wins} W / ${summary.total_losses} L / ${summary.total_trades} trades`}
            valueColor={summary.win_rate >= 50 ? 'var(--success-color)' : 'var(--error-color)'}
          />
          <KPICard label="Avg Payoff" value={formatNumber(summary.avg_payoff, 3)} sub="avg win / avg loss ratio" />
          <KPICard label="Profit Factor" value={formatNumber(summary.avg_profit_factor, 3)} sub="gross win / gross loss" />
          <KPICard label="SQN" value={formatNumber(summary.avg_sqn, 1)} sub="System Quality Number" />
          <KPICard label="Max Drawdown" value={`${formatNumber(summary.max_drawdown_pct, 2)}%`} valueColor={ddColor} />
          <KPICard label="Total Volume" value={`${formatNumber(summary.total_volume)} ${summary.base_coin || 'USDT'}`} />
        </div>

        {/* Per-Pair Performance */}
        <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-4 mb-6 overflow-x-auto">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-purple)] mb-4">Per-Pair Performance</h4>
          <table className="w-full text-xs text-right border-collapse">
            <thead>
              <tr>
                <th className="text-left font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Pair</th>
                <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Trades</th>
                {isDCA ? (
                  <>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Avg Price</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Realized Profit</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Volume</th>
                  </>
                ) : (
                  <>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Win</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Loss</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">% Win</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Payoff</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Pr.Fact</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">SQN</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Profit</th>
                    <th className="font-semibold uppercase text-[var(--text-secondary)] pb-2 border-b border-[var(--border-color)]">Volume</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {summary.pairs.map((p: any) => (
                <tr key={p.pair}>
                  <td className="text-left font-semibold text-[var(--brand-color)] py-2 border-b border-[var(--border-color)]">{p.pair}</td>
                  <td className="py-2 border-b border-[var(--border-color)] tabular-nums">{p.trades}</td>
                  {isDCA ? (
                    <>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums">{formatNumber(p.avg_entry_price, 4)}</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums" style={{ color: colorPct(p.profit) }}>{formatNumber(p.profit)}</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums">{formatNumber(p.volume)}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums text-[var(--success-color)]">{p.win}</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums text-[var(--error-color)]">{p.loss}</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums" style={{ color: p.win_pct >= 50 ? 'var(--success-color)' : 'var(--error-color)' }}>{formatNumber(p.win_pct, 1)}%</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums">{formatNumber(p.payoff, 3)}</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums">{formatNumber(p.profit_factor, 3)}</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums">{formatNumber(p.sqn, 1)}</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums" style={{ color: colorPct(p.profit) }}>{formatNumber(p.profit)}</td>
                      <td className="py-2 border-b border-[var(--border-color)] tabular-nums">{formatNumber(p.volume)}</td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="bg-[var(--bg-tertiary)] font-semibold text-[var(--text-primary)]">
                <td className="text-left py-2">TOTAL</td>
                <td className="py-2 tabular-nums">{summary.total_trades}</td>
                {isDCA ? (
                  <>
                    <td className="py-2">-</td>
                    <td className="py-2 tabular-nums" style={{ color: colorPct(summary.total_profit) }}>{formatNumber(summary.total_profit)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(summary.total_volume)}</td>
                  </>
                ) : (
                  <>
                    <td className="py-2 tabular-nums text-[var(--success-color)]">{summary.total_wins}</td>
                    <td className="py-2 tabular-nums text-[var(--error-color)]">{summary.total_losses}</td>
                    <td className="py-2 tabular-nums" style={{ color: summary.win_rate >= 50 ? 'var(--success-color)' : 'var(--error-color)' }}>{formatNumber(summary.win_rate, 1)}%</td>
                    <td className="py-2 tabular-nums">{formatNumber(summary.avg_payoff, 3)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(summary.avg_profit_factor, 3)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(summary.avg_sqn, 1)}</td>
                    <td className="py-2 tabular-nums" style={{ color: colorPct(summary.total_profit) }}>{formatNumber(summary.total_profit)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(summary.total_volume)}</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Two-column row: Confidence Intervals + Return Histogram */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-purple)] mb-4">Confidence Intervals (95%)</h4>
            <div className="flex flex-col gap-2">
              {summary.pairs.map((p: any) => (
                <div key={p.pair} className="mb-2">
                  <div className="text-xs font-bold text-[var(--brand-color)] mt-2 mb-1">{p.pair}</div>
                  {[
                    { name: 'Return', mean: `${formatNumber(p.ci_return_mean, 2)}%`, range: `${formatNumber(p.ci_return_lower, 2)}% ~ ${formatNumber(p.ci_return_upper, 2)}%` },
                    { name: 'Payoff', mean: formatNumber(p.ci_payoff_mean, 2), range: `${formatNumber(p.ci_payoff_lower, 2)} ~ ${formatNumber(p.ci_payoff_upper, 2)}` },
                    { name: 'Prof.Factor', mean: formatNumber(p.ci_pf_mean, 2), range: `${formatNumber(p.ci_pf_lower, 2)} ~ ${formatNumber(p.ci_pf_upper, 2)}` },
                  ].map(row => (
                    <div key={row.name} className="flex justify-between items-center text-xs mb-1">
                      <span className="text-[var(--text-secondary)] uppercase tracking-wider w-24">{row.name}</span>
                      <span className="font-semibold tabular-nums">{row.mean}</span>
                      <span className="text-[var(--text-secondary)] w-32 text-right">({row.range})</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-purple)] mb-4">Return Distribution (%)</h4>
            {summary.return_buckets && summary.return_buckets.length ? (
              <div className="flex flex-col">
                {(() => {
                  const maxPct = Math.max(...summary.return_buckets.map((b: any) => b.pct));
                  return summary.return_buckets.map((b: any, idx: number) => {
                    const widthPct = maxPct > 0 ? (b.pct / maxPct * 100) : 0;
                    let barColor = b.from < 0 ? 'var(--error-color)' : 'var(--success-color)';
                    if (b.from < 0 && b.to > 0) barColor = 'var(--accent-yellow)';
                    
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs mb-1.5 tabular-nums">
                        <span className="text-[var(--text-secondary)] w-24 text-right flex-shrink-0">{b.label}</span>
                        <div className="flex-1 bg-[var(--bg-tertiary)] rounded-sm h-3 overflow-hidden">
                          <div className="h-full rounded-sm" style={{ width: `${widthPct}%`, background: barColor }}></div>
                        </div>
                        <span className="w-10 text-right flex-shrink-0" style={{ color: barColor }}>{formatNumber(b.pct, 1)}%</span>
                        <span className="w-8 text-right text-[var(--text-secondary)] flex-shrink-0">({b.count})</span>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <p className="text-[var(--text-secondary)] text-sm">Not enough data.</p>
            )}
          </div>
        </div>

        {/* Final Wallet + Risk & Volume */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-purple)] mb-4">Final Wallet</h4>
            {summary.final_assets?.map((a: any) => (
              <div key={a.asset} className="flex justify-between py-2 text-sm border-b border-[var(--border-color)]">
                <span className="font-semibold text-[var(--brand-color)]">{a.asset}</span>
                <span className="tabular-nums">{formatNumber(a.value_usdt)} USDT</span>
              </div>
            ))}
            <div className="flex justify-between py-2 text-sm border-b border-[var(--border-color)]">
              <span className="font-semibold text-[var(--brand-color)]">{summary.base_coin || 'USDT'}</span>
              <span className="tabular-nums">{formatNumber(summary.base_balance)} USDT</span>
            </div>
            <div className="flex justify-between py-2 mt-2 text-sm border-t border-[var(--border-color)] font-bold">
              <span>Total Portfolio</span>
              <span className="tabular-nums" style={{ color: grossColor }}>{formatNumber(summary.final_portfolio)} USDT</span>
            </div>
          </div>

          <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-purple)] mb-4">Risk & Returns</h4>
            {[
              { label: 'Start Portfolio', value: `${formatNumber(summary.initial_capital)} USDT` },
              { label: 'Final Portfolio', value: `${formatNumber(summary.final_portfolio)} USDT` },
              { label: 'Gross Profit', value: `${formatNumber(summary.gross_profit)} USDT (${formatPctValue(summary.gross_profit_pct)})`, color: grossColor },
              { label: 'Max Drawdown', value: `${formatNumber(summary.max_drawdown_pct, 2)}%`, color: 'var(--error-color)' },
              { label: 'Total Volume', value: `${formatNumber(summary.total_volume)} USDT` },
            ].map(row => (
              <div key={row.label} className="flex justify-between py-2 text-sm border-b border-[var(--border-color)] last:border-b-0">
                <span className="text-[var(--text-secondary)]">{row.label}</span>
                <span className="font-semibold tabular-nums" style={{ color: row.color || 'inherit' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] text-[var(--text-primary)]">
      <header className="bg-[var(--bg-primary)] border-b border-[var(--border-color)] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="text-xl font-bold flex items-center gap-2">
          TradingBot
        </Link>

        <div className="flex gap-2">
          {summary?.pairs?.map((p: any) => (
            <Link
              key={p.pair || p}
              to={`/chart?pair=${p.pair || p}`}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                (p.pair || p) === currentPair
                  ? 'bg-[var(--brand-color)] text-white'
                  : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)]'
              }`}
            >
              {p.pair || p}
            </Link>
          ))}
        </div>

        <a
          href={`/history?pair=${currentPair}`}
          className="px-4 py-2 bg-[var(--bg-tertiary)] rounded-md font-medium hover:bg-[var(--bg-secondary)] transition-colors flex items-center gap-2"
        >
          📊 Export History
        </a>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="spinner"></div>
            <p className="text-[var(--text-secondary)]">Loading trading data...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-[var(--error-bg)] text-[var(--error-color)] rounded-lg text-center">
            {error}
          </div>
        ) : (
          <>
            {renderStatsGrid()}

            {/* Main Chart */}
            <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">Price Action & Orders</h2>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setShowIndicators(!showIndicators)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${showIndicators ? 'bg-[var(--brand-color)] text-white' : 'bg-[var(--bg-tertiary)]'}`}
                  >
                    Indicators
                  </button>
                  <button
                    onClick={() => setShowVolume(!showVolume)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${showVolume ? 'bg-[var(--brand-color)] text-white' : 'bg-[var(--bg-tertiary)]'}`}
                  >
                    Volume
                  </button>
                  <button
                    onClick={() => setShowSubIndicators(!showSubIndicators)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${showSubIndicators ? 'bg-[var(--brand-color)] text-white' : 'bg-[var(--bg-tertiary)]'}`}
                  >
                    Sub-Indicators
                  </button>
                </div>
              </div>
              
              {showSubIndicators && data?.indicators?.filter((i: any) => !i.overlay).length > 0 && (
                <div className="flex gap-2 mb-4 justify-end flex-wrap">
                  {data.indicators.filter((i: any) => !i.overlay).map((ind: any) => (
                    <button
                      key={ind.name}
                      onClick={() => toggleSubIndicator(ind.name)}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${activeSubIndicators.has(ind.name) ? 'bg-[var(--brand-color)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-white'}`}
                    >
                      {ind.name}
                    </button>
                  ))}
                </div>
              )}
              
              {renderMainChart()}
            </div>

            {renderEquityChart()}
            {renderPerformanceChart()}
            {renderTradeTable()}
            {renderBacktestSummary()}
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, change, isPositive }: { title: string, value: string | number, change?: string, isPositive?: boolean }) {
  return (
    <div className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
      <h3 className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider mb-2">{title}</h3>
      <p className={`text-2xl font-bold ${isPositive !== undefined ? (isPositive ? 'text-[var(--success-color)]' : 'text-[var(--error-color)]') : ''}`}>
        {value}
      </p>
      {change && (
        <div className="text-sm mt-1 text-[var(--text-secondary)]">
          {change}
        </div>
      )}
    </div>
  );
}


function KPICard({ label, value, sub, valueColor }: { label: string, value: React.ReactNode, sub?: React.ReactNode, valueColor?: string }) {
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">{label}</div>
      <div className="text-2xl font-bold leading-tight" style={{ color: valueColor || 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-xs text-[var(--text-secondary)] mt-1">{sub}</div>}
    </div>
  );
}
