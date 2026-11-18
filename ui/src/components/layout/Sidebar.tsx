import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './navigation';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  );

function Brand({ className, labelClassName }: { className?: string; labelClassName?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-lg font-bold text-primary-foreground">
        T
      </div>
      <span className={cn('text-lg font-bold text-foreground', labelClassName)}>TradingBot</span>
    </div>
  );
}

/**
 * Fixed navigation from the `md` breakpoint: an icon rail on tablets (with tooltips),
 * the full labelled sidebar from `lg`. Phones use {@link MobileHeader} instead.
 */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-sidebar-border bg-sidebar md:flex lg:w-64">
      <Brand className="justify-center p-5 lg:justify-start lg:p-6" labelClassName="hidden lg:inline" />

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 lg:px-4">
        {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
          <Tooltip key={path}>
            <TooltipTrigger asChild>
              <NavLink
                to={path}
                aria-label={label}
                className={(state) => cn(linkClass(state), 'max-lg:justify-center')}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="lg:hidden">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </nav>
    </aside>
  );
}

/** Sticky top bar with a slide-in navigation drawer, shown below the `md` breakpoint. */
export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find((item) => pathname.startsWith(item.path));

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-sidebar/80 md:hidden">
      <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
      </Button>
      <Brand labelClassName="text-base" />
      {current && (
        <span className="ml-auto truncate text-sm font-medium text-muted-foreground">{current.label}</span>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] gap-0 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Go to a section of TradingBot</SheetDescription>
          <Brand className="p-6" />
          <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
            {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
              <NavLink key={path} to={path} className={linkClass} onClick={() => setOpen(false)}>
                <Icon className="size-[18px]" />
                {label}
              </NavLink>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
