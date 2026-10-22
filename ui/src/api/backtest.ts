import { api } from './client';
import type { BacktestRequest, BacktestSummary, ChartData } from './types';

/** Backtests run synchronously on the server (bounded there by 30 minutes). */
const BACKTEST_TIMEOUT_MS = 30 * 60 * 1000;

export const backtestApi = {
  run: (payload: BacktestRequest) =>
    api.post<{ pairs?: string[] }>('/api/backtest', payload, { timeout: BACKTEST_TIMEOUT_MS }),

  getChartData: (pair: string) => api.get<ChartData>('/api/data', { params: { pair } }),

  getSummary: () => api.get<BacktestSummary>('/api/summary'),

  historyCsvUrl: (pair: string) => `/api/history?pair=${encodeURIComponent(pair)}`,
};
