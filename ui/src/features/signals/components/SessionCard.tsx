import { Play, Square, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SignalSession } from '@/api/types';
import { KeyValueList } from '@/components/common/KeyValueList';
import { SessionStatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { toClientDate } from '@/lib/time';

interface SessionCardProps {
  session: SignalSession;
  pending: boolean;
  onStop: () => void;
  onResume: () => void;
  onDelete: () => void;
}

export function SessionCard({ session, pending, onStop, onResume, onDelete }: SessionCardProps) {
  const navigate = useNavigate();
  const running = session.status === 'running';

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/realtime-signals/${session.id}`)}
      onKeyDown={(event) => event.key === 'Enter' && navigate(`/realtime-signals/${session.id}`)}
      className="cursor-pointer rounded-xl border bg-card p-5 shadow-card transition-shadow outline-none hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="text-lg font-bold">{session.pair}</div>
        <SessionStatusBadge status={session.status} />
      </div>

      <KeyValueList
        className="mb-4 divide-y-0"
        items={[
          { label: 'Strategy', value: `${session.strategy} (${session.timeframe})` },
          { label: 'Initial Capital', value: `${session.initial_amount} ${session.initial_asset}` },
          { label: 'Started', value: toClientDate(session.created_at)?.toLocaleDateString() ?? '-' },
        ]}
      />

      {/* Buttons must not trigger the card navigation. */}
      <div className="flex items-center gap-2 border-t pt-4" onClick={(event) => event.stopPropagation()}>
        {running ? (
          <Button
            variant="outline"
            className="flex-1 text-warning hover:text-warning"
            disabled={pending}
            onClick={onStop}
          >
            <Square /> Stop
          </Button>
        ) : (
          <Button
            variant="outline"
            className="flex-1 text-success hover:text-success"
            disabled={pending}
            onClick={onResume}
          >
            <Play /> Resume
          </Button>
        )}
        <Button
          variant="outline"
          size={running ? 'icon' : 'default'}
          className={
            running
              ? 'text-destructive hover:text-destructive'
              : 'flex-1 text-destructive hover:text-destructive'
          }
          aria-label="Delete session"
          disabled={pending}
          onClick={onDelete}
        >
          <Trash2 /> {!running && 'Delete'}
        </Button>
      </div>
    </div>
  );
}
