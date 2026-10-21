import { useCallback, useState } from 'react';
import { marketApi } from '@/api/market';
import type { MarketCandle, MarketSocketMessage } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useMarketSocket } from '@/hooks/useMarketSocket';
import { upsertCandle } from '@/lib/candles';
import { MarketChartCard } from './components/MarketChartCard';
import { PortfolioCard } from './components/PortfolioCard';
import { TickerCard } from './components/TickerCard';

const WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
const DEFAULT_PAIR = 'BTCUSDT';
const DEFAULT_TIMEFRAME = '1d';

export function DashboardPage() {
  const [pair, setPair] = useLocalStorageState('ninjabot.dashboard.mainPair', DEFAULT_PAIR);
  const [timeframe, setTimeframe] = useLocalStorageState('ninjabot.dashboard.timeframe', DEFAULT_TIMEFRAME);
  // Live ticker prices pushed by the websocket, layered over the REST snapshot.
  const [liveTickers, setLiveTickers] = useState<Record<string, number>>({});

  const tickers = useAsync('tickers', () => marketApi.getTickers(WATCHLIST));
  const pairsInfo = useAsync('pairs-info', () => marketApi.getPairsInfo(WATCHLIST));
  const portfolio = useAsync('portfolio', marketApi.getPortfolio);
  const candles = useAsync(`candles:${pair}:${timeframe}`, () =>
    marketApi.getCandles(pair, timeframe).then((data) => data ?? []),
  );
  const { mutate: mutateCandles } = candles;

  const handleSocketMessage = useCallback(
    (message: MarketSocketMessage) => {
      if (message.type === 'TICKER') {
        setLiveTickers((prev) => ({ ...prev, [message.pair]: message.price }));
      } else if (message.type === 'CANDLE' && message.pair === pair) {
        mutateCandles((prev) => upsertCandle<MarketCandle>(prev ?? [], message.data));
      }
    },
    [pair, mutateCandles],
  );

  useMarketSocket({ pair, timeframe, onMessage: handleSocketMessage });

  const prices = { ...tickers.data, ...liveTickers };
  const candleError = candles.error ? `Could not load candle data for ${pair} (${timeframe}).` : null;

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {WATCHLIST.map((symbol) => (
          <TickerCard key={symbol} pair={symbol} price={prices[symbol]} info={pairsInfo.data?.[symbol]} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <MarketChartCard
          pair={pair}
          timeframe={timeframe}
          candles={candles.data ?? []}
          currentPrice={prices[pair]}
          loading={candles.loading}
          error={candleError}
          onPairChange={setPair}
          onTimeframeChange={setTimeframe}
        />
        <div className="space-y-6">
          <PortfolioCard portfolio={portfolio.data} loading={portfolio.loading} />
        </div>
      </div>
    </>
  );
}
