import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Play, Settings2 } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { marketApi } from '@/api/market';
import { signalsApi } from '@/api/signals';
import type { StartSignalRequest } from '@/api/types';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { FormField } from '@/components/common/FormField';
import { FormSection } from '@/components/common/FormSection';
import { PageHeader } from '@/components/layout/PageHeader';
import { PairSelect } from '@/components/market/PairSelect';
import { TimeframeSelect } from '@/components/market/TimeframeSelect';
import { REALTIME_TIMEFRAME_OPTIONS } from '@/components/market/timeframes';
import { StrategyFields } from '@/components/strategy/StrategyFields';
import { REALTIME_STRATEGIES } from '@/components/strategy/strategies';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAsync } from '@/hooks/useAsync';
import { splitPair } from '@/lib/pairs';

const DEFAULT_FORM: StartSignalRequest = {
  pair: 'BTCUSDT',
  timeframe: '1h',
  strategy: 'emacross',
  initial_asset: 'USDT',
  initial_amount: 1000,
  fast_period: 8,
  slow_period: 21,
};

export function SignalSetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefer the server's asset/quote split; fall back to suffix matching while it loads.
  const pairInfo = useAsync(`pair-info:${form.pair}`, () =>
    marketApi.getPairsInfo([form.pair]).then((info) => info[form.pair] ?? null),
  );
  const fallback = splitPair(form.pair);
  const asset = pairInfo.data?.Asset ?? fallback.asset;
  const quote = pairInfo.data?.Quote ?? fallback.quote;
  // Default to the quote asset unless the user explicitly picked the base asset.
  const initialAsset = form.initial_asset === asset ? asset : quote;

  const update = (patch: Partial<StartSignalRequest>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = await signalsApi.start({ ...form, initial_asset: initialAsset });
      navigate(`/realtime-signals/${session.id}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to start signal'));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Card className="shadow-card">
        <CardContent className="p-8 pt-2">
          <PageHeader
            icon={<Activity />}
            title="New Realtime Signal"
            description="Run a strategy with real-time paper trading"
            className="mb-8"
          />

          <form onSubmit={handleSubmit} className="space-y-8">
            <FormSection icon={<Settings2 />} title="Environment">
              <div className="grid grid-cols-2 gap-5">
                <FormField label="Trading Pair" htmlFor="pair">
                  <PairSelect
                    id="pair"
                    value={form.pair}
                    onChange={(pair) => update({ pair, initial_asset: '' })}
                  />
                </FormField>
                <FormField label="Timeframe" htmlFor="timeframe">
                  <TimeframeSelect
                    id="timeframe"
                    value={form.timeframe}
                    options={REALTIME_TIMEFRAME_OPTIONS}
                    onChange={(timeframe) => update({ timeframe })}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <FormField label="Initial Asset" htmlFor="initial_asset">
                  <Select value={initialAsset} onValueChange={(value) => update({ initial_asset: value })}>
                    <SelectTrigger id="initial_asset" className="w-full bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={asset}>{asset} (Base)</SelectItem>
                      <SelectItem value={quote}>{quote} (Quote)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={`Initial Amount (${initialAsset})`} htmlFor="initial_amount">
                  <Input
                    id="initial_amount"
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={form.initial_amount}
                    onChange={(event) => update({ initial_amount: Number(event.target.value) })}
                  />
                </FormField>
              </div>
            </FormSection>

            <StrategyFields values={form} strategies={REALTIME_STRATEGIES} onChange={update} />

            <div className="space-y-4 pt-2">
              {error && <ErrorAlert message={error} />}
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={submitting}>
                {!submitting && <Play className="fill-current" />}
                {submitting ? 'Starting...' : 'Start Realtime Session'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
