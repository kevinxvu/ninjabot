# Luồng Backtesting — Từ Download đến Chart UI

Tài liệu này mô tả chi tiết toàn bộ pipeline của Ninjabot: từ lúc tải dữ liệu lịch sử về máy cho đến khi chart hiển thị kết quả trên trình duyệt.

---

## Tổng quan (Overview)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         NINJABOT BACKTEST PIPELINE                               │
│                                                                                  │
│  PHASE 1           PHASE 2              PHASE 3            PHASE 4               │
│  Download          Setup                Simulation         UI                    │
│                                                                                  │
│  Binance API  ──►  CSV File  ──►  Bot Engine  ──►  In-memory  ──►  Browser       │
│                                                    Chart data                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Download dữ liệu lịch sử

> **Entry point:** `cmd/ninjabot/ninjabot.go` → `download/download.go`

```
Developer chạy CLI:
ninjabot download --pair BTCUSDT --timeframe 1h --days 30 --output btc.csv
          │
          ▼
┌─────────────────────────────────────────────┐
│  cmd/ninjabot/ninjabot.go                   │
│                                             │
│  Parse CLI flags:                           │
│  - pair      = "BTCUSDT"                    │
│  - timeframe = "1h"                         │
│  - days      = 30  (hoặc --start/--end)     │
│  - output    = "btc.csv"                    │
│  - futures   = false                        │
│                                             │
│  Tạo exchange adapter:                      │
│    exchange.NewBinance()        (spot)       │
│    exchange.NewBinanceFuture()  (futures)    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  download.Downloader.Download()             │
│                                             │
│  1. Tính số candles cần lấy                 │
│     (totalDuration / interval)              │
│                                             │
│  2. Ghi header CSV:                         │
│     time, open, close, low, high, volume    │
│                                             │
│  3. Loop theo batch 500 candles:            │
│     ┌──────────────────────────────┐        │
│     │  Gọi:                        │        │
│     │  exchange.CandlesByPeriod(   │        │
│     │    pair, timeframe,          │        │
│     │    begin, end,               │        │
│     │  )                           │        │
│     │         │                    │        │
│     │         ▼ (Binance REST API) │        │
│     │  Nhận []model.Candle         │        │
│     │         │                    │        │
│     │         ▼                    │        │
│     │  candle.ToSlice() → CSV row  │        │
│     │  writer.Write(row)           │        │
│     └──────────────────────────────┘        │
│                                             │
│  4. Flush → đóng file                       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
          btc.csv  (on disk)
┌───────────────────────────────────┐
│  time,open,close,low,high,volume  │
│  1609459200,29000,29500,...       │
│  1609462800,29500,28900,...       │
│  ...                              │
└───────────────────────────────────┘
```

---

## Phase 2 — Setup môi trường Backtest

> **Entry point:** `examples/backtesting/backtesting.go` → `main()`

```
main()
  │
  ├─1─► Định nghĩa Settings { Pairs: ["BTCUSDT","ETHUSDT"] }
  │
  ├─2─► Khởi tạo Strategy
  │       strategy := new(strategies.CrossEMA)
  │
  ├─3─► exchange.NewCSVFeed(strategy.Timeframe(), pairFeeds...)
  │       │
  │       │  exchange/csvfeed.go
  │       ▼
  │     ┌────────────────────────────────────────────┐
  │     │  Đọc từng file CSV vào memory              │
  │     │  Parse từng dòng → model.Candle            │
  │     │  Resample candles về target timeframe      │
  │     │  Lưu vào:                                  │
  │     │    CandlePairTimeFrame["BTCUSDT"] = []Candle│
  │     └────────────────────────────────────────────┘
  │
  ├─4─► storage.FromMemory()
  │       └─ SQLite in-memory database (lưu orders)
  │
  ├─5─► exchange.NewPaperWallet(ctx, "USDT", opts...)
  │       │
  │       ▼
  │     ┌────────────────────────────────────────────┐
  │     │  Ví giả lập:                               │
  │     │  - assets["USDT"] = 10_000                 │
  │     │  - Gắn CSVFeed làm data source             │
  │     │  - Theo dõi equity, drawdown, position     │
  │     └────────────────────────────────────────────┘
  │
  └─6─► plot.NewChart(opts...)
          │
          ▼
        ┌────────────────────────────────────────────┐
        │  Chart server (chưa start):                │
        │  - port = 8080                             │
        │  - gắn strategy indicators (EMA, SMA)      │
        │  - gắn custom indicators (RSI)             │
        │  - gắn paperWallet (equity tracking)       │
        │  - candles = {} (chưa có data)             │
        └────────────────────────────────────────────┘
```

