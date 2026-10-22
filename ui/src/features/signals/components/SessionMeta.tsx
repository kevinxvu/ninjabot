import { Activity, Calendar, Clock, DollarSign } from 'lucide-react';
import type { SignalSession } from '@/api/types';
import { formatClientDateTime } from '@/lib/time';

/** Strategy / timeframe / capital / start time line plus wallet balances. */
export function SessionMeta({ session }: { session: SignalSession }) {
  const emaPeriods =
    session.strategy === 'emacross' && session.fast_period && session.slow_period
      ? ` (${session.fast_period}/${session.slow_period})`
      : '';
  const items = [
    {
      icon: <Activity className="text-primary" />,
      content: <strong>{`${session.strategy}${emaPeriods}`}</strong>,
    },
    { icon: <Clock className="text-warning" />, content: <strong>{session.timeframe}</strong> },
    {
      icon: <DollarSign className="text-success" />,
      content: (
        <>
          Initial: <strong>{`${session.initial_amount} ${session.initial_asset}`}</strong>
        </>
      ),
    },
    {
      icon: <Calendar className="text-blue-500" />,
      content: (
        <>
          Started: <strong>{formatClientDateTime(session.created_at)}</strong>
        </>
      ),
    },
  ];

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {items.map((item, index) => (
          <span key={index} className="flex items-center gap-1.5 [&_svg]:size-3.5">
            {item.icon}
            {item.content}
          </span>
        ))}
      </div>

      {!!session.balances?.length && (
        <div className="mt-3 inline-flex flex-wrap gap-2 rounded-lg border bg-muted p-2">
          <span className="self-center label-style">Wallet:</span>
          {session.balances.map((balance) => (
            <span
              key={balance.Asset}
              className="rounded bg-card px-2 py-1 text-xs font-medium tabular-nums shadow-sm"
            >
              {balance.Free.toFixed(4)} <span className="text-muted-foreground">{balance.Asset}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
