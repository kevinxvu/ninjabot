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
  const name = info?.Asset || asset;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <CoinIcon asset={name} src={info?.Logo} />
        <div>
          <h3 className="text-sm font-semibold">
            {asset}-{quote === 'USDT' ? 'USD' : quote}
          </h3>
          <p className="text-xs text-muted-foreground">{name} USD</p>
        </div>
      </div>
      <div className="mt-4 text-2xl font-bold tabular-nums">{formatUsd(price ?? 0)}</div>
    </div>
  );
}
