# Run every target from the repository root: the server reads
# exchange/pairs.json and creates ninjabot.db relative to the working directory.

GOBIN ?= $(shell go env GOPATH)/bin
PKG   ?= ./...
RUN   ?=

.DEFAULT_GOAL := help

.PHONY: help setup deps dev start build build-all install clean \
	ui-install ui-dev ui-build ui-lint ui-format ui-format-check ui-typecheck ui-check \
	fmt vet tidy generate lint check check-all \
	test test-pkg test-run cover cover-html \
	run-backtest run-webbacktest run-paper run-spot run-futures release

## help: Show available make targets
help:
	@echo "Usage: make [target] [PKG=./pkg/...] [RUN=TestName]"
	@awk '/^## ── / { gsub(/^## ── | ─+$$/, ""); printf "\n%s:\n", $$0; next } \
		/^## [a-z][a-z-]*:/ { sub(/^## /, ""); i = index($$0, ":"); \
		printf "  %-18s %s\n", substr($$0, 1, i - 1), substr($$0, i + 2) }' $(MAKEFILE_LIST)

## ── Setup ────────────────────────────────────────────────────────────────────

## setup: Prepare a fresh clone (Go modules, UI deps, embedded UI build)
setup: deps ui-install ui-build

## deps: Download Go module dependencies
deps:
	go mod download

## ── Build & Run ──────────────────────────────────────────────────────────────

## dev: Run the web app at http://localhost:8080 (PORT overrides; serves the last ui-build)
dev:
	go run ./cmd

## start: Rebuild the UI and the binary, then run ./bin/ninjabot
start: build-all
	./bin/ninjabot

## build: Compile the web app binary into ./bin/ninjabot (embeds the current ui/dist)
build:
	go build -o bin/ninjabot ./cmd

## build-all: Build the UI, then the binary
build-all: ui-build build

## install: Install the web app binary as ninjabot into GOBIN (default: GOPATH/bin)
install:
	go build -o $(GOBIN)/ninjabot ./cmd

## clean: Remove build artifacts and coverage files (keeps ui/dist and ninjabot.db)
clean:
	rm -rf bin/ coverage.out coverage.html

## ── UI ───────────────────────────────────────────────────────────────────────

## ui-install: Install UI dependencies (npm ci when a lockfile exists)
ui-install:
	cd ui && if [ -f package-lock.json ]; then npm ci; else npm install; fi

## ui-dev: Run the Vite dev server on :5173 (does not proxy /api or /ws)
ui-dev:
	cd ui && npm run dev

## ui-build: Type-check and build the UI into ui/dist (embedded by the Go server)
ui-build:
	cd ui && npm run build

## ui-lint: Run ESLint on the UI
ui-lint:
	cd ui && npm run lint

## ui-format: Format the UI with Prettier
ui-format:
	cd ui && npm run format

## ui-format-check: Check UI formatting without writing
ui-format-check:
	cd ui && npm run format:check

## ui-typecheck: Type-check the UI (tsc -b)
ui-typecheck:
	cd ui && npx tsc -b

## ui-check: Full UI gate (typecheck + lint + format check + build)
ui-check: ui-typecheck ui-lint ui-format-check ui-build

## ── Code Quality ─────────────────────────────────────────────────────────────

## fmt: Format all Go files with gofmt
fmt:
	gofmt -w .

## vet: Run go vet on all packages
vet:
	go vet ./...

## tidy: Sync go.mod and go.sum with the dependency graph
tidy:
	go mod tidy

## generate: Regenerate mocks (mockery, testdata/mocks) and other generated files
generate:
	go generate ./...

## lint: Run golangci-lint with auto-fix
lint:
	golangci-lint run --fix

## check: Go gate (fmt + vet + lint + test)
check: fmt vet lint test

## check-all: Go gate plus the UI gate
check-all: check ui-check

## ── Testing ──────────────────────────────────────────────────────────────────

## test: Run all Go tests with the race detector and coverage
test:
	go test -race -cover ./...

## test-pkg: Run the tests of one package tree, e.g. make test-pkg PKG=./server/...
test-pkg:
	go test -race -cover $(PKG)

## test-run: Run tests matching RUN in PKG, e.g. make test-run RUN=TestPaperWallet PKG=./exchange/...
test-run:
	@test -n "$(RUN)" || (echo "Error: RUN is not set (e.g. RUN=TestName)" && exit 1)
	go test -race -v -run '$(RUN)' $(PKG)

## cover: Write coverage.out and print total coverage (PKG narrows it)
cover:
	go test -race -coverprofile=coverage.out $(PKG)
	go tool cover -func=coverage.out | tail -n 1

## cover-html: Write the coverage report to coverage.html
cover-html: cover
	go tool cover -html=coverage.out -o coverage.html
	@echo "Wrote coverage.html"

## ── Examples ─────────────────────────────────────────────────────────────────

## run-backtest: Run the backtesting example on testdata CSVs (no credentials)
run-backtest:
	go run examples/backtesting/backtesting.go

## run-webbacktest: Alias of dev (web app at http://localhost:8080)
run-webbacktest: dev

## run-paper: Run the paper wallet example (live feed, simulated orders; needs API_KEY, API_SECRET)
run-paper:
	@test -n "$(API_KEY)"    || (echo "Error: API_KEY is not set"    && exit 1)
	@test -n "$(API_SECRET)" || (echo "Error: API_SECRET is not set" && exit 1)
	API_KEY=$(API_KEY) API_SECRET=$(API_SECRET) go run examples/paperwallet/paperwallet.go

## run-spot: REAL ORDERS on Binance Spot (needs API_KEY, API_SECRET; optional TELEGRAM_*)
run-spot:
	@test -n "$(API_KEY)"    || (echo "Error: API_KEY is not set"    && exit 1)
	@test -n "$(API_SECRET)" || (echo "Error: API_SECRET is not set" && exit 1)
	API_KEY=$(API_KEY) API_SECRET=$(API_SECRET) \
	TELEGRAM_TOKEN=$(TELEGRAM_TOKEN) TELEGRAM_USER=$(TELEGRAM_USER) \
	go run examples/spotmarket/spot.go

## run-futures: REAL ORDERS on Binance Futures (needs API_KEY, API_SECRET)
run-futures:
	@test -n "$(API_KEY)"    || (echo "Error: API_KEY is not set"    && exit 1)
	@test -n "$(API_SECRET)" || (echo "Error: API_SECRET is not set" && exit 1)
	API_KEY=$(API_KEY) API_SECRET=$(API_SECRET) go run examples/futuremarket/futures.go

## ── Release ──────────────────────────────────────────────────────────────────

## release: Build a snapshot release with goreleaser (no publish)
release:
	goreleaser build --snapshot
