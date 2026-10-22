import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { BacktestResultPage } from '@/features/backtesting/BacktestResultPage';
import { BacktestSetupPage } from '@/features/backtesting/BacktestSetupPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TelegramSettingsPage } from '@/features/settings/TelegramSettingsPage';
import { StrategyGuidePage } from '@/features/strategies/StrategyGuidePage';
import { SignalDetailPage } from '@/features/signals/SignalDetailPage';
import { SignalListPage } from '@/features/signals/SignalListPage';
import { SignalSetupPage } from '@/features/signals/SignalSetupPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          <Route path="backtesting">
            <Route index element={<BacktestSetupPage />} />
            <Route path="dashboard" element={<BacktestResultPage />} />
          </Route>

          <Route path="realtime-signals">
            <Route index element={<SignalListPage />} />
            <Route path="setup" element={<SignalSetupPage />} />
            <Route path=":id" element={<SignalDetailPage />} />
          </Route>

          <Route path="strategies" element={<StrategyGuidePage />} />
          <Route path="settings" element={<TelegramSettingsPage />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
