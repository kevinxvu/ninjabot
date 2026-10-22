package binance

import (
	"context"
	"time"

	"github.com/jpillora/backoff"

	"github.com/rodrigo-brito/ninjabot/model"
)

// streamConnector opens one websocket connection that calls onCandle for each
// kline event and onError when the connection fails. It returns go-binance's
// done channel (closed when the connection ends) and stop channel (closing it
// shuts the connection down).
type streamConnector func(onCandle func(model.Candle), onError func(error)) (done, stop chan struct{}, err error)

// streamBackoff bounds reconnect attempts. Max stays well below Binance's
// limit of 300 connection attempts per 5 minutes per IP.
func streamBackoff() *backoff.Backoff {
	return &backoff.Backoff{
		Min: 100 * time.Millisecond,
		Max: 30 * time.Second,
	}
}

// serveCandles keeps a kline stream alive until ctx is cancelled: it
// reconnects after disconnects and failed dials instead of giving up, and on
// cancellation closes the websocket and then both channels.
func serveCandles(ctx context.Context, connect streamConnector) (chan model.Candle, chan error) {
	ccandle := make(chan model.Candle)
	cerr := make(chan error)

	sendErr := func(err error) {
		select {
		case cerr <- err:
		case <-ctx.Done():
		}
	}

	go func() {
		defer close(cerr)
		defer close(ccandle)

		ba := streamBackoff()
		for ctx.Err() == nil {
			done, stop, err := connect(func(candle model.Candle) {
				ba.Reset()
				select {
				case ccandle <- candle:
				case <-ctx.Done():
				}
			}, sendErr)
			if err != nil {
				sendErr(err)
				if !sleepContext(ctx, ba.Duration()) {
					return
				}
				continue
			}

			select {
			case <-ctx.Done():
				close(stop)
				// Wait for the read loop to exit so no handler can send on a
				// closed channel.
				<-done
				return
			case <-done:
				if !sleepContext(ctx, ba.Duration()) {
					return
				}
			}
		}
	}()

	return ccandle, cerr
}

// sleepContext waits for d and reports false when ctx ended first.
func sleepContext(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
