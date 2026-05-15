import { Search, Bell, User, Maximize } from 'lucide-react';

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="h-16 bg-[var(--bg-primary)] border-b border-[var(--border-color)] flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center w-64 md:w-96 bg-[var(--bg-secondary)] rounded-lg px-3 py-2 border border-[var(--border-color)]">
          <Search size={16} className="text-[var(--text-tertiary)] mr-2" />
          <input 
            type="text" 
            placeholder="Search" 
            className="bg-transparent border-none outline-none w-full text-sm text-[var(--text-primary)]"
          />
        </div>
        {children}
      </div>
      <div className="flex items-center gap-4 text-[var(--text-secondary)]">
        <button className="hover:text-[var(--brand-accent)]"><Maximize size={20} /></button>
        <button className="hover:text-[var(--brand-accent)]"><Bell size={20} /></button>
        <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center border border-[var(--border-color)]">
          <User size={16} />
        </div>
      </div>
    </header>
  );
}
