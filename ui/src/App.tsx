import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { Chart } from './pages/Chart';
import { Dashboard } from './pages/Dashboard';
import { SetupSignal } from './pages/SetupSignal';
import { SignalDashboard } from './pages/SignalDashboard';
import { SignalsList } from './pages/SignalsList';
import './index.css';

function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Set Dashboard as the default route */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/backtesting" element={<Home />} />
        <Route path="/chart" element={<Chart />} />
        
        {/* Realtime Signals Routes */}
        <Route path="/realtime-signals" element={<SignalsList />} />
        <Route path="/realtime-signals/setup" element={<SetupSignal />} />
        <Route path="/realtime-signals/:id" element={<SignalDashboard />} />

        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        
        {/* Placeholder routes for the sidebar menu items */}
        <Route path="/futuremarket" element={<Dashboard />} />
        <Route path="/paperwallet" element={<SignalsList />} />
        <Route path="/spotmarket" element={<Dashboard />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
