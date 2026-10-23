# Ninjabot · TradingBot

[![tests](https://github.com/kevinxvu/ninjabot/actions/workflows/ci.yaml/badge.svg)](https://github.com/kevinxvu/ninjabot/actions/workflows/ci.yaml)
[![Go Reference](https://pkg.go.dev/badge/github.com/rodrigo-brito/ninjabot.svg)](https://pkg.go.dev/github.com/rodrigo-brito/ninjabot)

A cryptocurrency trading bot toolkit in Go for Binance, with a web app to backtest strategies and follow them on live
data. This repository is a fork of [rodrigo-brito/ninjabot](https://github.com/rodrigo-brito/ninjabot).

It has two parts:

- **The ninjabot framework**: a Go library to write, backtest and run trading strategies on Binance Spot and Futures.
- **TradingBot**, a web app built on it: a single Go server with an embedded React UI.

> [!WARNING]
> This software is for educational purposes only. Do not risk money you are afraid to lose. Use it at your own risk:
> the authors assume no responsibility for your trading results. The web app only trades on a simulated wallet, but
> the `examples/spotmarket` and `examples/futuremarket` programs place **real orders**.

## The web app

| Module | What it does |
|---|---|
| **Dashboard** | Live Binance tickers, a live candlestick chart and your account value (needs an API key). |
| **Backtesting** | Pick a pair, strategy and period; the server downloads Binance history, simulates the strategy and shows KPIs (win rate, payoff, profit factor, SQN, max drawdown, confidence intervals) with price and equity charts. |
| **Realtime Signals** | Long-running paper-trading sessions on live Binance data. Sessions are saved in SQLite and can be stopped, resumed and deleted. |
| **Telegram alerts** | A Telegram message for every BUY/SELL signal of a session (pair, price, quantity, value, trade result). Signals only: nothing is traded. |
| **Strategy Guide** | How each built-in strategy trades and which market it suits. |

### Built-in strategies

| Strategy | Style | Timeframe | Backtest | Realtime |
|---|---|---|---|---|
| EMA Crossover | Trend following: buy when a fast EMA crosses above a slow SMA, sell on the cross back | Any | ✓ | ✓ |
| Trailing Stop | EMA 8 / SMA 21 entry, exit with a stop that follows the price up | 4h | ✓ | |
| Turtle Trading | Breakout: buy a new 40-candle high, sell a new 20-candle low | 4h | ✓ | |
| OCO Sell | Stochastic entry with a +10% take profit / -5% stop-loss | 1d | ✓ | |
| DCA | Buy a fixed amount every N days, never sell | 1d | ✓ | |

The Strategy Guide page in the app explains the exact entry, exit and sizing rules of each one.

## Quick start

Requirements: **Go 1.23+**, **Node.js 22.12+** (20.19+ works) and **Make**.

```bash
git clone git@github.com:kevinxvu/ninjabot.git
cd ninjabot
make setup   # Go modules, UI dependencies, UI build
make dev     # http://localhost:8080
```

Run commands from the repository root: the server reads `exchange/pairs.json` and creates `ninjabot.db` there.

The Go server embeds the built UI (`ui/dist`, not committed). On a fresh clone run `make setup` before any
`go build`, `go run` or `go test`, and after changing UI code run `make ui-build` and restart the server.

### Docker

The image embeds the UI built on your machine and builds the server from `vendor/`, so it downloads nothing:

```bash
make docker-up      # build ui/dist + vendor/ on the host, build the image, start the container
make docker-logs    # follow the logs; docker-stop, docker-ps, docker-shell: see make help
```

The app runs on http://localhost:8080 (`DOCKER_PORT=9090` to change it). Sessions and settings are kept in the
`ninjabot-data` volume, and a `.env` file at the repository root is passed to the container when it exists.

### Configuration

All settings are optional environment variables:

| Variable | Used for |
|---|---|
| `PORT` | HTTP port (default `8080`) |
| `DB_PATH` | SQLite file for realtime sessions and settings (default `ninjabot.db`; `/app/data/ninjabot.db` in Docker) |
| `API_KEY`, `API_SECRET` | Binance credentials, only for the Dashboard portfolio card. Market data, backtests and realtime signals use public endpoints. |
| `TELEGRAM_TOKEN`, `TELEGRAM_USER` | Telegram for the framework examples. The web app configures Telegram in its Settings page. |

### Telegram alerts

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy its token.
2. Send `/start` to your bot so it is allowed to message you.
3. Find your numeric user ID, for example with [@userinfobot](https://t.me/userinfobot). Group IDs (`-100…`) and
   public channels (`@name`) work too.
4. In the app, open **Settings**, enter the token and chat ID, click **Send Test Message**, then **Save Settings**.
5. Turn on **Send Telegram alerts** when starting a realtime session, or with the bell button on its page.

The bot token is stored in the local `ninjabot.db` and is never sent back to the browser.

## Using the framework

Install the module:

```bash
go get github.com/rodrigo-brito/ninjabot
```

A strategy implements four methods: indicators are computed in `Indicators`, orders are placed in `OnCandle`.

```go
type CrossEMA struct{}

func (e CrossEMA) Timeframe() string { return "4h" }
func (e CrossEMA) WarmupPeriod() int { return 22 } // candles needed before OnCandle runs

func (e CrossEMA) Indicators(df *ninjabot.Dataframe) []strategy.ChartIndicator {
	df.Metadata["ema8"] = indicator.EMA(df.Close, 8)
	df.Metadata["sma21"] = indicator.SMA(df.Close, 21)
	return nil
}

func (e *CrossEMA) OnCandle(df *ninjabot.Dataframe, broker service.Broker) {
	asset, quote, err := broker.Position(df.Pair)
	if err != nil {
		log.Error(err)
		return
	}
	switch {
	case quote >= 10 && df.Metadata["ema8"].Crossover(df.Metadata["sma21"]):
		_, err = broker.CreateOrderMarketQuote(ninjabot.SideTypeBuy, df.Pair, quote)
	case asset > 0 && df.Metadata["ema8"].Crossunder(df.Metadata["sma21"]):
		_, err = broker.CreateOrderMarket(ninjabot.SideTypeSell, df.Pair, asset)
	}
	if err != nil {
		log.Error(err)
	}
}
```

The full versions of the built-in strategies are in [`strategy/strategies`](strategy/strategies).

### Examples

| Command | Example | Notes |
|---|---|---|
| `make run-backtest` | [`examples/backtesting`](examples/backtesting) | Backtest on the CSVs in `testdata/`, no credentials |
| `make run-paper` | [`examples/paperwallet`](examples/paperwallet) | Live Binance data, simulated orders; needs `API_KEY`, `API_SECRET` |
| `make run-spot` | [`examples/spotmarket`](examples/spotmarket) | **Real orders** on Binance Spot |
| `make run-futures` | [`examples/futuremarket`](examples/futuremarket) | **Real orders** on Binance Futures |

### Framework features

|                    | Binance Spot | Binance Futures |
|--------------------|:------------:|:---------------:|
| Market order       | ✓ | ✓ |
| Market quote order | ✓ |   |
| Limit order        | ✓ | ✓ |
| Stop order         | ✓ | ✓ |
| OCO order          | ✓ |   |
| Backtesting        | ✓ | ✓ |

- Backtesting from CSV files, and a paper wallet for live simulation
- Historical candle downloader ([`download`](download))
- Chart data with candles, orders and indicators ([`plot`](plot))
- Telegram controller (status, buy, sell, notifications) and mail notifier
- Heikin Ashi candles, trailing stop and order scheduler tools

Only Binance is supported. Another exchange needs a type that implements the `service.Exchange` interface; see
[`exchange`](exchange).

## Development

| Task | Command |
|---|---|
| List all targets | `make help` |
| Go tests (race detector + coverage) | `make test` |
| Tests of one package / one test | `make test-pkg PKG=./server/...` · `make test-run RUN=TestName PKG=./...` |
| Go format, vet, lint | `make fmt` · `make vet` · `make lint` |
| UI dev server (does not proxy `/api`) | `make ui-dev` |
| UI checks | `make ui-check` |
| Everything before a PR | `make check-all` |

```text
cmd/            Web app entry point
server/         HTTP API, WebSocket, realtime sessions, Telegram alerts
ui/             React 19 + TypeScript + Tailwind + shadcn/ui (embedded into the server)
strategy/       Strategy interface and the built-in strategies
exchange/       Binance spot/futures, CSV feed, paper wallet
indicator/      Technical indicators (go-talib wrappers)
model/ order/   Candles, orders, dataframes; order controller
storage/        BuntDB (backtests) and SQLite (realtime sessions)
examples/       Stand-alone framework examples
```

[`AGENTS.md`](AGENTS.md) is the detailed guide to the architecture, HTTP API and conventions, and
[`docs/backtest-flow.md`](docs/backtest-flow.md) walks through a backtest step by step (in Vietnamese).
Contributions follow [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Credits and license

Built on [ninjabot](https://github.com/rodrigo-brito/ninjabot) by Rodrigo Brito, which you can support through the
upstream project. Released under the [MIT License](LICENSE).
