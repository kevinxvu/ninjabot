import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Square, Trash2 } from 'lucide-react';
import { signalsApi } from '@/api/signals';
import type { MarketCandle, MarketSocketMessage } from '@/api/types';
import { EquityChart } from '@/components/charts/EquityChart';
import { PriceChart } from '@/components/charts/PriceChart';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorAlert } from '@/components/common/ErrorAlert';
import { LoadingState } from '@/components/common/LoadingState';
import { SectionCard } from '@/components/common/SectionCard';
import { SessionStatusBadge } from '@/components/common/StatusBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useAsync } from '@/hooks/useAsync';
import { useMarketSocket } from '@/hooks/useMarketSocket';
import { SessionMeta } from './components/SessionMeta';
import { SignalHistory } from './components/SignalHistory';
import { useSessionActions } from './useSessionActions';

export function SignalDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const session = useAsync(`signal:${id}`, () => signalsApi.get(id));
  const chart = useAsync(session.data ? `signal-chart:${id}` : null, () => signalsApi.getChart(id));
  const [currentPrice, setCurrentPrice] = useState(0);
  const [realtimeCandle, setRealtimeCandle] = useState<MarketCandle | null>(null);

  const { reload: reloadSession, mutate: mutateSession } = session;
  const { reload: reloadChart } = chart;
  const refresh = useCallback(() => {
    reloadSession();
    reloadChart();
  }, [reloadSession, reloadChart]);

  const actions = useSessionActions((action) =>
    action === 'delete' ? navigate('/realtime-signals') : refresh(),
  );

  const pair = session.data?.pair;
  const running = session.data?.status === 'running';

  const handleSocketMessage = useCallback(
    (message: MarketSocketMessage) => {
      if (message.type === 'TICKER' && message.pair === pair) {
        setCurrentPrice(message.price);
      } else if (message.type === 'CANDLE' && message.pair === pair) {
        setRealtimeCandle(message.data);
        // Refetch only when a candle closes so backend indicators/orders stay authoritative.
        if (message.data.Complete) refresh();
      } else if (message.type === 'ORDER' && message.session_id === id) {
        mutateSession((prev) => prev && { ...prev, orders: [message.data, ...(prev.orders ?? [])] });
        refresh();
      }
    },
    [pair, id, refresh, mutateSession],
  );

  // Stopped sessions don't need realtime price updates.
  useMarketSocket({
    pair,
    timeframe: session.data?.timeframe,
    enabled: running,
    onMessage: handleSocketMessage,
  });

  if (session.loading) return <LoadingState />;
  if (!session.data) {
    return (
      <EmptyState
        title="Session not found"
        action={
          <Button asChild variant="link">
            <Link to="/realtime-signals">Back to list</Link>
          </Button>
        }
      />
    );
  }

  const data = session.data;
  const pending = actions.isPending(data.id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {data.pair}
            <SessionStatusBadge status={data.status} />
          </span>
        }
        actions={
          <>
            {running ? (
              <Button
                variant="outline"
                className="text-warning hover:text-warning"
                disabled={pending}
                onClick={() => actions.stop(data.id)}
              >
                <Square /> Stop Bot
              </Button>
            ) : (
              <Button
                variant="outline"
                className="text-success hover:text-success"
                disabled={pending}
                onClick={() => actions.resume(data.id)}
              >
                <Play /> Resume Bot
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="text-destructive hover:text-destructive"
              aria-label="Delete session"
              disabled={pending}
              onClick={() => actions.requestDelete(data.id)}
            >
              <Trash2 />
            </Button>
            <Button asChild variant="secondary">
              <Link to="/realtime-signals">
                <ArrowLeft /> Back to List
              </Link>
            </Button>
          </>
        }
      >
        <SessionMeta session={data} />
      </PageHeader>

      {actions.error && <ErrorAlert message={actions.error} className="mb-6" />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="flex min-h-[500px] flex-col gap-6 lg:col-span-3">
          {chart.loading ? (
            <LoadingState label="Loading chart..." />
          ) : (
            <PriceChart
              data={chart.data}
              currentPrice={running ? currentPrice : 0}
              realtimeCandle={running ? realtimeCandle : null}
              timeframe={data.timeframe}
            />
          )}

          {!!chart.data?.equity_values?.length && (
            <SectionCard title="Portfolio Equity">
              <EquityChart data={chart.data} />
            </SectionCard>
          )}
        </div>

        <SectionCard
          title="Signal History"
          className="max-h-[600px] overflow-hidden"
          contentClassName="overflow-y-auto"
        >
          <SignalHistory events={data.events ?? []} orders={data.orders ?? []} />
        </SectionCard>
      </div>

      {actions.confirmDialog}
    </>
  );
}
