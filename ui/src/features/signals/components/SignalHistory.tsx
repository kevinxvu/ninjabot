import type { Order, SessionEvent } from '@/api/types';
import { formatClientDateTime, toEpochMs } from '@/lib/time';
import { cn } from '@/lib/utils';

type HistoryItem =
  | { kind: 'event'; time: SessionEvent['created_at']; event: SessionEvent }
  | { kind: 'order'; time: Order['created_at']; order: Order };

const EVENT_DESCRIPTIONS: Record<string, string> = {
  STOP: 'Paused realtime tracking',
  RESUME: 'Resumed realtime tracking',
  START: 'Started realtime tracking',
};

/** Session lifecycle events and orders merged into one timeline, newest first. */
export function SignalHistory({ events, orders }: { events: SessionEvent[]; orders: Order[] }) {
  const items: HistoryItem[] = [
    ...events.map((event): HistoryItem => ({ kind: 'event', time: event.created_at, event })),
    ...orders.map((order): HistoryItem => ({
      kind: 'order',
      time: order.created_at || order.updated_at,
      order,
    })),
  ].sort((a, b) => toEpochMs(b.time) - toEpochMs(a.time));

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No signals yet...</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, index) =>
        item.kind === 'event' ? (
          <HistoryEntry
            key={`event-${item.event.id ?? index}`}
            tone={item.event.type === 'STOP' ? 'warning' : 'success'}
            title={item.event.type}
            aside="Session"
            detail={EVENT_DESCRIPTIONS[item.event.type] ?? item.event.type}
            time={item.event.created_at}
          />
        ) : (
          <HistoryEntry
            key={`order-${item.order.id ?? index}`}
            tone={item.order.side === 'BUY' ? 'success' : 'destructive'}
            title={item.order.side}
            aside={`$${item.order.price?.toFixed(4)}`}
            detail={`Qty: ${item.order.quantity}`}
            time={item.time}
          />
        ),
      )}
    </ul>
  );
}

const TONE_CLASS = {
  success: { box: 'border-success/30 bg-success-soft', title: 'text-success' },
  warning: { box: 'border-warning/30 bg-warning-soft', title: 'text-warning' },
  destructive: { box: 'border-destructive/30 bg-destructive-soft', title: 'text-destructive' },
};

function HistoryEntry({
  tone,
  title,
  aside,
  detail,
  time,
}: {
  tone: keyof typeof TONE_CLASS;
  title: string;
  aside: string;
  detail: string;
  time: Order['created_at'];
}) {
  return (
    <li className={cn('rounded-md border p-3 text-sm', TONE_CLASS[tone].box)}>
      <div className="mb-1 flex justify-between font-bold">
        <span className={TONE_CLASS[tone].title}>{title}</span>
        <span className="text-muted-foreground tabular-nums">{aside}</span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{detail}</span>
        <span>{formatClientDateTime(time)}</span>
      </div>
    </li>
  );
}
