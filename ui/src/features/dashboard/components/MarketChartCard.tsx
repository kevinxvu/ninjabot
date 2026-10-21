import type { MarketCandle } from '@/api/types';
import { LiveCandleChart } from '@/components/charts/LiveCandleChart';
import { LoadingState } from '@/components/common/LoadingState';
import { SectionCard } from '@/components/common/SectionCard';
import { PairSelect } from '@/components/market/PairSelect';
import { TimeframeSelect } from '@/components/market/TimeframeSelect';

interface MarketChartCardProps {
  pair: string;
  timeframe: string;
  candles: MarketCandle[];
  currentPrice?: number;
  loading: boolean;
  error: string | null;
  onPairChange: (pair: string) => void;
  onTimeframeChange: (timeframe: string) => void;
}

export function MarketChartCard({
  pair,
  timeframe,
  candles,
  currentPrice,
  loading,
  error,
  onPairChange,
  onTimeframeChange,
}: MarketChartCardProps) {
  const message = error ?? (candles.length === 0 ? `No candle data for ${pair} (${timeframe}).` : null);

  return (
    <SectionCard
      title="Crypto Live"
      className="lg:col-span-2"
      contentClassName="flex min-h-[400px] flex-1 flex-col"
      action={
        <div className="flex items-center gap-2">
          <PairSelect value={pair} onChange={onPairChange} className="w-44" />
          <TimeframeSelect value={timeframe} onChange={onTimeframeChange} className="w-32" />
        </div>
      }
    >
      {loading ? (
        <LoadingState label="" className="flex-1" />
      ) : message ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{message}</div>
      ) : (
        <div className="min-h-[400px] flex-1">
          <LiveCandleChart candles={candles} currentPrice={currentPrice} revision={`${pair}-${timeframe}`} />
        </div>
      )}
    </SectionCard>
  );
}
