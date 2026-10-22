import { api } from './client';
import type { TelegramSettings, TelegramSettingsRequest } from './types';

const BASE = '/api/settings/telegram';

export const settingsApi = {
  getTelegram: () => api.get<TelegramSettings>(BASE),

  saveTelegram: (payload: TelegramSettingsRequest) => api.put<TelegramSettings>(BASE, payload),

  /** Sends a test message with the submitted (unsaved) values. */
  testTelegram: (payload: TelegramSettingsRequest) => api.post<{ status: string }>(`${BASE}/test`, payload),
};
