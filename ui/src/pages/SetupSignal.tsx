import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { SelectPair } from '../components/SelectPair';
import { StrategyEngine, type StrategyOption } from '../components/StrategyEngine';
import { TimeframeSelect, type TimeframeOption } from '../components/TimeframeSelect';
import { Settings2, Activity, Play } from 'lucide-react';
import api from '../api/client';

const REALTIME_TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { value: '1m', label: '1 minute' },
  { value: '15m', label: '15 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: '1d', label: '1 day' },
];

const REALTIME_STRATEGY_OPTIONS: StrategyOption[] = [
  { value: 'emacross', label: 'EMA Crossover' },
];

interface PairInfo {
  Asset: string;
  Quote: string;
}

const QUOTE_ASSETS = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'BTC', 'ETH', 'BNB', 'TRY', 'EUR', 'BRL'];

function getFallbackPairInfo(pair: string): PairInfo {
  const quote = QUOTE_ASSETS.find((asset) => pair.endsWith(asset)) || 'USDT';
  return {
    Asset: pair.endsWith(quote) ? pair.slice(0, -quote.length) : pair,
    Quote: quote,
  };
}

export function SetupSignal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairsInfo, setPairsInfo] = useState<Record<string, PairInfo>>({});

  const [formData, setFormData] = useState({
    pair: 'BTCUSDT',
    timeframe: '1h',
    strategy: 'emacross',
    initial_asset: 'USDT',
    initial_amount: 1000,
    fast_period: 8,
    slow_period: 21,
  });

  useEffect(() => {
    if (!formData.pair || pairsInfo[formData.pair]) return;

    let isCurrent = true;

    const fetchPairInfo = async () => {
      try {
        const data = await api.get(`/api/pairs?pairs=${encodeURIComponent(formData.pair)}`) as Record<string, PairInfo>;
        const info = data?.[formData.pair];

        if (isCurrent && info) {
          setPairsInfo(prev => ({ ...prev, [formData.pair]: info }));
          setFormData(prev => (
            prev.pair === formData.pair
              ? { ...prev, initial_asset: info.Quote }
              : prev
          ));
        }
      } catch (err) {
        console.error('Failed to fetch pair info', err);
      }
    };

    fetchPairInfo();

    return () => {
      isCurrent = false;
    };
  }, [formData.pair, pairsInfo]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: e.target.type === 'number' ? Number(value) : value
      };
      
      // Auto-update base asset options logic
      if (name === 'pair') {
        const info = pairsInfo[value];
        if (info) {
           updated.initial_asset = info.Quote; // default to Quote
        }
      }
      return updated;
    });
  };

  const handlePairChange = (pair: string) => {
    setFormData(prev => {
      const info = pairsInfo[pair];
      return {
        ...prev,
        pair,
        initial_asset: info?.Quote || getFallbackPairInfo(pair).Quote
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await api.post<any, any>('/api/realtime-signals/start', formData);
      navigate(`/realtime-signals/${response.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to start signal');
    } finally {
      setLoading(false);
    }
  };

  const currentPairInfo = pairsInfo[formData.pair] || getFallbackPairInfo(formData.pair);

  return (
    <Layout>
      <div className="flex items-center justify-center py-12">
        <div className="card max-w-2xl w-full">
          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-[var(--brand-accent)] text-white flex items-center justify-center shadow-sm">
                <Activity size={24} strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-2xl heading-style text-[var(--text-primary)]">New Realtime Signal</h1>
                <p className="text-sm text-[var(--text-secondary)]">Run a strategy with real-time paper trading</p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-5">
              <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
                <Settings2 size={16} className="text-[var(--text-secondary)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">Environment</h2>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="relative z-20">
                  <label className="label-style">Trading Pair</label>
                  <SelectPair
                    value={formData.pair}
                    onChange={handlePairChange}
                  />
                </div>

                <div>
                  <label className="label-style">Timeframe</label>
                  <TimeframeSelect
                    value={formData.timeframe}
                    options={REALTIME_TIMEFRAME_OPTIONS}
                    onChange={(timeframe) => setFormData(prev => ({ ...prev, timeframe }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="label-style">Initial Asset</label>
                  <select
                    name="initial_asset"
                    value={formData.initial_asset}
                    onChange={handleChange}
                    className="input-field"
                  >
                    <option value={currentPairInfo.Asset}>{currentPairInfo.Asset} (Base)</option>
                    <option value={currentPairInfo.Quote}>{currentPairInfo.Quote} (Quote)</option>
                  </select>
                </div>

                <div>
                  <label className="label-style">Initial Amount ({formData.initial_asset})</label>
                  <input
                    name="initial_amount"
                    type="number"
                    value={formData.initial_amount}
                    onChange={handleChange}
                    min="0"
                    step="any"
                    className="input-field"
                    required
                  />
                </div>
              </div>
            </div>

            <StrategyEngine
              values={formData}
              options={REALTIME_STRATEGY_OPTIONS}
              onChange={handleChange}
            />

            <div className="pt-4">
              {error && (
                <div className="mb-4 p-4 bg-[var(--error-bg)] text-[var(--error-color)] rounded-lg text-sm">
                  <span className="font-bold">Error:</span> {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 h-12"
              >
                {!loading && <Play size={18} fill="currentColor" />}
                {loading ? 'Starting...' : 'Start Realtime Session'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
