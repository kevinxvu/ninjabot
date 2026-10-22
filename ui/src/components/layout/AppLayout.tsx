import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="ml-64 min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
