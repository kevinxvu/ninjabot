
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LineChart, Wallet, PieChart, Activity } from 'lucide-react';

export function Sidebar() {
  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard size={18} />, path: '/dashboard' },
    { name: 'Backtesting', icon: <Activity size={18} />, path: '/backtesting' },
    { name: 'Future Market', icon: <LineChart size={18} />, path: '/futuremarket' },
    { name: 'Paper Wallet', icon: <Wallet size={18} />, path: '/paperwallet' },
    { name: 'Spot Market', icon: <PieChart size={18} />, path: '/spotmarket' },
  ];

  return (
    <div className="w-64 h-screen bg-[var(--bg-primary)] border-r border-[var(--border-color)] flex flex-col fixed left-0 top-0 overflow-y-auto">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-[var(--brand-accent)] text-white flex items-center justify-center font-bold text-lg">
          T
        </div>
        <span className="font-bold text-lg text-[var(--text-primary)]">TradingBot</span>
      </div>
      
      <div className="flex-1 px-4 py-2 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive 
                  ? 'bg-[var(--brand-accent)] text-white' 
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
              }`
            }
          >
            {item.icon}
            {item.name}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