---

## Phase 3 — Simulation chạy qua toàn bộ dữ liệu

> **Entry point:** `ninjabot.NewBot()` → `bot.Run(ctx)`

```
ninjabot.NewBot(ctx, settings, wallet, strategy, options...)
  │
  │  ninjabot.go
  ▼
┌────────────────────────────────────────────────────────────┐
│  Khởi tạo NinjaBot struct:                                 │
│                                                            │
│  - dataFeed   = exchange.NewDataFeed(wallet/csvFeed)       │
│  - orderFeed  = order.NewOrderFeed()                       │
│  - orderController = order.NewController(...)              │
│                                                            │
│  Xử lý options:                                            │
│  WithBacktest(wallet)    → bot.backtest = true             │
│  WithStorage(storage)    → bot.storage = in-memory DB      │
│  WithCandleSubscription(chart) → chart nhận OnCandle       │
│  WithOrderSubscription(chart)  → chart nhận OnOrder        │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
                      bot.Run(ctx)
                           │
          ┌────────────────┴───────────────────┐
          │  Cho mỗi pair (BTCUSDT, ETHUSDT):  │
          │                                    │
          │  1. Tạo StrategyController(pair)   │
          │  2. Không preload (backtest=true)  │
          │  3. Subscribe: dataFeed → onCandle │
          └────────────────┬───────────────────┘
                           │
                           ▼
              dataFeed.Start(backtest=true)
                           │
                           │  exchange/exchange.go + csvfeed.go
                           ▼
        ┌──────────────────────────────────────────────┐
        │  CSVFeed đẩy TOÀN BỘ candles đã load         │
        │  vào bot.priorityQueueCandle (heap sort)      │
        │                                              │
        │  PriorityQueue đảm bảo thứ tự thời gian:     │
        │  candle(t=1) < candle(t=2) < candle(t=3)...  │
        └──────────────────────────────────────────────┘
                           │
                           ▼
              bot.backtestCandles()   ◄── main loop
                           │
          ┌────────────────▼───────────────────────────┐
          │  Vòng lặp: Pop từng candle theo thứ tự     │
          │                                            │
          │  for candle := priorityQueue.Pop() {       │
          │    ┌──────────────────────────────────┐    │
          │    │  paperWallet.OnCandle(candle)    │    │
          │    │  → cập nhật giá thị trường       │    │
          │    │  → check pending orders          │    │
          │    │  → fill nếu giá khớp             │    │
          │    └──────────┬───────────────────────┘    │
          │               │                            │
          │    ┌──────────▼───────────────────────┐    │
          │    │  strategyController.OnCandle()   │    │
          │    │                                  │    │
          │    │  1. strategy.Indicators(df)      │    │
          │    │     df.Metadata["ema8"] = EMA()  │    │
          │    │     df.Metadata["sma21"] = SMA() │    │
          │    │                                  │    │
          │    │  2. strategy.OnCandle(df, broker)│    │
          │    │     → phân tích signal           │    │
          │    │     → broker.CreateOrderMarket() │    │
          │    └──────────┬───────────────────────┘    │
          │               │                            │
          │    ┌──────────▼───────────────────────┐    │
          │    │  OrderController.OnOrder()        │    │
          │    │  → lưu vào storage (SQLite)       │    │
          │    │  → publish qua OrderFeed          │    │
          │    │         │                         │    │
          │    │    ┌────▼─────────────────────┐   │    │
          │    │    │  chart.OnOrder(order)    │   │    │
          │    │    │  → ghi vào ordersIDsByPair│   │    │
          │    │    └──────────────────────────┘   │    │
          │    └──────────────────────────────────┘    │
          │               │                            │
          │    ┌──────────▼───────────────────────┐    │
          │    │  chart.OnCandle(candle)           │    │
          │    │  (subscriber được gắn ở Phase 2) │    │
          │    │  → append vào chart.candles[]     │    │
          │    │  → append vào chart.dataframe{}  │    │
          │    └──────────────────────────────────┘    │
          │  }  // end loop                            │
          └────────────────────────────────────────────┘
                           │
                           ▼
                      bot.Summary()
                           │
              Print bảng thống kê ra stdout:
              +─────────+────────+─────+──────+
              │  PAIR   │TRADES │ WIN │ LOSS │...
              +─────────+────────+─────+──────+
              │ BTCUSDT │  14   │  6  │  8   │...
              │ ETHUSDT │   9   │  6  │  3   │...
```

