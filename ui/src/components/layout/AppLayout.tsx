import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MobileHeader, Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-dvh bg-background text-foreground">
        <Sidebar />
        <MobileHeader />
        <main className="min-w-0 p-4 sm:p-6 md:ml-[72px] lg:ml-64">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
