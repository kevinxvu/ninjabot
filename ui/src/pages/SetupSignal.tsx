import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Settings2, Activity, Play } from 'lucide-react';
import api from '../api/client';

export function SetupSignal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairsInfo, setPairsInfo] = useState<Record<string, any>>({});

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
    // Fetch pairs
    const fetchPairs = async () => {
      try {
        const data = await api.get('/api/pairs?pairs=all');
        if (data) {
          setPairsInfo(data);
        }
      } catch (err) {
        console.error('Failed to fetch pairs', err);
      }
    };
    fetchPairs();
  }, []);

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

  const currentPairInfo = pairsInfo[formData.pair] || { Asset: formData.pair.replace('USDT',''), Quote: 'USDT' };

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
                <div>
                  <label className="label-style">Trading Pair</label>
                  <select
                    name="pair"
                    value={formData.pair}
                    onChange={handleChange}
                    className="input-field"
                  >
                    {Object.keys(pairsInfo).length > 0 ? (
                      Object.keys(pairsInfo).map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))
                    ) : (
                      <option value="BTCUSDT">BTCUSDT</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="label-style">Timeframe</label>
                  <select
                    name="timeframe"
                    value={formData.timeframe}
                    onChange={handleChange}
                    className="input-field"
                  >
                    <option value="1m">1 minute</option>
                    <option value="15m">15 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="4h">4 hours</option>
                    <option value="1d">1 day</option>
                  </select>
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

            <div className="space-y-5">
              <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
                <Activity size={16} className="text-[var(--text-secondary)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">Strategy Engine</h2>
              </div>

              <div>
                <label className="label-style">Algorithm</label>
                <select
                  name="strategy"
                  value={formData.strategy}
                  onChange={handleChange}
                  className="input-field mb-4"
                >
                  <option value="emacross">EMA Crossover</option>
                </select>
              </div>

              {formData.strategy === 'emacross' && (
                <div className="bg-[var(--bg-tertiary)] p-5 rounded-xl border border-[var(--border-color)] grid grid-cols-2 gap-5">
                  <div>
                    <label className="label-style">Fast Period (EMA)</label>
                    <input
                      name="fast_period"
                      type="number"
                      value={formData.fast_period}
                      onChange={handleChange}
                      min="2"
                      max="100"
                      className="input-field bg-[var(--bg-primary)]"
                    />
                  </div>
                  <div>
                    <label className="label-style">Slow Period (SMA)</label>
                    <input
                      name="slow_period"
                      type="number"
                      value={formData.slow_period}
                      onChange={handleChange}
                      min="3"
                      max="200"
                      className="input-field bg-[var(--bg-primary)]"
                    />
                  </div>
                </div>
              )}
            </div>

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
