import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="ml-64 min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
