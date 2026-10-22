import { Play, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { OrderSide, SessionStatus } from '@/api/types';

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const running = status === 'running';
  return (
    <Badge variant={running ? 'success' : 'muted'} className="font-semibold uppercase">
      {running ? <Play /> : <Square />}
      {status}
    </Badge>
  );
}

export function OrderSideBadge({ side }: { side: OrderSide | string }) {
  return (
    <Badge variant={side === 'BUY' ? 'success' : 'danger'} className="font-bold tracking-wider uppercase">
      {side}
    </Badge>
  );
}
