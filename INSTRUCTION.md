# Ninjabot — Developer Onboarding Guide

> A fast cryptocurrency trading bot **framework** written in Go. The Ninjabot framework lets you build, backtest, and deploy custom trading strategies for Binance spot and futures markets.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Setup & Running](#setup--running)
- [Core Concepts & App Flow](#core-concepts--app-flow)
- [Writing Your First Strategy](#writing-your-first-strategy)
- [Running Examples](#running-examples)
- [Web Backtest UI](#web-backtest-ui)
- [Chart API Extensions](#chart-api-extensions)
- [Testing](#testing)
- [Coding Conventions](#coding-conventions)
- [Git Workflow](#git-workflow)

---

## Project Overview

**Ninjabot** is a Go framework — not a standalone binary service — that you import into your own Go program to build automated trading bots. It provides:

- A clean **Strategy interface** (`OnCandle`, `Indicators`, etc.) that you implement
- **Exchange adapters** for Binance (spot & futures) and a local CSV feed for backtesting
- A **PaperWallet** for live simulation without real money
- A **Backtesting engine** that replays historical candlestick data through your strategy
- A **Chart/plot** system to visualize indicators and trade results
- A **Web App** (`ninjabot`) providing a UI (TradingBot) to configure and run backtests interactively.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Go 1.23+ |
| Exchange API | [`go-binance/v2`](https://github.com/adshao/go-binance) |
| Technical Analysis | [`go-talib`](https://github.com/markcheno/go-talib) |
| Embedded Database | [`buntdb`](https://github.com/tidwall/buntdb) |
| SQL / ORM | [`gorm`](https://gorm.io) + SQLite (`glebarez/sqlite`) |
| Logging | [`logrus`](https://github.com/sirupsen/logrus) |
| Telegram Notifications | [`telebot.v2`](https://github.com/tucnak/telebot) |
| Charting | Internal `plot` package + `ui` package (HTML/JS/CSS, uses `go:embed`) |
| Mocking | [`mockery/v2`](https://github.com/vektra/mockery) |
| Testing | [`testify`](https://github.com/stretchr/testify) |

---

## Prerequisites

Install the following tools before setting up the project:

- **Go 1.23+** — [https://go.dev/dl/](https://go.dev/dl/)
- **Git** — [https://git-scm.com/](https://git-scm.com/)
- **Make** (optional, but recommended for shortcut commands)
- **golangci-lint** (optional, required for `make lint`) — [https://golangci-lint.run/usage/install/](https://golangci-lint.run/usage/install/)

Verify your Go installation:

```bash
go version
# Expected: go version go1.23.x or higher
```

---

## Project Structure

```
ninjabot/
├── cmd/
│   ├── main.go            # Web UI entry point
│   ├── server.go          # HTTP server for Web UI backtesting
│   ├── summary.go         # Summary and KPIs calculation for backtesting
│   └── types.go           # HTTP request/response types
├── download/              # Downloader logic used by the Web UI
├── examples/
│   ├── backtesting/       # Example: run strategy on historical CSV data
│   ├── futuremarket/      # Example: deploy bot on Binance Futures
│   ├── paperwallet/       # Example: live simulation (no real money)
│   └── spotmarket/        # Example: deploy bot on Binance Spot
├── exchange/
│   ├── binance.go         # Binance spot adapter
│   ├── binance_future.go  # Binance futures adapter
│   ├── csvfeed.go         # CSV-backed data feed for backtesting
│   ├── paperwallet.go     # Simulated wallet for paper trading
│   └── exchange.go        # Shared exchange utilities (pair splitting, data feed)
├── indicator/             # Technical indicator wrappers (EMA, SMA, Supertrend, etc.)
├── model/                 # Core data models: Candle, Order, Dataframe, Series, Settings
├── notification/          # Notification adapters (Telegram, Email)
├── order/                 # Order controller and order feed/pub-sub
├── plot/
│   ├── chart.go           # Chart builder; Reset/SetStrategy/SetPaperWallet/Register for reuse
│   └── indicator/         # Plot-specific indicator renderers (RSI, MACD, Stochastic, CCI, Bollinger, etc.)
├── service/               # Core interfaces (Exchange, Broker, Notifier, Feeder, Telegram)
├── storage/               # Storage backends (BuntDB, SQL/SQLite)
├── strategy/              # Strategy interface definition and controller
│   └── strategies/        # Reusable example strategies (CrossEMA, DCA, Turtle, etc.)
├── testdata/              # Sample CSV files for tests and backtesting examples
├── tools/
│   ├── log/               # Logger setup (logrus wrapper)
│   ├── metrics/           # Performance metrics bootstrap
│   ├── scheduler.go       # Cron-like scheduler
│   └── trailing.go        # Trailing stop utility
├── ui/
│   ├── assets/            # CSS and JS files for the web interface
│   ├── template/          # HTML templates (chart.html, form.html)
│   └── ui.go              # Embeds the assets and templates via go:embed
├── ninjabot.go            # Main bot struct, NewBot() constructor, bot.Run()
├── types.go               # Re-exported types (Settings, SideType, etc.)
├── go.mod / go.sum        # Go module definition
└── Makefile               # Shortcuts: test, lint, generate, release
```

### Key entry points at a glance

| File | Purpose |
|---|---|
| `ninjabot.go` | `NinjaBot` struct, `NewBot()`, `Run()`, `Backtest()` |
| `strategy/strategy.go` | The `Strategy` interface you must implement |
| `service/service.go` | Core interfaces (`Exchange`, `Broker`, `Feeder`, etc.) |
| `exchange/binance.go` | Production exchange adapter |
| `exchange/paperwallet.go` | Simulated exchange for paper trading & backtesting |
| `cmd/main.go` | Web UI entry point for running backtests interactively via browser |
| `plot/chart.go` | Chart server; `Register()`, `Reset()`, `SetStrategy()`, `SetPaperWallet()` |

---

## Setup & Running

### Step 1 — Clone the repository

```bash
git clone https://github.com/rodrigo-brito/ninjabot.git
cd ninjabot
```

### Step 2 — Download dependencies

```bash
go mod download
```

Or equivalently:

```bash
go mod tidy
```

### Step 3 — Verify the build

```bash
go build ./...
```

No errors means the environment is ready.

### Step 4 — Run the test suite

```bash
make test
# equivalent to: go test -race -cover ./...
```

All tests should pass before you start making changes.

### Step 5 — (Optional) Install the Web App

The `ninjabot` binary can be installed globally to start the web UI from anywhere:

```bash
go install github.com/rodrigo-brito/ninjabot/cmd@latest
```

**Example usage (Web UI):**

```bash
# Start the web UI server on port 8080
ninjabot
```

---

## Core Concepts & App Flow

Understanding the data flow is essential before writing code.

```
[Exchange / CSV Feed]
        │  (candlestick data)
        ▼
[DataFeed subscription]
        │
        ▼
[Strategy Controller]  ──────────────────────────────────
        │                                                │
        │  1. strategy.Indicators(df)                   │
        │     └─ fills df.Metadata with indicator vals  │
        │                                               │
        │  2. strategy.OnCandle(df, broker)             │
        │     └─ your trading logic runs here           │
        │         └─ broker.CreateOrderMarket(...)      │
        │                                               ▼
        │                                      [Order Controller]
        │                                               │
        │                                      sends to Exchange
        │                                               │
        ▼                                               ▼
[Notifier (Telegram)]                         [Storage (BuntDB/SQL)]
```

### Key types

| Type | Package | Description |
|---|---|---|
| `model.Dataframe` | `model` | OHLCV data + `Metadata` map for indicator values |
| `model.Series[float64]` | `model` | Typed time-series with helpers (`Last()`, `Crossover()`, etc.) |
| `model.Settings` | `model` | Bot configuration: pairs, Telegram settings |
| `model.Order` | `model` | Represents a trade order |
| `service.Broker` | `service` | Interface for placing orders (`CreateOrderMarket`, etc.) |
| `service.Exchange` | `service` | Full exchange interface (includes `Broker` + `Feeder`) |

---

## Writing Your First Strategy

Implement the `strategy.Strategy` interface. The full contract is:

```go
type Strategy interface {
    Timeframe() string                                      // candle interval, e.g. "1h", "4h", "1d"
    WarmupPeriod() int                                      // candles needed before OnCandle fires
    Indicators(df *model.Dataframe) []ChartIndicator        // compute and store indicator values
    OnCandle(df *model.Dataframe, broker service.Broker)    // trading logic runs here
}
```

### Minimal example

```go
package strategies

import (
    "github.com/rodrigo-brito/ninjabot"
    "github.com/rodrigo-brito/ninjabot/indicator"
    "github.com/rodrigo-brito/ninjabot/service"
    "github.com/rodrigo-brito/ninjabot/strategy"
    "github.com/rodrigo-brito/ninjabot/tools/log"
)

type CrossEMA struct{}

func (e CrossEMA) Timeframe() string    { return "4h" }
func (e CrossEMA) WarmupPeriod() int   { return 22 }

func (e CrossEMA) Indicators(df *ninjabot.Dataframe) []strategy.ChartIndicator {
    df.Metadata["ema8"]  = indicator.EMA(df.Close, 8)
    df.Metadata["sma21"] = indicator.SMA(df.Close, 21)
    return nil // return []ChartIndicator if you want chart overlays
}

func (e *CrossEMA) OnCandle(df *ninjabot.Dataframe, broker service.Broker) {
    closePrice := df.Close.Last(0)

    assetPosition, quotePosition, err := broker.Position(df.Pair)
    if err != nil {
        log.Error(err)
        return
    }

    // Buy signal: EMA8 crosses above SMA21
    if quotePosition >= 10 && df.Metadata["ema8"].Crossover(df.Metadata["sma21"]) {
        amount := quotePosition / closePrice
        _, err := broker.CreateOrderMarket(ninjabot.SideTypeBuy, df.Pair, amount)
        if err != nil {
            log.Error(err)
        }
        return
    }

    // Sell signal: EMA8 crosses below SMA21
    if assetPosition > 0 && df.Metadata["ema8"].Crossunder(df.Metadata["sma21"]) {
        _, err = broker.CreateOrderMarket(ninjabot.SideTypeSell, df.Pair, assetPosition)
        if err != nil {
            log.Error(err)
        }
    }
}
```

> **Rule of thumb:** All indicator computation belongs in `Indicators()`. All order logic belongs in `OnCandle()`. Never place orders inside `Indicators()`.

---

## Running Examples

All examples live in the `examples/` directory. Run them directly with `go run`.

### Backtesting (no credentials needed)

Uses the CSV files in `testdata/` as historical data:

```bash
go run examples/backtesting/backtesting.go
# or:
make run-backtest
```

### Web Backtest UI (no credentials needed)

Opens a browser-based form to configure pairs, timeframe, and strategy parameters. Downloads live data from the Binance public API, runs the simulation, then redirects to the analytics chart:

```bash
make run-webbacktest
# opens → http://localhost:8080
```

See [Web Backtest UI](#web-backtest-ui) for full details.

### Paper Wallet — live simulation (no real money)

Requires Binance API credentials (read-only scope is enough for price feed):

```bash
export API_KEY="your_binance_api_key"
export API_SECRET="your_binance_api_secret"

go run examples/paperwallet/paperwallet.go
```

### Spot Market — real trading

> **WARNING:** This example places real orders. Use a dedicated test account with minimal funds.

```bash
export API_KEY="your_binance_api_key"
export API_SECRET="your_binance_api_secret"
export TELEGRAM_TOKEN="your_telegram_bot_token"   # optional
export TELEGRAM_USER="your_telegram_user_id"      # optional

go run examples/spotmarket/spot.go
```

### Futures Market

```bash
export API_KEY="your_binance_futures_api_key"
export API_SECRET="your_binance_futures_api_secret"

go run examples/futuremarket/futures.go
# or:
make run-futures API_KEY=... API_SECRET=...
```

---

## Web Backtest UI

`cmd/main.go` is a self-contained HTTP server that exposes a browser form, runs a full backtest in-process, and serves results on the chart — no terminal interaction required after startup.

### How to run

```bash
make run-webbacktest
# → http://localhost:8080
```

### Workflow

1. Fill in the form (pairs, timeframe, days, initial capital, EMA/SMA periods)
2. Click **Run Backtest**
3. The server downloads OHLCV data from the Binance public API, runs the EMA-crossover strategy simulation, and stores the results
4. Browser is automatically redirected to `/?pair=BTCUSDT`
5. The chart renders candlesticks, indicators, buy/sell markers, equity curve **and** a full summary panel

### Summary panel on the chart

After a backtest completes, `GET /api/summary` returns a JSON payload that the chart JS fetches automatically and renders as a dedicated **Backtest Summary** section below the trade history table. It includes:

| Section | Contents |
|---|---|
| **KPI cards** | Initial capital, final portfolio, gross profit, win rate, payoff, profit factor, SQN, max drawdown, volume. Also, the main chart explicitly labels metrics as Portfolio Return, Portfolio Max Drawdown, and Portfolio Sharpe Ratio to clarify these reflect the total wallet state across all pairs. |
| **Per-pair table** | Trades, Win/Loss, % Win, Payoff, Profit Factor, SQN, Profit, Volume for each pair + totals row |
| **Confidence Intervals (95%)** | Bootstrap-computed Return, Payoff, Profit Factor intervals per pair |
| **Return Distribution** | 15-bucket histogram of all trade returns (color-coded: red = loss, green = profit) |
| **Final Wallet** | Asset balances converted to USDT at last candle price |
| **Risk & Returns** | Start/final portfolio, gross profit %, max drawdown, total volume |

### HTTP endpoints exposed by `webbacktest`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Backtest configuration form (if no query param), or chart view (if `?pair=X`) |
| `POST` | `/api/backtest` | JSON payload → runs simulation, returns `{"pairs":[...]}` |
| `GET` | `/api/summary` | JSON summary of the last completed backtest |
| `GET` | `/data?pair=X` | Raw chart data JSON (candles, indicators, orders, equity) |
| `GET` | `/history?pair=X` | Trade history CSV download |
| `GET` | `/health` | Health check |
| `GET` | `/enhanced?pair=X` | Legacy route, redirects to `/?pair=X` |

### Architecture

```
browser POST /api/backtest
        │
        ▼
  download.Downloader  ───► Binance public API ───► tmp/*.csv
        │
        ▼
  exchange.NewCSVFeed  +  exchange.NewPaperWallet
        │
        ▼
  ninjabot.NewBot  ──────────────────────────────────────────┐
        │  (WithBacktest, WithCandleSubscription(chart), ...) │
        ▼                                                     │
  bot.Run()                                                   │
        │                                                     │
  computeSummary()  ──► server.summaryJSON                    │
        │                                                     ▼
  JS redirect to /?pair=BTCUSDT       chart.OnCandle / chart.OnOrder
                                            │
                              GET /data  ◄──┘
                                │
                              GET /api/summary
                                │
                        browser renders chart + summary panel
```

---

## Testing

> **Before this section:** see also [Chart API Extensions](#chart-api-extensions) for new methods added to `plot/chart.go`.

### Run all tests

```bash
make test
# equivalent to:
go test -race -cover ./...
```

The `-race` flag enables Go's data race detector — always keep it enabled.

### Run tests for a specific package

```bash
go test -race -cover ./exchange/...
go test -race -cover ./order/...
```

### Run a single test

```bash
go test -race -run TestPaperWallet_BuyMarket ./exchange/...
```

### Regenerate mocks

Mocks for interfaces are auto-generated by `mockery` and stored in `testdata/mocks/`:

```bash
make generate
# equivalent to: go generate ./...
```

Run this after modifying any interface in `service/service.go`.

---

## Chart API Extensions

The following methods were added to `plot.Chart` to support the web backtest UI and any other scenario where the chart must be reused across multiple runs:

| Method | Signature | Description |
|---|---|---|
| `Reset` | `func (c *Chart) Reset()` | Clears all accumulated candle, order, and dataframe data. Call before starting a new backtest on a running server. |
| `SetStrategy` | `func (c *Chart) SetStrategy(s strategy.Strategy)` | Updates the strategy used to compute chart indicator overlays. |
| `SetPaperWallet` | `func (c *Chart) SetPaperWallet(w *exchange.PaperWallet)` | Replaces the wallet used for equity curve and drawdown data. |
| `Register` | `func (c *Chart) Register(mux *http.ServeMux)` | Registers all chart HTTP routes (`/data`, `/history`, `/health`, `/assets/`) on a custom mux instead of `http.DefaultServeMux`. |

Example — embedding the chart inside a larger HTTP server:

```go
mux := http.NewServeMux()

chart, _ := plot.NewChart(plot.WithCustomIndicators(plotindicator.RSI(14, "purple")))
chart.Register(mux) // routes: /data, /history, /health, /assets/

mux.HandleFunc("/", myHomeHandler)
mux.HandleFunc("/api/backtest", myBacktestHandler)

http.ListenAndServe(":8080", mux)
```

In `myBacktestHandler`, reset and reconfigure the chart before each run:

```go
chart.Reset()
chart.SetStrategy(newStrategy)
chart.SetPaperWallet(newWallet)
// then call bot.Run(ctx) with WithCandleSubscription(chart) etc.
```

### Bug fix: nil `ordersIDsByPair` panic

A panic was present in the original code where `candlesByPair`, `shapesByPair`, and `orderStringByPair` called `.Iter()` on a nil `*LinkedHashSetINT64` when a pair had candles but no orders yet. This was fixed by adding nil guards at the start of each method:

```go
// Before (panics when orderSet is nil)
for id := range c.ordersIDsByPair[pair].Iter() { ... }

// After (safe)
orderSet := c.ordersIDsByPair[pair]
if orderSet == nil {
    return candles
}
for id := range orderSet.Iter() { ... }
```

This commonly triggered when the browser fetched `/data` immediately after redirect while the backtest simulation was still initializing.

---

## Coding Conventions

This project follows [Effective Go](https://go.dev/doc/effective_go) and [Google's Go Style Guide](https://google.github.io/styleguide/go/).

### Formatting

- Always run `gofmt` before committing. CI will fail on unformatted code.
- Use `goimports` to manage import grouping automatically.

```bash
gofmt -w .
goimports -w .
```

### Naming

| Item | Convention | Example |
|---|---|---|
| Variables & local functions | `camelCase` | `closePrice`, `quotePosition` |
| Exported types & functions | `PascalCase` | `NewBot`, `PaperWallet` |
| Interface names | `-er` suffix where possible | `Feeder`, `Notifier`, `Broker` |
| Constants | `PascalCase` (exported) / `camelCase` (unexported) | `SideTypeBuy`, `defaultDatabase` |
| Packages | lowercase, single word | `exchange`, `storage`, `strategy` |

### Error handling

- Check errors immediately after the call — never ignore them silently.
- Wrap errors with context using `fmt.Errorf("context: %w", err)`.
- Use `log.Fatal` only in `main()` or top-level example entry points.

### Comments

- Document all exported functions and types.
- Comment on *why*, not *what*, unless the logic is non-obvious.
- Comments must be complete English sentences starting with the symbol name.

```go
// NewBot creates and initializes a NinjaBot instance with the given settings,
// exchange adapter, strategy, and optional configuration options.
func NewBot(ctx context.Context, settings model.Settings, ...) (*NinjaBot, error) {
```

### Linting

```bash
make lint
# equivalent to: golangci-lint run --fix
```

Resolve all linter warnings before opening a pull request.

---

## Git Workflow

### Branch naming

```
feature/<short-description>    # new feature
fix/<short-description>        # bug fix
refactor/<short-description>   # refactoring, no behavior change
docs/<short-description>       # documentation only
```

**Examples:**
```
feature/add-stop-loss-support
fix/paper-wallet-balance-calculation
docs/update-onboarding-guide
```

### Workflow

```bash
# 1. Sync your local main with upstream
git checkout main
git pull upstream main

# 2. Create a feature branch
git checkout -b feature/my-new-feature

# 3. Make changes, then run tests and linter
make test
make lint

# 4. Commit with a clear, imperative message
git commit -m "Add trailing stop support to order controller"

# 5. Push and open a Pull Request against main
git push origin feature/my-new-feature
```

### Commit message format

Use the imperative mood in the subject line (max 72 characters):

```
Add RSI indicator to plot package
Fix paper wallet balance after partial fill
Refactor order controller to reduce lock contention
```

Avoid vague messages like `fix bug`, `update code`, or `WIP`.

### Pull Request checklist

Before requesting a review, make sure:

- [ ] `make test` passes with no failures
- [ ] `make lint` passes with no warnings
- [ ] New behaviour is covered by unit tests
- [ ] Exported symbols have Go doc comments
- [ ] No secrets or API keys are committed

---

> **Questions?** Check the [official docs](https://rodrigo-brito.github.io/ninjabot/), open an [issue](https://github.com/rodrigo-brito/ninjabot/issues), or join the [Discord community](https://discord.gg/TGCrUH972E).
