import { useState } from 'react';
import { coinIconUrl } from '@/lib/pairs';
import { cn } from '@/lib/utils';

/** Coin logo with a letter fallback when the image cannot be loaded. */
export function CoinIcon({ asset, src, className }: { asset: string; src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const classes = cn('size-8 shrink-0 rounded-full bg-white shadow-sm', className);

  if (failed || !asset) {
    return (
      <div
        className={cn(
          classes,
          'flex items-center justify-center bg-muted text-xs font-bold text-muted-foreground',
        )}
      >
        {asset.slice(0, 3)}
      </div>
    );
  }

  return (
    <img src={src || coinIconUrl(asset)} alt={asset} className={classes} onError={() => setFailed(true)} />
  );
}
