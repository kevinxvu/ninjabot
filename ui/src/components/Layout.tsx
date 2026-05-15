import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function Layout({ children, headerChildren }: { children: React.ReactNode, headerChildren?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex text-[var(--text-primary)]">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <Header>{headerChildren}</Header>
        <main className="p-6 flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
