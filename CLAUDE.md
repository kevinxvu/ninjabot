# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Building and Running
*   **Build the Web App**: `make build` (Outputs to `bin/ninjabot`)
*   **Run Web Backtest UI (Backend Dev)**: `make dev` or `go run ./cmd` (Runs at `http://localhost:8080`)

### UI Development (React)
*   **Install dependencies**: `make ui-install` (Runs `npm install` in `ui/`)
*   **Run UI Dev Server**: `make ui-dev` (Runs Vite server at `http://localhost:5173`)
*   **Build UI**: `make ui-build` (Compiles React app to `ui/dist/` for embedding)
*   **Lint UI**: `make ui-lint` (Runs ESLint)

### Testing and Linting
*   **Run all tests**: `make test` (Includes race detector and coverage)
*   **Run a single test**: `go test -v ./path/to/package -run ^TestName$`
*   **Format code**: `make fmt`
*   **Run linters**: `make lint` (Requires `golangci-lint` installed; runs with auto-fix)
*   **Full Quality Check**: `make check` (Runs `fmt`, `vet`, `lint`, and `test`)
*   **Generate mocks**: `make generate` (Runs `go generate ./...`)

## High-Level Architecture

The Ninjabot framework is a Go-based cryptocurrency trading bot framework. It is designed to be imported into custom Go programs, allowing users to build, backtest, and deploy their own strategies for Binance spot and futures markets.

Key components and directory structure:

*   **`cmd/`**: Entry point (`main.go`) for the `ninjabot` HTTP server.
*   **`server/`**: Contains the HTTP server logic, handlers, router, and summary/KPI calculations for the Web Backtest UI.
*   **`model/`**: Contains core domain entities such as `Candle`, `Order`, `Dataframe`, and `Series`. `Dataframe` is widely used across the framework for holding arrays of OHLCV data.
*   **`exchange/`**: Adapters that implement the Exchange interface.
    *   `binance.go` & `binance_future.go`: Live trading on Binance Spot/Futures.
    *   `csvfeed.go`: Replays historical candle data from CSV files for backtesting.
    *   `paperwallet.go`: Simulated wallet for live paper trading without real funds.
*   **`strategy/`**: Contains the core `Strategy` interface (e.g., `OnCandle`, `Indicators`). Custom trading algorithms are built by implementing this interface. Built-in strategies (like CrossEMA, DCA, Turtle) are available in `strategy/strategies/`.
*   **`indicator/`**: Wrappers for technical analysis (TA) tools, primarily powered by `go-talib`. Includes common indicators like EMA, SMA, MACD, Stochastic, CCI, Supertrend, etc.
*   **`order/`**: Responsible for the order lifecycle, routing, and providing a pub/sub feed for order status updates.
*   **`plot/`**: An internal charting component to visualize candlestick data, indicator lines, and buy/sell execution points.
*   **`ui/`**: Modern React/Vite/Tailwind frontend for the Web Backtest UI. Built assets (`ui/dist/`) are bundled into the Go binary via `go:embed`.
*   **`examples/`**: Contains practical implementation reference code showing how to wire up the bot for backtesting, paper trading, and real market usage.

## Development Specifics

*   **UI/Frontend Design:** The Web UI (`ui/`) strictly follows a **Payment Gateway / Fintech Minimalism** aesthetic (e.g., Stripe, Vercel). Always use flat design, subtle borders, soft drop shadows (`var(--card-shadow)`), and Indigo/Slate brand colors. Use `label-style` for small uppercase text and pastel badges for statuses. Never use brutalist or overly colorful/cluttered designs.
*   When testing order execution logic, heavily utilize the `exchange.PaperWallet` component to simulate broker interactions without risk.
*   Always ensure mathematical precision when working with `indicator/` calculations or modifying `model.Candle` / `model.Order` logic, as this directly impacts trading results.
*   To test your strategies with real (but historical) data, use the backtest engine combining `exchange.CSVFeed` with your strategy.
*   When dealing with multiple pairs, ensure that equity and portfolio metrics accurately reflect the aggregate wallet state to prevent duplicate timestamps or misleading pair-specific data.
*   **Cleanup**: Always clean up any temporary scratchpad files (e.g., `*.patch`, `*.sh`, `*.orig`) created during code modifications before finishing a task.
