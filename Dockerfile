# TradingBot web app image.
#
# Nothing is downloaded while building the binary: the UI is built on the host
# (ui/dist, embedded by ui/ui.go) and Go dependencies come from vendor/.
# Prepare both and build with `make docker-build` (runs ui-build + vendor first).

ARG GO_VERSION=1.24
ARG ALPINE_VERSION=3.20

FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src
# Use the image's Go, never fetch the toolchain named in go.mod.
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOFLAGS=-mod=vendor

# Dependencies first so the vendor layer is cached between source changes.
COPY go.mod go.sum ./
COPY vendor/ vendor/
COPY . .
RUN test -f ui/dist/index.html || (echo "ui/dist is missing: run 'make ui-build' on the host first" >&2 && exit 1)
RUN go build -trimpath -ldflags="-s -w" -o /out/ninjabot ./cmd

FROM alpine:${ALPINE_VERSION}
# CA certificates for Binance/Telegram HTTPS, tzdata for TZ support.
RUN apk add --no-cache ca-certificates tzdata \
	&& addgroup -S app && adduser -S -G app app \
	&& mkdir -p /app/data && chown app:app /app/data
WORKDIR /app

# The server reads exchange/pairs.json relative to its working directory.
COPY --from=build /out/ninjabot /app/ninjabot
COPY exchange/pairs.json /app/exchange/pairs.json

ENV PORT=8080 \
	DB_PATH=/app/data/ninjabot.db
VOLUME ["/app/data"]
EXPOSE 8080
USER app

# /api/health stays 503 until a backtest has run, so probe a static endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/pairs" || exit 1

ENTRYPOINT ["/app/ninjabot"]
