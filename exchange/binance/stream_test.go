package binance

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/rodrigo-brito/ninjabot/model"
)

// fakeStream scripts the connections serveCandles opens.
type fakeStream struct {
	mu       sync.Mutex
	dials    int
	failures int // first dials that fail
	conns    []*fakeConn
}

type fakeConn struct {
	onCandle func(model.Candle)
	done     chan struct{}
	stop     chan struct{}
	stopped  bool
	// reading is held while a handler runs. Like go-binance's read loop, the
	// connection only reports done once the current handler has returned.
	reading sync.RWMutex
	closed  bool
}

// emit delivers a candle the way go-binance's read loop does: never after
// the connection has finished.
func (c *fakeConn) emit(candle model.Candle) {
	c.reading.RLock()
	defer c.reading.RUnlock()
	if c.closed {
		return
	}
	c.onCandle(candle)
}

func (f *fakeStream) connect(onCandle func(model.Candle), _ func(error)) (chan struct{}, chan struct{}, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.dials++
	if f.dials <= f.failures {
		return nil, nil, errors.New("dial failed")
	}
	conn := &fakeConn{onCandle: onCandle, done: make(chan struct{}), stop: make(chan struct{})}
	// Mimics go-binance: closing stop ends the read loop, which closes done.
	go func() {
		<-conn.stop
		f.mu.Lock()
		conn.stopped = true
		f.mu.Unlock()
		conn.reading.Lock()
		conn.closed = true
		conn.reading.Unlock()
		close(conn.done)
	}()
	f.conns = append(f.conns, conn)
	return conn.done, conn.stop, nil
}

func (f *fakeStream) conn(t *testing.T, i int) *fakeConn {
	t.Helper()
	require.Eventually(t, func() bool {
		f.mu.Lock()
		defer f.mu.Unlock()
		return len(f.conns) > i
	}, 5*time.Second, 10*time.Millisecond)
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.conns[i]
}

func receiveCandle(t *testing.T, ch chan model.Candle) model.Candle {
	t.Helper()
	select {
	case c, ok := <-ch:
		require.True(t, ok, "candle channel closed")
		return c
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for candle")
		return model.Candle{}
	}
}

func TestServeCandlesRetriesFailedDials(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream := &fakeStream{failures: 2}
	ccandle, cerr := serveCandles(ctx, stream.connect)

	// Both dial errors are reported, then the stream connects anyway.
	for range 2 {
		select {
		case err := <-cerr:
			require.EqualError(t, err, "dial failed")
		case <-time.After(5 * time.Second):
			t.Fatal("timed out waiting for dial error")
		}
	}
	conn := stream.conn(t, 0)
	go conn.emit(model.Candle{Pair: "BTCUSDT", Close: 1})
	require.Equal(t, 1.0, receiveCandle(t, ccandle).Close)
}

func TestServeCandlesReconnectsAfterDisconnect(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream := &fakeStream{}
	ccandle, _ := serveCandles(ctx, stream.connect)

	first := stream.conn(t, 0)
	close(first.stop) // the server drops the connection

	second := stream.conn(t, 1)
	go second.emit(model.Candle{Pair: "BTCUSDT", Close: 2})
	require.Equal(t, 2.0, receiveCandle(t, ccandle).Close)
}

func TestServeCandlesStopsOnCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	stream := &fakeStream{}
	ccandle, cerr := serveCandles(ctx, stream.connect)
	conn := stream.conn(t, 0)

	// A handler blocked on an unread candle must not keep the stream alive.
	handlerDone := make(chan struct{})
	go func() {
		conn.emit(model.Candle{Pair: "BTCUSDT"})
		close(handlerDone)
	}()
	cancel()

	select {
	case <-handlerDone:
	case <-time.After(5 * time.Second):
		t.Fatal("handler still blocked after cancel")
	}
	require.Eventually(t, func() bool {
		_, candleOpen := <-ccandle
		_, errOpen := <-cerr
		return !candleOpen && !errOpen
	}, 5*time.Second, 10*time.Millisecond)

	stream.mu.Lock()
	defer stream.mu.Unlock()
	require.True(t, conn.stopped, "websocket was not closed")
	require.Equal(t, 1, stream.dials, "no reconnect after cancel")
}