---

## Phase 4 — Hiển thị Chart UI trên trình duyệt

> **Entry point:** `chart.Start()` → HTTP server → Browser

```
chart.Start()
  │
  │  plot/chart.go
  ▼
┌──────────────────────────────────────────────────────────────┐
│  Đăng ký HTTP routes:                                        │
│                                                              │
│  GET /               → handleIndex()         (chart.html)   │
│  GET /enhanced       → handleEnhancedIndex() (enhanced.html) │
│  GET /data?pair=...  → handleData()          (JSON API)     │
│  GET /history?pair=. → handleTradingHistoryData() (CSV)     │
│  GET /assets/chart.js→ serve bundled JS (esbuild)           │
│  GET /health         → handleHealth()                       │
│                                                              │
│  http.ListenAndServe(":8080", nil)                           │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
         Browser mở http://localhost:8080
                           │
          ┌────────────────┴──────────────────────────────┐
          │                                               │
          ▼                                               ▼
  GET /  (handleIndex)                      GET /data?pair=BTCUSDT
          │                                               │
          │  Execute chart.html template                  │  handleData()
          │  → render dropdown chọn pair                  │
          │  → load chart.js                              │  Tổng hợp dữ liệu:
          │                                               │  ┌──────────────────────────────┐
          │                                               │  │ candlesByPair(pair)          │
          ▼                                               │  │  → gán orders vào đúng nến   │
    chart.js (bundled)                                    │  │                              │
    → fetch("/data?pair=BTCUSDT")  ──────────────────────►  │ indicatorsByPair(pair)        │
    → nhận JSON response                                  │  │  → chạy lại Indicators()     │
                                                          │  │  → slice bỏ warmup period    │
                                                          │  │                              │
          ◄─────────────────────────────────────────────── │ equityValuesByPair(pair)      │
                                                          │  │  → lấy từ paperWallet        │
    Render bằng Plotly.js / JS nội bộ:                    │  │                              │
    ┌───────────────────────────────┐                     │  │ shapesByPair(pair)           │
    │  [Candlestick chart]          │                     │  │  → vùng StopLoss/Limit       │
    │  [EMA 8 overlay]  (đỏ)        │                     │  │                              │
    │  [SMA21 overlay] (xanh)       │                     │  │ maxDrawdown (từ paperWallet) │
    │  [RSI pane bên dưới] (tím)    │                     │  └──────────────────────────────┘
    │  [▲ BUY / ▼ SELL markers]     │                     │         │
    │  [equity curve]               │                     │         ▼
    │  [drawdown highlight]         │                     │  JSON response:
    └───────────────────────────────┘                     │  {
                                                          │    "candles": [...],
                                                          │    "indicators": [...],
                                                          │    "shapes": [...],
                                                          │    "equity_values": [...],
                                                          │    "asset_values": [...],
                                                          │    "max_drawdown": {...}
                                                          │  }
                                                          └──────────────────────────────┘
```

---

## Sơ đồ dữ liệu end-to-end

