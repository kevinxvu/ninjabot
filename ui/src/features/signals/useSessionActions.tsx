import { useState } from 'react';
import { getErrorMessage } from '@/api/client';
import { signalsApi } from '@/api/signals';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

/**
 * Stop / resume / delete for realtime signal sessions.
 * Render `confirmDialog` once; `requestDelete` opens it.
 */
export function useSessionActions(onChanged: (action: 'stop' | 'resume' | 'delete', id: string) => void) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: 'stop' | 'resume' | 'delete', id: string) => {
    setPendingId(id);
    setError(null);
    try {
      if (action === 'stop') await signalsApi.stop(id);
      else if (action === 'resume') await signalsApi.resume(id);
      else await signalsApi.remove(id);
      onChanged(action, id);
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} session`));
    } finally {
      setPendingId(null);
    }
  };

  const confirmDialog = (
    <ConfirmDialog
      open={deleteId !== null}
      onOpenChange={(open) => !open && setDeleteId(null)}
      title="Delete this session?"
      description="The session, its orders and signal history will be permanently removed."
      confirmLabel="Delete"
      destructive
      onConfirm={() => deleteId && run('delete', deleteId)}
    />
  );

  return {
    stop: (id: string) => run('stop', id),
    resume: (id: string) => run('resume', id),
    requestDelete: setDeleteId,
    isPending: (id: string) => pendingId === id,
    error,
    confirmDialog,
  };
}
