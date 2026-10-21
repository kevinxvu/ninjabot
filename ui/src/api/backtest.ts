import { api } from './client';
import type { BacktestRequest, BacktestSummary, ChartData } from './types';

export const backtestApi = {
  run: (payload: BacktestRequest) => api.post<{ pairs?: string[] }>('/api/backtest', payload),

  getChartData: (pair: string) => api.get<ChartData>('/api/data', { params: { pair } }),

  getSummary: () => api.get<BacktestSummary>('/api/summary'),

  historyCsvUrl: (pair: string) => `/api/history?pair=${encodeURIComponent(pair)}`,
};
