import type { Portfolio } from '@/api/types';
import { CoinIcon } from '@/components/common/CoinIcon';
import { SectionCard } from '@/components/common/SectionCard';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUsd } from '@/lib/format';

interface PortfolioCardProps {
  portfolio?: Portfolio;
  loading: boolean;
}

/** Binance account value in USDT and its per-asset breakdown. */
export function PortfolioCard({ portfolio, loading }: PortfolioCardProps) {
  const hasValue = portfolio && !portfolio.error;
  const assets = hasValue ? [...(portfolio.assets ?? [])].sort((a, b) => b.value_usdt - a.value_usdt) : [];

  return (
    <SectionCard title="My Portfolio" description="Binance spot balance valued in USDT">
      {loading ? (
        <Skeleton className="h-9 w-40" />
      ) : (
        <div className="text-3xl font-bold tabular-nums">
          {formatUsd(hasValue ? portfolio.total_value_usdt : 0)}
        </div>
      )}

      {portfolio?.error && (
        <p className="mt-2 text-xs text-muted-foreground" title={portfolio.error}>
          Balance unavailable — check the Binance API key configuration.
        </p>
      )}

      {assets.length > 0 && (
        <ul className="mt-5 divide-y border-t">
          {assets.map((item) => (
            <li key={item.asset} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <CoinIcon asset={item.asset} className="size-6" />
                {item.asset}
              </span>
              <span className="tabular-nums">{formatUsd(item.value_usdt)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
