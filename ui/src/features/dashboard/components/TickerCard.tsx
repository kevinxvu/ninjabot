import type { PairInfo } from '@/api/types';
import { CoinIcon } from '@/components/common/CoinIcon';
import { formatUsd } from '@/lib/format';
import { splitPair } from '@/lib/pairs';

interface TickerCardProps {
  pair: string;
  price?: number;
  info?: PairInfo;
}

export function TickerCard({ pair, price, info }: TickerCardProps) {
  const { asset, quote } = splitPair(pair);
  const name = info?.asset || asset;

  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-2">
        <CoinIcon asset={name} src={info?.logo} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {asset}-{quote === 'USDT' ? 'USD' : quote}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{name} USD</p>
        </div>
      </div>
      <div className="mt-3 truncate text-lg font-bold tabular-nums sm:mt-4 sm:text-2xl">
        {formatUsd(price ?? 0)}
      </div>
    </div>
  );
}
