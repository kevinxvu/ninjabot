import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Play, Settings2 } from 'lucide-react';
import { backtestApi } from '@/api/backtest';
import { getErrorMessage } from '@/api/client';
import type { BacktestRequest } from '@/api/types';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { FormField } from '@/components/common/FormField';
import { FormSection } from '@/components/common/FormSection';
import { MoneyInput } from '@/components/common/MoneyInput';
import { Spinner } from '@/components/common/Spinner';
import { PageHeader } from '@/components/layout/PageHeader';
import { PairMultiSelect } from '@/components/market/PairMultiSelect';
import { TimeframeSelect } from '@/components/market/TimeframeSelect';
import { StrategyFields, type StrategyValues } from '@/components/strategy/StrategyFields';
import { getStrategy } from '@/components/strategy/strategies';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { parsePairList } from '@/lib/pairs';
import { readJsonStorage, writeStorage } from '@/lib/storage';

const CONFIG_STORAGE_KEY = 'ninjabot_backtest_config';
const MAX_PAIRS = 5;

const DEFAULT_CONFIG: BacktestRequest = {
  pairs: 'BTCUSDT,ETHUSDT',
  timeframe: '1h',
  days: 60,
  initial_capital: 10000,
  strategy: 'emacross',
  fast_period: 8,
  slow_period: 21,
  dca_interval: 7,
  dca_buy_amount: 100,
};

/** Restores the last submitted configuration. */
function loadConfig(): BacktestRequest {
  return { ...DEFAULT_CONFIG, ...readJsonStorage<Partial<BacktestRequest>>(CONFIG_STORAGE_KEY) };
}

export function BacktestSetupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(loadConfig);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pairs = parsePairList(form.pairs);
  const fixedTimeframe = getStrategy(form.strategy)?.fixedTimeframe;

  const update = (patch: Partial<BacktestRequest>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleStrategyChange = (patch: Partial<StrategyValues>) => {
    const fixed = patch.strategy ? getStrategy(patch.strategy)?.fixedTimeframe : undefined;
    update({ ...patch, ...(fixed ? { timeframe: fixed } : {}) });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pairs.length === 0) {
      setError('Please select at least one trading pair.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = { ...form, pairs: pairs.join(',') };
      await backtestApi.run(payload);
      writeStorage(CONFIG_STORAGE_KEY, JSON.stringify(payload));
      navigate(`/backtesting/dashboard?pair=${encodeURIComponent(pairs[0])}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Backtest failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl py-6">
      <Card className="shadow-card">
        <CardContent className="p-8 pt-2">
          <PageHeader
            icon={<Activity />}
            title="New Backtest"
            description="Configure parameters for historical simulation"
            className="mb-8"
          />

          <form onSubmit={handleSubmit} className="space-y-8">
            <FormSection icon={<Settings2 />} title="Environment">
              <FormField
                label={
                  <>
                    Trading Pairs{' '}
                    <span className="tracking-normal text-muted-foreground/70 lowercase">
                      (max {MAX_PAIRS})
                    </span>
                  </>
                }
                htmlFor="pairs"
              >
                <PairMultiSelect
                  id="pairs"
                  value={pairs}
                  maxPairs={MAX_PAIRS}
                  onChange={(next) => update({ pairs: next.join(',') })}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-5">
                <FormField
                  label="Timeframe"
                  htmlFor="timeframe"
                  hint={fixedTimeframe && 'Fixed by the selected strategy.'}
                >
                  <TimeframeSelect
                    id="timeframe"
                    value={form.timeframe}
                    disabled={Boolean(fixedTimeframe)}
                    onChange={(timeframe) => update({ timeframe })}
                  />
                </FormField>
                <FormField label="History (days)" htmlFor="days">
                  <Input
                    id="days"
                    type="number"
                    min={7}
                    max={365}
                    required
                    value={form.days}
                    onChange={(event) => update({ days: Number(event.target.value) })}
                  />
                </FormField>
              </div>

              <FormField label="Initial Capital (USDT)" htmlFor="initial_capital">
                <MoneyInput
                  id="initial_capital"
                  min={100}
                  step={100}
                  required
                  value={form.initial_capital}
                  onChange={(event) => update({ initial_capital: Number(event.target.value) })}
                />
              </FormField>
            </FormSection>

            <StrategyFields values={form} onChange={handleStrategyChange} />

            <div className="space-y-4 pt-2">
              {error && <ErrorAlert message={error} />}

              {submitting && !error && (
                <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted p-4 text-center text-sm font-medium text-muted-foreground">
                  <Spinner />
                  Analyzing historical data & executing strategy...
                </div>
              )}

              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={submitting}>
                {!submitting && <Play className="fill-current" />}
                {submitting ? 'Processing...' : 'Run Simulation'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
