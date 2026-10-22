import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { signalsApi } from '@/api/signals';
import { Button } from '@/components/ui/button';

/** Turns a session's Telegram alerts on/off; running bots pick the change up on the next signal. */
export function TelegramAlertToggle({
  sessionId,
  enabled,
  onChange,
  onError,
}: {
  sessionId: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  /** Receives the failure message, or null when a new attempt starts. */
  onError: (message: string | null) => void;
}) {
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    setPending(true);
    onError(null);
    try {
      const res = await signalsApi.setTelegramAlerts(sessionId, !enabled);
      onChange(res.telegram_alerts);
    } catch (err) {
      onError(getErrorMessage(err, 'Failed to update Telegram alerts'));
    } finally {
      setPending(false);
    }
  };

  const label = enabled ? 'Telegram alerts on' : 'Telegram alerts off';
  return (
    <Button
      variant="outline"
      className={enabled ? 'text-primary hover:text-primary' : 'text-muted-foreground'}
      disabled={pending}
      aria-pressed={enabled}
      title={enabled ? 'Click to stop Telegram alerts' : 'Click to send Telegram alerts'}
      onClick={() => void toggle()}
    >
      {enabled ? <Bell /> : <BellOff />} {label}
    </Button>
  );
}
