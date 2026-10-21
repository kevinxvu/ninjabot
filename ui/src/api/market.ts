import { api } from './client';
import type { MarketCandle, PairInfo, Portfolio } from './types';

export const marketApi = {
  /** All tradable pair symbols known by the server. */
  listPairs: () => api.get<{ pairs: string[] | null }>('/api/pairs').then((res) => res.pairs ?? []),

  /** Asset/quote/logo details for the given pairs. */
  getPairsInfo: (pairs: string[]) =>
    api.get<Record<string, PairInfo>>('/api/pairs', { params: { pairs: pairs.join(',') } }),

  getTickers: (pairs: string[]) =>
    api.get<Record<string, number>>('/api/market/tickers', { params: { pairs: pairs.join(',') } }),

  getCandles: (pair: string, timeframe: string) =>
    api.get<MarketCandle[] | null>('/api/market/candles', { params: { pair, timeframe } }),

  getPortfolio: () => api.get<Portfolio>('/api/market/portfolio'),
};
