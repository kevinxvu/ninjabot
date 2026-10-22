# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Copilot, ...) and developers working in this repository.
Read this file first; it reflects the code as of the `refactor/ui-shadcn` branch (October 2026).
It replaces the old `INSTRUCTION.md` onboarding guide.

## What this project is

A fork of [rodrigo-brito/ninjabot](https://github.com/rodrigo-brito/ninjabot) maintained at
`git@github.com:kevinxvu/ninjabot.git`. The Go module path is still `github.com/rodrigo-brito/ninjabot`.

It has two parts:

1. **The ninjabot Go framework** (root package + `exchange/`, `strategy/`, `indicator/`, `model/`, `order/`, ...).
   People import it into their own Go programs to build, backtest and run trading bots on Binance spot/futures.
2. **The "TradingBot" web app** (`cmd/` + `server/` + `ui/`): one Go HTTP server with a React UI embedded via `go:embed`.
   The UI has three modules plus a Settings page (Telegram alerts):
   - **Dashboard**: live Binance tickers, a live candlestick chart and the account portfolio value.
   - **Backtesting**: configure a strategy, run it on downloaded Binance history, then inspect charts and KPIs.
   - **Realtime Signals**: long-running paper-trading sessions on live Binance data, persisted in SQLite.

Most current work happens on the web app.

Main libraries: `go-binance/v2` (exchange API), `go-talib` (technical analysis), `buntdb` (in-memory backtest
storage), `gorm` + `glebarez/sqlite` (realtime sessions), `logrus` (via `tools/log`), `telebot.v2` (Telegram),
`testify` and `mockery/v2` (tests).

## Prerequisites

- **Go 1.23+** (`go.mod`; CI runs 1.24) and **Make**.
- **Node.js 22.12+** (20.19+ works) for the UI.
- **golangci-lint** for `make lint`. **goreleaser** only for `make release`. Mockery runs through `go generate`.

## Getting started

```bash
git clone git@github.com:kevinxvu/ninjabot.git && cd ninjabot
make setup   # go mod download + npm ci in ui/ + build ui/dist
make dev     # web app on http://localhost:8080
make test    # go test -race -cover ./...
```

`make help` lists every target with its description (generated from the `## target: ...` comments in the `Makefile`;
keep that format when adding targets).

## Commands

Run everything from the **repository root**. The server reads `exchange/pairs.json` and creates `ninjabot.db` relative to the working directory.

| Task | Command |
|---|---|
| Prepare a fresh clone | `make setup` (= `deps` + `ui-install` + `ui-build`) |
| Run the web app (http://localhost:8080) | `make dev` (= `go run ./cmd`; `PORT` env overrides the port) |
| Rebuild UI + binary and run it | `make start` (= `build-all` then `./bin/ninjabot`) |
| Build the binary | `make build` → `bin/ninjabot` (embeds the current `ui/dist`); `make build-all` rebuilds the UI first |
| Install the binary | `make install` → `$(go env GOPATH)/bin/ninjabot` |
| Go tests (race + coverage) | `make test` |
| Tests of one package tree | `make test-pkg PKG=./server/...` |
| Tests matching a name | `make test-run RUN=TestPaperWallet PKG=./exchange/...` (or `go test -v ./pkg -run '^TestName$'`) |
| Coverage | `make cover [PKG=...]` (total), `make cover-html` (writes `coverage.html`) |
| Go format / vet / lint | `make fmt`, `make vet`, `make lint` (golangci-lint with `--fix`) |
| Full Go gate | `make check` (fmt + vet + lint + test) |
| Go + UI gate | `make check-all` (`check` + `ui-check`) |
| Regenerate mocks | `make generate` (mockery, output in `testdata/mocks/`) |
| UI install / dev server / build | `make ui-install`, `make ui-dev` (Vite on :5173), `make ui-build` |
| UI lint / format | `make ui-lint` (ESLint), `make ui-format` (Prettier + Tailwind class sorter), `make ui-format-check` |
| UI type-check only | `make ui-typecheck` (= `cd ui && npx tsc -b`) |
| Full UI gate | `make ui-check` (typecheck + lint + format check + build) |
| Clean | `make clean` (removes `bin/` and coverage files; keeps `ui/dist` and `ninjabot.db`) |

**Important:** `ui/ui.go` embeds `ui/dist`, which is git-ignored. On a fresh clone, run `make setup` (or `make ui-install && make ui-build`) before any `go build`/`go run`/`go test ./...`, or the `ui` package fails to compile. After changing UI code, rebuild it (`make ui-build`) and restart the Go server, because the server serves the embedded build. `make ui-dev` on :5173 does **not** proxy `/api` or `/ws` to the Go server, so check UI changes on :8080.

Optional environment variables (`server/config.go`): `API_KEY`, `API_SECRET` (Binance; only needed for the Dashboard portfolio card), `TELEGRAM_TOKEN`, `TELEGRAM_USER`, `PORT`.

Known baseline: `go test ./...` currently fails one test, `TestMarketOrder` in `ninjabot_test.go` (expected equity mismatch). This failure is older than the UI refactor. Don't treat it as a regression you caused, but don't hide it either.

## Repository map

```
cmd/main.go               Web app entry: builds plot.Chart with RSI/MACD/Stoch/CCI, starts server.Server
server/
  config.go               Env-based config
  server.go               Wires Binance client, market WS manager, pairs.json, SQLite storage, handler
  router.go               All HTTP routes + SPA/static serving from ui.Files
  handler/                One file per area:
    backtest.go           POST /api/backtest: download CSV → CSVFeed + PaperWallet → bot.Run → computeSummary
    chart.go              /api/data, /api/history (CSV), /api/summary, /api/health
    market.go             /api/pairs, /api/market/{tickers,candles,portfolio}
    signal.go             /api/realtime-signals/* HTTP handlers
    signal_manager.go     Realtime session lifecycle (start/stop/resume/recover, chart rebuild, balances)
    ws.go                 /ws/market upgrade + SUBSCRIBE_CANDLE handling
    types.go              Request/response structs (keep in sync with ui/src/api/types.ts)
  ws/ws.go                MarketWebsocketManager: Binance ticker/kline streams broadcast to all WS clients
ui/                       React app (see "Frontend" below); ui.go embeds dist/
ninjabot.go, types.go     NinjaBot struct, NewBot, Run, options (WithBacktest, WithStorage, ...)
strategy/                 Strategy interface + controller
strategy/strategies/      Built-in strategies: emacross, dca, ocosell, trailingstop, turtle; register.go
internal/registry/        Name → strategy factory registry (used by realtime signals)
exchange/                 binance/ (spot, futures), feed/ (CSVFeed), paperwallet/, pairs.json + pairs.go
indicator/                go-talib wrappers + Supertrend
plot/                     Chart data builder (candles, orders, indicators, equity) + plot/indicator renderers
model/                    Candle, Order, Dataframe, Series, Session, SessionEvent, ...
order/                    Order controller and order feed (pub/sub)
storage/                  Storage interface; buntdb/ (in-memory backtests), sqlite/ (gorm, realtime sessions)
download/                 Binance kline downloader to CSV (used by backtests)
notification/, service/   Telegram/mail notifiers; core interfaces (Exchange, Broker, Feeder, Notifier)
examples/                 Stand-alone framework examples (backtesting, paperwallet, spotmarket, futuremarket)
docs/backtest-flow.md     Detailed backtest flow walkthrough (Vietnamese)
```

## Backend architecture

### HTTP API (`server/router.go`)

| Method & path | Purpose |
|---|---|
| `POST /api/backtest` | Run a backtest synchronously (one at a time, 409 if busy). Body: `backtestRequest`. Returns `{pairs}` |
| `GET /api/data?pair=X` | Chart payload of the **last** backtest for a pair (candles+orders, indicators, shapes, equity/asset values, max drawdown) |
| `GET /api/summary` | Aggregate KPIs of the last backtest (404 until one has run) |
| `GET /api/history?pair=X` | Trade history CSV |
| `GET /api/pairs` | `{pairs: string[]}` from `exchange/pairs.json`, limited at startup to symbols currently trading on Binance spot (`tradablePairs` in `server/server.go`); `?pairs=A,B` returns `{A: {asset, quote, logo}}` |
| `GET /api/market/tickers?pairs=` | Last prices (`{pair: price}`) |
| `GET /api/market/candles?pair=&timeframe=&limit=` | Binance klines via `CandlesByLimit` (default limit 100; 400 outside 1..1000) |
| `GET /api/market/portfolio` | Binance account value in USDT; 503 when the API key is missing or invalid |
| `GET /api/realtime-signals` | List sessions with `stats` (no orders) |
| `POST /api/realtime-signals/start` | Start a session (`StartSignalRequest`), returns the session |
| `GET /api/realtime-signals/:id` | Session with orders, events, wallet balances and `stats` |
| `GET /api/realtime-signals/:id/chart` | Chart payload for the session (also includes `events`) |
| `POST /api/realtime-signals/:id/stop`, `/resume` | Lifecycle |
| `POST /api/realtime-signals/:id/telegram` | `{enabled}`: turn the session's Telegram alerts on/off (applies to running bots) |
| `GET/PUT /api/settings/telegram` | Telegram alert settings (single SQLite row). The token is never returned (`has_token`, `token_hint`); an empty `bot_token` on PUT keeps the saved one |
| `POST /api/settings/telegram/test` | Send a test message with the submitted (unsaved) settings; 502 with Telegram's error on failure |
| `DELETE /api/realtime-signals/:id` | Delete session |
| `GET /ws/market` | WebSocket. Server → client messages: `TICKER {pair, price}`, `CANDLE {pair, data: model.Candle}`, `ORDER {session_id, data}`, `ERROR`. Client → server: `{action: "SUBSCRIBE_CANDLE", pair, timeframe}` |

All handlers are wrapped with `serverhandler.Middleware` (panic recovery + request log).
Every API error is JSON `{"error": "..."}` written with `writeError`; map domain errors with `errorStatus`
(`storage.ErrNotFound` → 404, `ErrSessionBusy` → 409). Unknown `/api/` paths return a JSON 404.

JSON casing differs by source. `plot` candles use lowercase keys (`time`, `open`, ...). `model.Candle` (from `/api/market/candles` and WS `CANDLE` messages) uses capitalized keys (`Time`, `Open`, `Complete`, ...). Orders, sessions, events, balances and pair info use snake_case. `ui/src/lib/candles.ts#normalizeCandle` accepts both candle shapes.

### Backtest flow

`HandleBacktest` runs on a context detached from the request (30 min cap; the UI uses a matching axios timeout) and normalises the request: strategy-forced timeframes (`dca`/`ocosell` → 1d, `trailingstop`/`turtle` → 4h), defaults, and `fast < slow` validation. `runBacktest` then:
1. Downloads klines per pair into a temp dir (`download.Downloader`, public Binance API).
2. Builds `exfeed.CSVFeed`, an in-memory BuntDB store and a `PaperWallet`.
3. Resets the **shared** `plot.Chart` (`Reset`, `SetStrategy`, `SetPaperWallet`).
4. Runs `ninjabot.NewBot(... WithBacktest ...)` and stores `computeSummary` output for `/api/summary`.

The backtest strategy is picked with a `switch` in `runBacktest`, not via `internal/registry`. A new backtest strategy must be added there **and** to `ui/src/components/strategy/strategies.ts` (its entry/exit/sizing texts feed the setup tooltip and the Strategy Guide page, so keep them in sync with the Go rules), with a scenario test in `strategy/strategies/strategies_test.go`.

Two backtest details matter for correctness:
- A `HighFrequencyStrategy` (the trailing stop) acts in `OnPartialCandle`, which only fires on resampled data, so `backtestSourceTimeframe` downloads 1h candles and `CSVFeed` groups them into the strategy timeframe.
- `checkHistoryLength` rejects (400) a history shorter than the strategy's `WarmupPeriod` + 10 candles, so a run never ends with zero trades just for lack of data. `WarmupPeriod` must cover every indicator's lookback (plus one candle for crossovers); `TestWarmupCoversIndicators` enforces it. The UI's per-strategy `recommendedDays` (in `strategies.ts`) only sets the form default.
- In backtest mode the order controller's wall-clock ticker is not started; `backtestCandles` calls `Controller.UpdateOrders()` after each candle that had pending orders, so limit/OCO fills are settled in simulated time.

Because the chart and summary are global server state, only the latest backtest is viewable.

After a run the result page shows, from `/api/data` and `/api/summary`: KPI cards (initial capital, final
portfolio, gross profit, win rate, payoff, profit factor, SQN, max drawdown, volume), a per-pair table, 95%
bootstrap confidence intervals (return, payoff, profit factor), a 15-bucket return histogram, the final wallet in
USDT, and the price/equity/performance charts. Portfolio-level metrics (return, max drawdown, Sharpe) describe
the whole wallet across all pairs.

See `docs/backtest-flow.md` for a step-by-step walkthrough.

### Realtime signals (`server/handler/signal_manager.go`)

- Sessions, orders and session events are persisted with gorm/SQLite in `ninjabot.db` (`storage/sqlite`). `ninjabot.db` is git-ignored local state.
- Each running session is a background `bot.Run` goroutine on a `PaperWallet` fed by live Binance data, on its own context (never the request's). Its strategy is built via `internal/registry` from the session's stored `fast_period`/`slow_period` (only `emacross` and `turtle` are registered; the UI only offers `emacross`).
- Start/resume reserve the session (`starting` map) and fetch chart candles without holding `SignalManager.mu`. `StopSession` cancels the bot's context, waits (up to 10s) for `bot.Run` to return, then persists the stopped state. In live mode `Run` returns on cancel and closes its Binance kline stream (`exchange/binance/stream.go`, which also retries failed dials and reconnects with a backoff up to 30s); never open data feeds on `context.Background()`.
- On resume, wallet balances are rebuilt from order history (`CalculateBalancesFromOrders`) and so is the open position (`order.Controller.RestorePositions`), so the first SELL after a resume reports its profit.
- `stats` (`model.SessionStats`, `server/handler/session_stats.go`) values the wallet at the last price in the pair's quote asset. PnL compares it with the initial capital valued at the same price, i.e. against simply holding the initial asset. Win rate uses orders with a realized `profit` (orders saved before profit was persisted have none). The detail page re-values it with the live ticker (`features/signals/sessionStats.ts`); keep both formulas in sync.
- `RecoverStaleSessions` marks sessions left `running` after a crash as `stopped`. The STOP event uses the session's last `UpdatedAt`.
- `GetSessionChart` serves the running bot's in-memory chart; for stopped sessions it rebuilds a fresh chart per request, limited to the last `maxRealtimeChartCandles` (3000) candles. `fetchSessionChartCandles` paginates Binance klines in 1000-candle windows. Keep that pattern for any long history fetch (Binance's hard limit is 1000 candles per request).
- Orders are pushed to WS clients through `WsNotifier`.
- Telegram alerts (`signal_alerts.go`, `server/telegram`): `SignalAlerter` sends one message per FILLED order of a session with `telegram_alerts` (plus optional start/resume/stop messages), gated by `model.TelegramAlertSettings` (Settings page). They are signals only: nothing is traded. Sending is async and errors are only logged. `withRequestLog` redacts `bot_token`-like fields; never log the token or a Bot API URL.

### WebSocket caveat

`MarketWebsocketManager` holds **one** active kline stream for the whole server, and every message is broadcast to every client (each client has its own send queue; slow clients are dropped). Any `SUBSCRIBE_CANDLE` replaces the stream for everyone, so two tabs watching different pairs/timeframes interfere with each other. Clients must filter `CANDLE` messages by `pair` (the UI does). The ticker stream is fixed to BTC/ETH/SOL/BNB-USDT at startup.

## Frontend (`ui/`)

Stack: React 19, TypeScript 6, Vite 8, Tailwind CSS v4, shadcn/ui (Radix primitives via the `radix-ui` package, `cmdk`), axios, react-router (HashRouter), Plotly (`plotly.js-dist-min` through `react-plotly.js/factory`), lucide-react icons, ESLint (with `eslint-plugin-react-hooks` v7, which is strict) and Prettier. Node 22.12+ recommended.

```
ui/src/
  App.tsx                 Routes: /dashboard, /backtesting[?strategy=], /backtesting/dashboard?pair=, /realtime-signals, /realtime-signals/setup, /realtime-signals/:id, /strategies[?s=], /settings
  index.css               Design tokens (:root/.dark) mapped to Tailwind via @theme inline; `label-style` utility
  api/                    client.ts (axios wrapper returning body, getErrorMessage), market.ts, backtest.ts, signals.ts, types.ts
  hooks/                  useAsync (fetch with stale-response guard, reload, mutate), useMarketSocket, useTradingPairs (shared cache), useLocalStorageState
  lib/                    utils (cn), format (numbers/prices/pnl), time (client-local 24h formatting, Plotly dates, timeframes), candles, pairs, storage
  components/ui/          shadcn/ui primitives: generated, add more with `npx shadcn@latest add <name>` (from ui/)
  components/common/      StatCard, SectionCard, EmptyState, LoadingState, ErrorAlert, FormField, FormSection, MoneyInput, KeyValueList, ConfirmDialog, StatusBadge, CoinIcon, Spinner
  components/layout/      AppLayout (sidebar + <Outlet/>), Sidebar, navigation.ts (menu items), PageHeader
  components/market/      PairSelect, TimeframeSelect, timeframes.ts
  components/strategy/    strategies.ts (strategy catalogue: params, fixed timeframe, description), StrategyFields
  components/charts/      Plot (lazy Plotly wrapper), theme.ts (chart colors/layout), PriceChart + priceFigure.ts, LiveCandleChart, EquityChart
  features/dashboard/     DashboardPage + TickerCard, MarketChartCard, PortfolioCard
  features/backtesting/   BacktestSetupPage, BacktestResultPage, stats.ts, StatsGrid, PerformanceChart, TradesTable, BacktestSummary
  features/signals/       SignalListPage, SignalSetupPage, SignalDetailPage, useSessionActions, SessionCard, SessionMeta, SignalHistory, TelegramAlertToggle
  features/strategies/    StrategyGuidePage (how each strategy trades, when to use it; data from strategies.ts)
  features/settings/      TelegramSettingsPage (bot token, chat ID, notification options, test message)
  types/plotly.d.ts       Module declarations for plotly.js-dist-min and react-plotly.js/factory
```

Conventions:
- Import with the `@/` alias. Put module-only code in `features/<module>/`; promote it to `components/` or `lib/` once a second module needs it.
- All HTTP calls go through `src/api/*`. Add response types to `api/types.ts`, mirroring the Go structs.
- Fetch data with `useAsync(key, fetcher)`, where the key encodes the inputs (e.g. `` `candles:${pair}:${timeframe}` ``) and `null` skips the fetch. Don't call `setState` synchronously in effects or read refs during render; ESLint (`react-hooks` v7) rejects both.
- Use `useMarketSocket` for `/ws/market`; never open WebSockets ad hoc.
- Show user-facing times through `lib/time.ts` helpers (client timezone, 24h), never raw `toLocaleString()` or UTC strings into Plotly.
- Plotly cannot read CSS variables. Chart colors come from `components/charts/theme.ts`, and new charts should build layouts with `baseTimeLayout`. Always render charts through `components/charts/Plot` so Plotly (~4.6 MB) stays a lazily loaded chunk.
- Use `ConfirmDialog` for destructive confirmations and inline messages for errors. No `alert()`/`confirm()`.
- Before finishing UI work, run: `cd ui && npx tsc -b && npm run lint && npm run format:check && npm run build`.

### Design system

The UI follows a **Payment Gateway / Fintech Minimalism** look (Stripe, Vercel): flat surfaces, thin borders, soft shadows (`shadow-card`), Indigo (`primary` #635bff) and Slate colors, Inter font.
- Style with theme tokens (`bg-card`, `bg-muted`, `text-muted-foreground`, `text-success`, `text-destructive`, `border`, `shadow-card`), not raw hex or `var(--...)`. Add any new token in `index.css` for both `:root` and `.dark`.
- Use `label-style` for small uppercase captions (field labels, table headers, stat labels).
- Status badges are pastel: `Badge` variants `success`, `danger`, `warning`, `muted`. Use `SessionStatusBadge` and `OrderSideBadge`.
- Build pages from `PageHeader` + `SectionCard`/`StatCard`. Forms use `FormSection` + `FormField`.
- Never use brutalist, overly colorful or cluttered designs. Don't add placeholder or fake widgets. The maintainer deliberately removed them (fake Exchange widget, search bar, extra menu items).

## Framework guide

### Data flow

```
[Exchange / CSV feed] ── candles ──► [DataFeed subscription] ──► [Strategy controller]
                                                                   │ 1. strategy.Indicators(df)  → fills df.Metadata
                                                                   │ 2. strategy.OnCandle(df, broker)
                                                                   │       └─ broker.CreateOrderMarket(...)
                                                                   ▼
                                     [Notifier (Telegram)] ◄── [Order controller] ──► [Exchange] + [Storage (BuntDB/SQLite)]
                                                                   │
                                                     order feed ──► subscribers (plot.Chart, WsNotifier, ...)
```

Key types: `model.Dataframe` (OHLCV + `Metadata` map for indicator series), `model.Series[float64]` (`Last()`,
`Crossover()`, `Crossunder()`, ...), `model.Settings` (pairs, Telegram), `model.Order`, `service.Broker` (order
placement and `Position`), `service.Exchange` (`Broker` + `Feeder`). The root package re-exports common ones
(`ninjabot.Dataframe`, `ninjabot.SideTypeBuy`, ...).

### Writing a strategy

Implement `strategy.Strategy` (`strategy/strategy.go`); `HighFrequencyStrategy` adds `OnPartialCandle`:

```go
type Strategy interface {
    Timeframe() string                                   // candle interval: "1h", "4h", "1d"
    WarmupPeriod() int                                   // candles needed before OnCandle fires
    Indicators(df *model.Dataframe) []ChartIndicator     // compute indicators, return chart overlays
    OnCandle(df *model.Dataframe, broker service.Broker) // trading logic, after each closed candle
}
```

```go
func (e CrossEMA) Indicators(df *ninjabot.Dataframe) []strategy.ChartIndicator {
    df.Metadata["ema8"] = indicator.EMA(df.Close, 8)
    df.Metadata["sma21"] = indicator.SMA(df.Close, 21)
    return nil // or []strategy.ChartIndicator for chart overlays
}

func (e *CrossEMA) OnCandle(df *ninjabot.Dataframe, broker service.Broker) {
    assetPosition, quotePosition, err := broker.Position(df.Pair)
    if err != nil {
        log.Error(err)
        return
    }
    if quotePosition >= 10 && df.Metadata["ema8"].Crossover(df.Metadata["sma21"]) {
        _, err = broker.CreateOrderMarket(ninjabot.SideTypeBuy, df.Pair, quotePosition/df.Close.Last(0))
    } else if assetPosition > 0 && df.Metadata["ema8"].Crossunder(df.Metadata["sma21"]) {
        _, err = broker.CreateOrderMarket(ninjabot.SideTypeSell, df.Pair, assetPosition)
    }
    if err != nil {
        log.Error(err)
    }
}
```

Indicator computation belongs in `Indicators()`, order logic in `OnCandle()`; never place orders in
`Indicators()`. The full version is `strategy/strategies/emacross.go`. To expose a strategy in the web app, see
"Backtest flow" (backtest `switch` + `strategies.ts`) and `strategy/strategies/register.go` (realtime registry).

### Running a backtest from Go

See `examples/backtesting/backtesting.go`. The essential wiring:

```go
csvFeed, _ := exfeed.NewCSVFeed(strategy.Timeframe(),
    exfeed.PairFeed{Pair: "BTCUSDT", File: "testdata/btc-1h.csv", Timeframe: "1h"})
store, _ := storagebuntdb.FromMemory()
wallet := expaperwallet.NewPaperWallet(ctx, "USDT",
    expaperwallet.WithPaperAsset("USDT", 10000),
    expaperwallet.WithDataFeed(csvFeed))
chart, _ := plot.NewChart(plot.WithStrategyIndicators(strategy), plot.WithPaperWallet(wallet))

bot, _ := ninjabot.NewBot(ctx, ninjabot.Settings{Pairs: []string{"BTCUSDT"}}, wallet, strategy,
    ninjabot.WithBacktest(wallet), // required for backtest mode
    ninjabot.WithStorage(store),
    ninjabot.WithCandleSubscription(chart),
    ninjabot.WithOrderSubscription(chart))
_ = bot.Run(ctx)
bot.Summary()
```

Live trading uses the same `NewBot` with an `exbinance` exchange (or a `PaperWallet` fed by it) instead of the CSV
feed. Telegram is enabled through `Settings.Telegram`; `WithNotifier` registers other notifiers (e.g. mail).

### Reusing `plot.Chart`

`plot.Chart` only builds chart data (candles with their orders, indicators, shapes, equity/asset values); the
HTTP layer is `server/handler`. To reuse one chart across runs (as `runBacktest` does), call `Reset()`, then
`SetStrategy(s)` and `SetPaperWallet(w)` before `bot.Run`. Pair-level accessors (`CandlesByPair`,
`ShapesByPair`, `OrderStringByPair`) must tolerate pairs that have candles but no orders yet.

### Examples

| Target | Example | Notes |
|---|---|---|
| `make run-backtest` | `examples/backtesting` | CSVs from `testdata/`, no credentials |
| `make run-paper` | `examples/paperwallet` | Live Binance feed, simulated orders; needs `API_KEY`, `API_SECRET` |
| `make run-spot` | `examples/spotmarket` | **Real orders**; optional `TELEGRAM_TOKEN`, `TELEGRAM_USER` |
| `make run-futures` | `examples/futuremarket` | **Real orders** on Binance Futures |

## Domain rules

- Keep math precise in `indicator/`, `model.Candle`/`model.Order`, `PaperWallet` and summary/KPI code; it directly changes trading results.
- Test order-execution logic with `exchange/paperwallet` (no real funds). Test strategies against history with `exchange/feed.CSVFeed` + `testdata/` CSVs.
- With multiple pairs, equity and portfolio metrics must reflect the aggregate wallet, without duplicate timestamps or misleading per-pair numbers.
- `examples/spotmarket` and `examples/futuremarket` place **real orders**. Never run them, and never use real API keys in tests.

## Go conventions

Follow `.github/instructions/go.instructions.md` (Effective Go, Google style): gofmt/goimports, early returns, wrap errors with `fmt.Errorf("...: %w", err)`, no panics in library code, doc comments on exported symbols, table-driven tests with `t.Run`. Keep each file's single existing `package` clause. After changing interfaces in `service/`, run `make generate`. CI (`.github/workflows/ci.yaml`) runs `go test -race` on Go 1.24 and golangci-lint on PRs. `.golangci.yml` disables `errcheck`.

- Naming: `camelCase` locals and unexported names, `PascalCase` exports (`NewBot`, `PaperWallet`), `-er`
  interfaces where natural (`Feeder`, `Notifier`, `Broker`), short lowercase package names.
- Check errors right after the call; never drop them silently. `log.Fatal` only in `main()` / example entry points.
- Doc comments are full sentences starting with the symbol name; comment on *why*, not *what*.
- Keep the race detector on (`make test` uses `-race`).

## Git workflow

- Branch names: `feature/…`, `fix/…`, `refactor/…`, `docs/…` (e.g. `fix/paper-wallet-balance-calculation`). PRs target `main`.
- Commit subjects are imperative and concise, at most 72 characters (e.g. "Fix paper wallet balance after partial fill"); avoid `fix bug`, `update code`, `WIP`. `CONTRIBUTING.md` describes Conventional Commits for upstream contributions.
- Before opening a PR: `make check-all` passes (apart from the known `TestMarketOrder` baseline), new behaviour has tests, exported symbols have doc comments, and no secrets are committed.
- Never commit secrets, `ninjabot.db`, `ui/dist`, `node_modules` or debug binaries (`cmd/__debug_bin*`).
- Clean up any temporary files you created (`*.patch`, `*.sh`, `*.orig`, scratch notes) before finishing.

## Other docs

- `docs/backtest-flow.md`: backtest internals, phase by phase (Vietnamese; still accurate for the backend).
- `CONTRIBUTING.md`: upstream contribution guide. `ui/README.md`: Vite template boilerplate.
- Upstream docs: https://rodrigo-brito.github.io/ninjabot/

## Working with the maintainer

The maintainer writes in Vietnamese. Reply in Vietnamese unless asked otherwise. Code, comments and commit messages stay in English.
