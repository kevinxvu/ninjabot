import { useEffect, useLayoutEffect, useRef } from 'react';
import type { MarketSocketMessage } from '@/api/types';

interface UseMarketSocketOptions {
  /** Pair/timeframe to stream candles for. Ticker messages are always broadcast. */
  pair?: string;
  timeframe?: string;
  enabled?: boolean;
  onMessage: (message: MarketSocketMessage) => void;
}

function marketSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/market`;
}

/** Opens /ws/market for the lifetime of the component and subscribes to candle updates. */
export function useMarketSocket({ pair, timeframe, enabled = true, onMessage }: UseMarketSocketOptions) {
  const handlerRef = useRef(onMessage);
  useLayoutEffect(() => {
    handlerRef.current = onMessage;
  });

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(marketSocketUrl());

    ws.onopen = () => {
      if (pair && timeframe) {
        ws.send(JSON.stringify({ action: 'SUBSCRIBE_CANDLE', pair, timeframe }));
      }
    };

    ws.onmessage = (event) => {
      try {
        handlerRef.current(JSON.parse(event.data) as MarketSocketMessage);
      } catch (error) {
        console.error('Invalid market websocket message', error);
      }
    };

    ws.onerror = (event) => console.error('Market websocket error', event);

    return () => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [enabled, pair, timeframe]);
}
