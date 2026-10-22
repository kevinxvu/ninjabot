import { Activity, LayoutDashboard, Zap, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Backtesting', path: '/backtesting', icon: Activity },
  { label: 'Realtime Signals', path: '/realtime-signals', icon: Zap },
];
