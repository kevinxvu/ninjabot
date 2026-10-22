import { api } from './client';
import type { ChartData, SignalSession, StartSignalRequest } from './types';

const BASE = '/api/realtime-signals';

export const signalsApi = {
  list: () => api.get<SignalSession[] | null>(BASE).then((res) => res ?? []),

  get: (id: string) => api.get<SignalSession>(`${BASE}/${id}`),

  getChart: (id: string) => api.get<ChartData>(`${BASE}/${id}/chart`),

  start: (payload: StartSignalRequest) => api.post<SignalSession>(`${BASE}/start`, payload),

  stop: (id: string) => api.post(`${BASE}/${id}/stop`),

  resume: (id: string) => api.post(`${BASE}/${id}/resume`),

  setTelegramAlerts: (id: string, enabled: boolean) =>
    api.post<{ telegram_alerts: boolean }>(`${BASE}/${id}/telegram`, { enabled }),

  remove: (id: string) => api.delete(`${BASE}/${id}`),
};
