const LIMIT_TYPE = "LIMIT";
const MARKET_TYPE = "MARKET";
const STOP_LOSS_TYPE = "STOP_LOSS";
const LIMIT_MAKER_TYPE = "LIMIT_MAKER";

const SELL_SIDE = "SELL";
const BUY_SIDE = "BUY";
const STATUS_FILLED = "FILLED";

let globalData = null;
let showIndicators = true;
let showVolume = true;
let showSubIndicators = false;

function unpack(rows, key) {
  return rows.map((row) => row[key]);
}

function formatNumber(num, decimals = 2) {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(num) {
  const sign = num >= 0 ? "+" : "";
  return `${sign}${formatNumber(num * 100, 2)}%`;
}

function calculateStats(data) {
  const allOrders = [];
  data.candles.forEach((candle) => {
    candle.orders
      .filter((o) => o.status === STATUS_FILLED)
      .forEach((order) => {
        allOrders.push({ ...order, time: candle.time });
      });
  });

  const buyOrders = allOrders.filter((o) => o.side === BUY_SIDE);
  const sellOrders = allOrders.filter((o) => o.side === SELL_SIDE);
  const profitableOrders = allOrders.filter((o) => o.profit && o.profit > 0);
  const losingOrders = allOrders.filter((o) => o.profit && o.profit < 0);

  const totalProfit = allOrders.reduce((sum, o) => sum + (o.profit || 0), 0);
  const totalVolume = allOrders.reduce(
    (sum, o) => sum + o.price * o.quantity,
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

  // Calculate max drawdown
  let maxDrawdown = 0;
  let peak = initialEquity;
  equityValues.forEach((point) => {
    if (point.value > peak) {
      peak = point.value;
    }
    const drawdown = (peak - point.value) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });

  // Calculate Sharpe ratio (simplified)
  const returns = [];
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
  };
}

function renderStats(stats, data) {
  const statsGrid = document.getElementById("stats-grid");
  const quote = data.quote || "USDT";

  const statCards = [
    {
      label: "Total Return",
      value: formatPercent(stats.totalReturn),
      change: `${formatNumber(stats.finalEquity - stats.initialEquity, 2)} ${quote}`,
      positive: stats.totalReturn >= 0,
    },
    {
      label: "Win Rate",
      value: formatPercent(stats.winRate),
      change: `${stats.profitableOrders}W / ${stats.losingOrders}L`,
      positive: stats.winRate >= 0.5,
    },
    {
      label: "Total Trades",
      value: stats.totalTrades.toString(),
      change: `${stats.buyOrders} Buy / ${stats.sellOrders} Sell`,
      positive: null,
    },
    {
      label: "Max Drawdown",
      value: formatPercent(-stats.maxDrawdown),
      change: "Peak to trough",
      positive: stats.maxDrawdown < 0.2,
    },
    {
      label: "Sharpe Ratio",
      value: formatNumber(stats.sharpeRatio, 2),
      change: "Risk-adjusted return",
      positive: stats.sharpeRatio > 1,
    },
    {
      label: "Total Volume",
      value: formatNumber(stats.totalVolume, 0),
      change: quote,
      positive: null,
    },
  ];

  statsGrid.innerHTML = statCards
    .map(
      (stat) => `
        <div class="stat-card">
            <div class="stat-label">${stat.label}</div>
            <div class="stat-value ${stat.positive === true ? "positive" : stat.positive === false ? "negative" : ""}">${stat.value}</div>
            <div class="stat-change ${stat.positive === true ? "positive" : stat.positive === false ? "negative" : "neutral"}">
                ${stat.change}
            </div>
        </div>
    `
    )
    .join("");
}

function renderMainChart(data) {
  const candleStickData = {
    name: "Price",
    x: unpack(data.candles, "time"),
    close: unpack(data.candles, "close"),
    open: unpack(data.candles, "open"),
    low: unpack(data.candles, "low"),
    high: unpack(data.candles, "high"),
    type: "candlestick",
    increasing: { line: { color: "#10b981" } },
    decreasing: { line: { color: "#ef4444" } },
    xaxis: "x",
    yaxis: "y",
  };

  const volumeData = {
    name: "Volume",
    x: unpack(data.candles, "time"),
    y: unpack(data.candles, "volume"),
    type: "bar",
    yaxis: "y2",
    marker: {
      color: data.candles.map((candle) =>
        candle.close >= candle.open
          ? "rgba(16, 185, 129, 0.5)" // green
          : "rgba(239, 68, 68, 0.5)"  // red
      ),
      line: {
        width: 0,
      },
    },
  };


  const points = [];
  const annotations = [];
  data.candles.forEach((candle) => {
    candle.orders
      .filter((o) => o.status === STATUS_FILLED)
      .forEach((order) => {
        const point = {
          time: candle.time,
          position: order.price,
          side: order.side,
        };
        points.push(point);

        const annotation = {
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
        };

        annotations.push(annotation);
      });
  });

  const sellPoints = points.filter((p) => p.side === SELL_SIDE);
  const buyPoints = points.filter((p) => p.side === BUY_SIDE);

  const buyData = {
    name: "Buy",
    x: unpack(buyPoints, "time"),
    y: unpack(buyPoints, "position"),
    mode: "markers",
    type: "scatter",
    marker: {
      color: "#10b981",
      size: 10,
      symbol: "triangle-up",
      line: { color: "#059669", width: 1 },
    },
    hovertemplate: "Buy: %{y}<extra></extra>",
  };

  const sellData = {
    name: "Sell",
    x: unpack(sellPoints, "time"),
    y: unpack(sellPoints, "position"),
    mode: "markers",
    type: "scatter",
    marker: {
      color: "#ef4444",
      size: 10,
      symbol: "triangle-down",
      line: { color: "#dc2626", width: 1 },
    },
    hovertemplate: "Sell: %{y}<extra></extra>",
  };

  const shapes = data.shapes.map((s) => ({
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

  let plotData = [candleStickData, buyData, sellData];

  if (showVolume) {
    plotData.push(volumeData);
  }

  if (showIndicators && data.indicators) {
    data.indicators.forEach((indicator) => {
      if (indicator.overlay) {
        indicator.metrics.forEach((metric) => {
          plotData.push({
            name: `${indicator.name}${metric.name ? " - " + metric.name : ""}`,
            x: metric.time,
            y: metric.value,
            type: metric.style || "scatter",
            mode: "lines",
            line: { color: metric.color, width: 2 },
            hovertemplate: "%{y:.2f}<extra></extra>",
          });
        });
      }
    });
  }

  let standaloneIndicatorsCount = 0;
  if (data.indicators) {
    standaloneIndicatorsCount = data.indicators.filter(ind => !ind.overlay).length;
  }

  let yaxisDomain = [0.2, 1];
  let yaxis2Domain = [0, 0.15];
  let layoutAxes = {};

  if (showSubIndicators && standaloneIndicatorsCount > 0) {
    const totalSubHeight = 0.35;
    const indicatorsHeight = totalSubHeight / standaloneIndicatorsCount;
    
    // Adjust Main and Volume chart to make space for sub-indicators at the bottom
    yaxisDomain = [totalSubHeight + 0.15, 1]; // Main chart 
    yaxis2Domain = [totalSubHeight + 0.02, totalSubHeight + 0.12]; // Volume chart
    
    let standaloneIndicatorIndex = 0;
    
    data.indicators.filter(ind => !ind.overlay).forEach((indicator) => {
      const axisNumber = standaloneIndicatorIndex + 3;
      const heightStart = standaloneIndicatorIndex * indicatorsHeight;
      
      layoutAxes["yaxis" + axisNumber] = {
        title: indicator.name,
        domain: [heightStart, heightStart + indicatorsHeight - 0.02],
        showgrid: true,
        gridcolor: "#2a2f4a",
        side: "right",
        tickformat: ",.2f"
      };

      if (indicator.name.startsWith("RSI")) {
        layoutAxes["yaxis" + axisNumber].range = [0, 100];
        layoutAxes["yaxis" + axisNumber].tickvals = [30, 70];
      }

      indicator.metrics.forEach((metric) => {
        plotData.push({
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
    template: "plotly_dark",
    paper_bgcolor: "#1a1f3a",
    plot_bgcolor: "#1a1f3a",
    font: { family: "Inter, sans-serif", color: "#e4e7eb" },
    dragmode: "zoom",
    margin: { t: 20, b: 40, l: 60, r: 20 },
    showlegend: true,
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "right",
      x: 1,
      bgcolor: "rgba(26, 31, 58, 0.8)",
      bordercolor: "#2a2f4a",
      borderwidth: 1,
    },
    xaxis: {
      rangeslider: { visible: false },
      showgrid: true,
      gridcolor: "#2a2f4a",
      showline: true,
      linecolor: "#2a2f4a",
    },
    yaxis: {
      showgrid: true,
      gridcolor: "#2a2f4a",
      showline: true,
      linecolor: "#2a2f4a",
      side: "left",
      domain: yaxisDomain,
      tickformat: ",.8~f",
    },
    yaxis2: {
      showgrid: false,
      side: "right",
      domain: yaxis2Domain,
      showticklabels: false,
    },
    hovermode: "x unified",
    annotations: annotations,
    shapes: shapes,
  };

  // Merge dynamic layout axes
  Object.assign(layout, layoutAxes);
  
  if (showSubIndicators && standaloneIndicatorsCount > 0) {
    let standaloneIndicatorIndex = 0;
    data.indicators.filter(ind => !ind.overlay).forEach((indicator) => {
      const axisNumber = standaloneIndicatorIndex + 3;
      if (indicator.name.startsWith("RSI")) {
        layout.shapes.push({
          type: "line", xref: "paper", yref: "y" + axisNumber,
          x0: 0, y0: 30, x1: 1, y1: 30,
          line: { color: "rgba(255, 255, 255, 0.3)", width: 1, dash: "dot" }
        });
        layout.shapes.push({
          type: "line", xref: "paper", yref: "y" + axisNumber,
          x0: 0, y0: 70, x1: 1, y1: 70,
          line: { color: "rgba(255, 255, 255, 0.3)", width: 1, dash: "dot" }
        });
      }
      standaloneIndicatorIndex++;
    });
  }

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
  };

  Plotly.newPlot("main-chart", plotData, layout, config);
}

function renderEquityChart(data) {
  const equityData = {
    name: `Equity (${data.quote})`,
    x: unpack(data.equity_values, "time"),
    y: unpack(data.equity_values, "value"),
    type: "scatter",
    mode: "lines",
    fill: "tozeroy",
    line: { color: "#3b82f6", width: 2 },
    fillcolor: "rgba(59, 130, 246, 0.2)",
  };

  const assetData = {
    name: `Position (${data.asset})`,
    x: unpack(data.asset_values, "time"),
    y: unpack(data.asset_values, "value"),
    type: "scatter",
    mode: "lines",
    line: { color: "#8b5cf6", width: 2 },
    yaxis: "y2",
  };

  const shapes = [];
  const annotations = [];

  if (data.max_drawdown) {
    const topPosition = data.equity_values.length > 0 ?
      data.equity_values.reduce((p, v) => (p > v.value ? p : v.value), data.equity_values[0].value) : 0;

    shapes.push({
      type: "rect",
      xref: "x",
      yref: "y",
      x0: data.max_drawdown.start,
      y0: Math.min(...unpack(data.equity_values, "value")) * 0.95,
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
    template: "plotly_dark",
    paper_bgcolor: "#1a1f3a",
    plot_bgcolor: "#1a1f3a",
    font: { family: "Inter, sans-serif", color: "#e4e7eb" },
    margin: { t: 20, b: 40, l: 60, r: 60 },
    showlegend: true,
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "right",
      x: 1,
      bgcolor: "rgba(26, 31, 58, 0.8)",
      bordercolor: "#2a2f4a",
      borderwidth: 1,
    },
    xaxis: {
      showgrid: true,
      gridcolor: "#2a2f4a",
      showline: true,
      linecolor: "#2a2f4a",
    },
    yaxis: {
      title: `Equity (${data.quote})`,
      showgrid: true,
      gridcolor: "#2a2f4a",
      showline: true,
      linecolor: "#2a2f4a",
      side: "left",
      tickformat: ",.8~f",
    },
    yaxis2: {
      title: `Position (${data.asset})`,
      overlaying: "y",
      side: "right",
      showgrid: false,
    },
    hovermode: "x unified",
    shapes: shapes,
    annotations: annotations,
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
  };

  Plotly.newPlot("equity-chart", [equityData, assetData], layout, config);
}

function renderPerformanceChart(data) {
  const allOrders = [];
  data.candles.forEach((candle) => {
    candle.orders
      .filter((o) => o.status === STATUS_FILLED && o.profit !== undefined)
      .forEach((order) => {
        allOrders.push({ ...order, time: candle.time });
      });
  });

  // Cumulative profit over time
  let cumulativeProfit = 0;
  const cumulativeProfits = allOrders.map((order) => {
    cumulativeProfit += order.profit || 0;
    return { time: order.time, profit: cumulativeProfit };
  });

  const cumulativeProfitTrace = {
    name: "Cumulative Profit",
    x: unpack(cumulativeProfits, "time"),
    y: unpack(cumulativeProfits, "profit").map((p) => p * 100),
    type: "scatter",
    mode: "lines",
    fill: "tozeroy",
    line: { color: "#10b981", width: 2 },
    fillcolor: "rgba(16, 185, 129, 0.2)",
  };

  // Individual trade profits
  const tradeProfits = {
    name: "Trade Profit",
    x: unpack(allOrders, "time"),
    y: unpack(allOrders, "profit").map((p) => p * 100),
    type: "bar",
    marker: {
      color: allOrders.map((o) =>
        o.profit >= 0 ? "rgba(16, 185, 129, 0.6)" : "rgba(239, 68, 68, 0.6)"
      ),
    },
    yaxis: "y2",
  };

  const layout = {
    template: "plotly_dark",
    paper_bgcolor: "#1a1f3a",
    plot_bgcolor: "#1a1f3a",
    font: { family: "Inter, sans-serif", color: "#e4e7eb" },
    margin: { t: 20, b: 40, l: 60, r: 60 },
    showlegend: true,
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "right",
      x: 1,
      bgcolor: "rgba(26, 31, 58, 0.8)",
      bordercolor: "#2a2f4a",
      borderwidth: 1,
    },
    xaxis: {
      showgrid: true,
      gridcolor: "#2a2f4a",
      showline: true,
      linecolor: "#2a2f4a",
    },
    yaxis: {
      title: "Cumulative Profit (%)",
      showgrid: true,
      gridcolor: "#2a2f4a",
      showline: true,
      linecolor: "#2a2f4a",
      side: "left",
      tickformat: ",.8~f",
    },
    yaxis2: {
      title: "Trade Profit (%)",
      overlaying: "y",
      side: "right",
      showgrid: false,
    },
    hovermode: "x unified",
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
  };

  Plotly.newPlot(
    "performance-chart",
    [cumulativeProfitTrace, tradeProfits],
    layout,
    config
  );
}

function renderTradeTable(data) {
  const tbody = document.getElementById("trade-table-body");
  const allOrders = [];

  data.candles.forEach((candle) => {
    candle.orders
      .filter((o) => o.status === STATUS_FILLED)
      .forEach((order) => {
        allOrders.push({ ...order, time: candle.time });
      });
  });

  // Show last 50 trades
  const recentOrders = allOrders.slice(-50).reverse();

  tbody.innerHTML = recentOrders
    .map(
      (order) => `
        <tr>
            <td>${new Date(order.time).toLocaleString()}</td>
            <td><span class="badge badge-${order.side.toLowerCase()}">${order.side}</span></td>
            <td>${order.type}</td>
            <td>${formatNumber(order.price, 2)}</td>
            <td>${formatNumber(order.quantity, 6)}</td>
            <td>${formatNumber(order.price * order.quantity, 2)}</td>
            <td>${order.profit !== undefined ? `<span class="badge ${order.profit >= 0 ? "badge-profit" : "badge-loss"}">${formatPercent(order.profit)}</span>` : "-"}</td>
        </tr>
    `
    )
    .join("");
}

function toggleIndicators() {
  showIndicators = !showIndicators;
  if (globalData) {
    renderMainChart(globalData);
  }
}

function toggleVolume() {
  showVolume = !showVolume;
  if (globalData) {
    renderMainChart(globalData);
  }
  
  const volumeBtn = document.querySelector('button[onclick="toggleVolume()"]');
  if (volumeBtn) {
    if (showVolume) {
      volumeBtn.classList.add("active");
    } else {
      volumeBtn.classList.remove("active");
    }
  }
}

function toggleSubIndicators() {
  showSubIndicators = !showSubIndicators;
  if (globalData) {
    renderMainChart(globalData);
  }

  const rsiBtn = document.getElementById('btn-sub-indicators');
  if (rsiBtn) {
    if (showSubIndicators) {
      rsiBtn.classList.add("active");
    } else {
      rsiBtn.classList.remove("active");
    }
  }
}

function resetZoom() {
  if (globalData) {
    renderMainChart(globalData);
    renderEquityChart(globalData);
    renderPerformanceChart(globalData);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const params = new URLSearchParams(window.location.search);
  const pair = params.get("pair") || "";

  fetch("/data?pair=" + pair)
    .then((response) => response.json())
    .then((data) => {
      globalData = data;

      // Hide loading, show content
      document.getElementById("loading").style.display = "none";
      document.getElementById("content").style.display = "block";

      // Calculate and render stats
      const stats = calculateStats(data);
      renderStats(stats, data);

      // Render charts
      renderMainChart(data);
      renderEquityChart(data);
      renderPerformanceChart(data);

      // Render trade table
      renderTradeTable(data);
    })
    .catch((error) => {
      console.error("Error loading data:", error);
      document.getElementById("loading").innerHTML =
        '<div style="color: #ef4444;">Error loading data. Please try again.</div>';
    });
});
