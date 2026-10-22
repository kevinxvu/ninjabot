import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './navigation';

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-3 p-6">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-lg font-bold text-primary-foreground">
          T
        </div>
        <span className="text-lg font-bold text-foreground">TradingBot</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
        {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
