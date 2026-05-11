.PHONY: help build install clean fmt vet tidy check generate lint test \
        run-backtest run-webbacktest run-paper run-spot run-futures download release

# Default target
.DEFAULT_GOAL := help

## help: Show available make targets
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Dev:"
	@echo "  build          Build the ninjabot CLI binary to ./bin/ninjabot"
	@echo "  install        Install the ninjabot CLI to GOPATH/bin"
	@echo "  clean          Remove build artifacts"
	@echo ""
	@echo "Code Quality:"
	@echo "  fmt            Format all Go source files with gofmt"
	@echo "  vet            Run go vet on all packages"
	@echo "  tidy           Run go mod tidy to sync dependencies"
	@echo "  lint           Run golangci-lint with auto-fix"
	@echo "  generate       Regenerate mocks and other generated files"
	@echo "  check          Run fmt + vet + lint + test (full quality gate)"
	@echo ""
	@echo "Testing:"
	@echo "  test           Run all tests with race detector and coverage"
	@echo ""
	@echo "Examples:"
	@echo "  run-backtest      Run the backtesting example (no credentials needed)"
	@echo "  run-webbacktest   Run the web backtest UI at http://localhost:8080"
	@echo "  run-paper         Run the paper wallet example (requires API_KEY, API_SECRET)"
	@echo "  run-spot          Run the spot market example (requires API_KEY, API_SECRET)"
	@echo "  run-futures       Run the futures market example (requires API_KEY, API_SECRET)"
	@echo ""
	@echo "Data:"
	@echo "  download       Download historical OHLCV data (PAIR, TIMEFRAME, DAYS, OUTPUT)"
	@echo ""
	@echo "Release:"
	@echo "  release        Build a snapshot release with goreleaser"

## ── Build ────────────────────────────────────────────────────────────────────

## build: Compile the ninjabot CLI binary into ./bin/ninjabot
build:
	go build -o bin/ninjabot ./cmd/ninjabot

## install: Install the ninjabot CLI tool to $(GOPATH)/bin
install:
	go install ./cmd/ninjabot

## clean: Remove compiled binaries and build artifacts
clean:
	rm -rf bin/

## ── Code Quality ─────────────────────────────────────────────────────────────

## fmt: Format all Go files using gofmt
fmt:
	gofmt -w .

## vet: Run go vet to catch suspicious constructs
vet:
	go vet ./...

## tidy: Synchronise go.mod and go.sum with the current dependency graph
tidy:
	go mod tidy

## generate: Re-run go generate (regenerates mocks and other files)
generate:
	go generate ./...

## lint: Run golangci-lint with auto-fix enabled
lint:
	golangci-lint run --fix

## check: Full quality gate — fmt, vet, lint, and test
check: fmt vet lint test

## ── Testing ──────────────────────────────────────────────────────────────────

## test: Run all tests with race detector and coverage report
test:
	go test -race -cover ./...

## ── Examples ─────────────────────────────────────────────────────────────────

## run-backtest: Run the built-in backtesting example against CSV test data
run-backtest:
	go run examples/backtesting/backtesting.go

## run-webbacktest: Start the web backtest UI (http://localhost:8080)
## Downloads data from Binance public API — no credentials needed.
run-webbacktest:
	go run examples/webbacktest/main.go

## run-paper: Run the paper wallet example (live feed, simulated orders)
## Required env vars: API_KEY, API_SECRET
run-paper:
	@test -n "$(API_KEY)"    || (echo "Error: API_KEY is not set"    && exit 1)
	@test -n "$(API_SECRET)" || (echo "Error: API_SECRET is not set" && exit 1)
	API_KEY=$(API_KEY) API_SECRET=$(API_SECRET) go run examples/paperwallet/paperwallet.go

## run-spot: Run the spot market example against a real Binance account
## Required env vars: API_KEY, API_SECRET
## Optional env vars: TELEGRAM_TOKEN, TELEGRAM_USER
run-spot:
	@test -n "$(API_KEY)"    || (echo "Error: API_KEY is not set"    && exit 1)
	@test -n "$(API_SECRET)" || (echo "Error: API_SECRET is not set" && exit 1)
	API_KEY=$(API_KEY) API_SECRET=$(API_SECRET) \
	TELEGRAM_TOKEN=$(TELEGRAM_TOKEN) TELEGRAM_USER=$(TELEGRAM_USER) \
	go run examples/spotmarket/spot.go

## run-futures: Run the futures market example against a real Binance Futures account
## Required env vars: API_KEY, API_SECRET
run-futures:
	@test -n "$(API_KEY)"    || (echo "Error: API_KEY is not set"    && exit 1)
	@test -n "$(API_SECRET)" || (echo "Error: API_SECRET is not set" && exit 1)
	API_KEY=$(API_KEY) API_SECRET=$(API_SECRET) go run examples/futuremarket/futures.go

## ── Data ─────────────────────────────────────────────────────────────────────

## download: Download historical OHLCV candles to a CSV file
## Usage: make download PAIR=BTCUSDT TIMEFRAME=1h DAYS=30 OUTPUT=./btc.csv
## Add FUTURES=--futures to fetch from the futures market
PAIR      ?= BTCUSDT
TIMEFRAME ?= 1h
DAYS      ?= 30
OUTPUT    ?= ./$(PAIR)-$(TIMEFRAME).csv
FUTURES   ?=

download: build
	./bin/ninjabot download \
		--pair $(PAIR) \
		--timeframe $(TIMEFRAME) \
		--days $(DAYS) \
		--output $(OUTPUT) \
		$(FUTURES)

## ── Release ──────────────────────────────────────────────────────────────────

## release: Build a snapshot release with goreleaser (no publish)
release:
	goreleaser build --snapshot
