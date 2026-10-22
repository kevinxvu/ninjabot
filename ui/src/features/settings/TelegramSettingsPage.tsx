import { useState, type FormEvent, type ReactNode } from 'react';
import { Bell, CheckCircle2, Info, KeyRound, Save, Send } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { settingsApi } from '@/api/settings';
import type { TelegramSettings, TelegramSettingsRequest } from '@/api/types';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { FormField } from '@/components/common/FormField';
import { FormSection } from '@/components/common/FormSection';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAsync } from '@/hooks/useAsync';
import { formatClientDateTime } from '@/lib/time';

export function TelegramSettingsPage() {
  const settings = useAsync('telegram-settings', settingsApi.getTelegram);

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Card className="shadow-card">
        <CardContent className="p-8 pt-2">
          <PageHeader
            icon={<Send />}
            title="Telegram Alerts"
            description="Get a Telegram message when a realtime signal session buys or sells"
            className="mb-8"
          />
          {settings.loading && <LoadingState />}
          {!!settings.error && !settings.data && (
            <ErrorAlert message={getErrorMessage(settings.error, 'Failed to load settings')} />
          )}
          {/* Keyed so the form re-initialises from the saved values after each save. */}
          {settings.data && (
            <TelegramSettingsForm
              key={settings.data.updated_at ?? 'new'}
              saved={settings.data}
              onSaved={(next) => settings.mutate(() => next)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function toRequest(saved: TelegramSettings): TelegramSettingsRequest {
  return {
    enabled: saved.enabled,
    bot_token: '',
    chat_id: saved.chat_id,
    notify_buy: saved.notify_buy,
    notify_sell: saved.notify_sell,
    notify_session_events: saved.notify_session_events,
    silent: saved.silent,
  };
}

function TelegramSettingsForm({
  saved,
  onSaved,
}: {
  saved: TelegramSettings;
  onSaved: (settings: TelegramSettings) => void;
}) {
  const [form, setForm] = useState(() => toRequest(saved));
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const update = (patch: Partial<TelegramSettingsRequest>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setNotice(null);
  };

  const hasToken = saved.has_token || form.bot_token.trim() !== '';
  const canSend = hasToken && form.chat_id.trim() !== '';

  const run = async (action: 'save' | 'test') => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      if (action === 'save') {
        onSaved(await settingsApi.saveTelegram(form));
      } else {
        await settingsApi.testTelegram(form);
        setNotice('Test message sent. Check your Telegram chat.');
      }
    } catch (err) {
      setError(
        getErrorMessage(err, action === 'save' ? 'Failed to save settings' : 'Failed to send test message'),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run('save');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Alert>
        <Info />
        <AlertTitle>Signals only</AlertTitle>
        <AlertDescription>
          Alerts describe what a strategy did on its paper wallet. Nothing is traded on your Binance account.
        </AlertDescription>
      </Alert>

      <FormSection icon={<KeyRound />} title="Bot Connection">
        <SwitchRow
          id="enabled"
          label="Enable Telegram alerts"
          description="Master switch. Each realtime session can also turn its alerts on or off."
          checked={form.enabled}
          onChange={(enabled) => update({ enabled })}
          trailing={
            <Badge variant={saved.enabled ? 'success' : 'muted'}>{saved.enabled ? 'Active' : 'Off'}</Badge>
          }
        />

        <FormField
          label="Bot Token"
          htmlFor="bot_token"
          hint={
            saved.has_token ? (
              <>
                Saved token <code>{saved.token_hint}</code>. Leave blank to keep it.
              </>
            ) : (
              <>
                Create a bot with <strong>@BotFather</strong> (<code>/newbot</code>) and paste the token it
                gives you.
              </>
            )
          }
        >
          <Input
            id="bot_token"
            type="password"
            autoComplete="off"
            placeholder={saved.has_token ? saved.token_hint : '123456789:AAH...'}
            value={form.bot_token}
            onChange={(event) => update({ bot_token: event.target.value })}
          />
        </FormField>

        <FormField
          label="Chat ID"
          htmlFor="chat_id"
          hint={
            <>
              Your numeric user ID (ask <strong>@userinfobot</strong>), a group ID like <code>-100…</code> or
              a channel <code>@name</code>. Send <code>/start</code> to your bot first so it is allowed to
              message you.
            </>
          }
        >
          <Input
            id="chat_id"
            autoComplete="off"
            placeholder="123456789"
            value={form.chat_id}
            onChange={(event) => update({ chat_id: event.target.value })}
          />
        </FormField>
      </FormSection>

      <FormSection icon={<Bell />} title="Notifications">
        <SwitchRow
          id="notify_buy"
          label="BUY signals"
          description="Pair, price, quantity and value of each buy."
          checked={form.notify_buy}
          onChange={(notify_buy) => update({ notify_buy })}
        />
        <SwitchRow
          id="notify_sell"
          label="SELL signals"
          description="Same details plus the trade result of the closed position."
          checked={form.notify_sell}
          onChange={(notify_sell) => update({ notify_sell })}
        />
        <SwitchRow
          id="notify_session_events"
          label="Session start / stop"
          description="A message when a session with alerts is started, resumed or stopped."
          checked={form.notify_session_events}
          onChange={(notify_session_events) => update({ notify_session_events })}
        />
        <SwitchRow
          id="silent"
          label="Silent messages"
          description="Deliver without a notification sound."
          checked={form.silent}
          onChange={(silent) => update({ silent })}
        />
      </FormSection>

      <div className="space-y-4 pt-2">
        {error && <ErrorAlert message={error} />}
        {notice && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" /> {notice}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 sm:flex-1"
            disabled={!canSend || busy !== null}
            onClick={() => void run('test')}
          >
            <Send /> {busy === 'test' ? 'Sending...' : 'Send Test Message'}
          </Button>
          <Button type="submit" size="lg" className="h-12 sm:flex-1" disabled={busy !== null}>
            <Save /> {busy === 'save' ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
        {saved.updated_at && (
          <p className="text-center text-xs text-muted-foreground">
            Last saved {formatClientDateTime(saved.updated_at)}
          </p>
        )}
      </div>
    </form>
  );
}

function SwitchRow({
  id,
  label,
  description,
  checked,
  onChange,
  trailing,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          {label}
          {trailing}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