```
Binance REST API
      │
      │  HTTP request (batch 500 candles)
      ▼
download.Downloader
      │
      │  csv.Writer
      ▼
btc-1h.csv  (disk)
      │
      │  os.Open + csv.Reader
      ▼
exchange.CSVFeed
  CandlePairTimeFrame["BTCUSDT"] = []model.Candle
      │
      │  DataFeedSubscription.Start()
      ▼
model.PriorityQueue  (heap, sắp xếp theo thời gian)
      │
      │  bot.backtestCandles() — vòng lặp chính
      ▼
model.Candle  (mỗi candle được xử lý tuần tự)
      │
      ├──► exchange.PaperWallet.OnCandle()
      │          → cập nhật giá, fill pending orders
      │          → ghi lại assetValues, equityValues
      │
      ├──► strategy.Controller.OnCandle()
      │          → strategy.Indicators(df)       — tính EMA, SMA...
      │          → strategy.OnCandle(df, broker) — logic mua/bán
      │                    │
      │                    ▼
      │          broker.CreateOrderMarket()
      │                    │
      │                    ▼
      │          order.Controller → storage (SQLite) + orderFeed
      │                                              │
      │                                    chart.OnOrder(order)
      │
      └──► chart.OnCandle(candle)
                 → chart.candles["BTCUSDT"] append
                 → chart.dataframe["BTCUSDT"] append
                 → chart.lastUpdate = now
                           │
                           │  (sau khi bot.Run() kết thúc)
                           ▼
                    chart.Start()
                           │
                    HTTP server :8080
                           │
                    Browser ← GET /data → JSON
                           │
                    Plotly render chart
```

---

## Mapping code ↔ khái niệm

| Khái niệm | File | Hàm/Method chính |
|---|---|---|
| CLI download | [cmd/ninjabot/ninjabot.go](../cmd/ninjabot/ninjabot.go) | `main()` |
| Gọi Binance API lấy nến | [download/download.go](../download/download.go) | `Downloader.Download()` |
| Đọc CSV vào memory | [exchange/csvfeed.go](../exchange/csvfeed.go) | `NewCSVFeed()` |
| Ví giả lập | [exchange/paperwallet.go](../exchange/paperwallet.go) | `NewPaperWallet()`, `OnCandle()` |
| Khởi tạo bot | [ninjabot.go](../ninjabot.go) | `NewBot()` |
| Vòng lặp backtest | [ninjabot.go](../ninjabot.go) | `backtestCandles()` |
| Gọi strategy | [strategy/controller.go](../strategy/controller.go) | `Controller.OnCandle()` |
| Xử lý orders | [order/controller.go](../order/controller.go) | `Controller.OnOrder()` |
| Thu thập data cho chart | [plot/chart.go](../plot/chart.go) | `Chart.OnCandle()`, `Chart.OnOrder()` |
| Tổng hợp JSON cho UI | [plot/chart.go](../plot/chart.go) | `handleData()` |
| HTTP server | [plot/chart.go](../plot/chart.go) | `Chart.Start()` |

---

## Thứ tự gọi hàm trong `main()` (tóm tắt)

```go
// 1. Chuẩn bị dữ liệu nguồn
csvFeed, _  := exchange.NewCSVFeed(timeframe, pairFeeds...)

// 2. Chuẩn bị môi trường giả lập
storage, _  := storage.FromMemory()
wallet      := exchange.NewPaperWallet(ctx, "USDT", exchange.WithPaperAsset("USDT", 10000), ...)

// 3. Chuẩn bị chart (chưa start)
chart, _    := plot.NewChart(plot.WithStrategyIndicators(strategy), ...)

// 4. Khởi tạo và kết nối tất cả
bot, _ := ninjabot.NewBot(ctx, settings, wallet, strategy,
    ninjabot.WithBacktest(wallet),          // bật chế độ backtest
    ninjabot.WithStorage(storage),          // lưu orders vào memory DB
    ninjabot.WithCandleSubscription(chart), // feed nến vào chart
    ninjabot.WithOrderSubscription(chart),  // feed orders vào chart
)

// 5. Chạy simulation (blocking, xử lý hết toàn bộ CSV)
bot.Run(ctx)

// 6. In kết quả ra stdout
bot.Summary()

// 7. Mở HTTP server, chờ browser kết nối
chart.Start() // → http://localhost:8080
```
