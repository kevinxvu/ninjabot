import { Link } from 'react-router-dom';
import { Activity, Plus } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { signalsApi } from '@/api/signals';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useAsync } from '@/hooks/useAsync';
import { SessionCard } from './components/SessionCard';
import { useSessionActions } from './useSessionActions';

export function SignalListPage() {
  const sessions = useAsync('signal-sessions', signalsApi.list);
  const actions = useSessionActions(sessions.reload);

  return (
    <>
      <PageHeader
        icon={<Activity />}
        title="Realtime Signals"
        description="Manage your paper-trading bot sessions"
        actions={
          <Button asChild>
            <Link to="/realtime-signals/setup">
              <Plus /> New Session
            </Link>
          </Button>
        }
      />

      {actions.error && <ErrorAlert message={actions.error} className="mb-6" />}

      {sessions.loading ? (
        <LoadingState />
      ) : sessions.error ? (
        <ErrorAlert message={getErrorMessage(sessions.error, 'Failed to load sessions')} />
      ) : !sessions.data?.length ? (
        <EmptyState
          icon={<Activity />}
          title="No active signals"
          description="Start a new realtime session to generate signals."
          action={
            <Button asChild variant="link">
              <Link to="/realtime-signals/setup">+ Create your first session</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sessions.data.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              pending={actions.isPending(session.id)}
              onStop={() => actions.stop(session.id)}
              onResume={() => actions.resume(session.id)}
              onDelete={() => actions.requestDelete(session.id)}
            />
          ))}
        </div>
      )}

      {actions.confirmDialog}
    </>
  );
}
