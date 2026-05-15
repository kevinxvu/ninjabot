import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { MultiSelectPairs } from '../components/MultiSelectPairs';
import { Settings2, Activity, Play } from 'lucide-react';

export function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    pairs: 'BTCUSDT,ETHUSDT',
    timeframe: '1h',
    days: 60,
    initial_capital: 10000,
    strategy: 'emacross',
    fast_period: 8,
    slow_period: 21,
    dca_interval: 7,
    dca_buy_amount: 100
  });

  // Load saved config on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('ninjabot_backtest_config');
    if (savedConfig) {
      try {
        const data = JSON.parse(savedConfig);
        setFormData(prev => ({ ...prev, ...data }));
      } catch (e) {
        console.error('Failed to parse saved config', e);
      }
    }
  }, []);

  // Update timeframe based on strategy
  useEffect(() => {
    if (formData.strategy === 'ocosell' || formData.strategy === 'dca') {
      setFormData(prev => ({ ...prev, timeframe: '1d' }));
    } else if (formData.strategy === 'trailingstop' || formData.strategy === 'turtle') {
      setFormData(prev => ({ ...prev, timeframe: '4h' }));
    }
  }, [formData.strategy]);

  const isTimeframeDisabled = ['ocosell', 'dca', 'trailingstop', 'turtle'].includes(formData.strategy);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: e.target.type === 'number' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      ...formData,
      days: Number(formData.days),
      initial_capital: Number(formData.initial_capital),
      fast_period: Number(formData.fast_period),
      slow_period: Number(formData.slow_period),
      dca_interval: Number(formData.dca_interval),
      dca_buy_amount: Number(formData.dca_buy_amount)
    };

    if (!payload.pairs || payload.pairs.trim() === '') {
      setError('Please select at least one trading pair.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Unknown server error');
      }

      localStorage.setItem('ninjabot_backtest_config', JSON.stringify(payload));

      if (data.pairs && data.pairs.length > 0) {
        navigate(`/chart?pair=${data.pairs[0]}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error: An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-center py-12">
      <div className="card">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-[var(--brand-accent)] text-white flex items-center justify-center shadow-sm">
              <Activity size={24} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl heading-style text-[var(--text-primary)]">New Backtest</h1>
              <p className="text-sm text-[var(--text-secondary)]">Configure parameters for historical simulation</p>
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section: Environment */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-2">
              <Settings2 size={16} className="text-[var(--text-secondary)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wide">Environment</h2>
            </div>

            <div className="z-20 relative">
              <label className="label-style">
                Trading Pairs <span className="text-[var(--text-tertiary)] lowercase tracking-normal">(max 5)</span>
              </label>
              <MultiSelectPairs
                value={formData.pairs}
                maxPairs={5}
                onChange={(newPairs) => setFormData(prev => ({ ...prev, pairs: newPairs }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="label-style">Timeframe</label>
                <select
                  name="timeframe"
                  value={formData.timeframe}
                  onChange={handleChange}
                  className="input-field"
                  disabled={isTimeframeDisabled}
                >
                  <option value="15m">15 minutes</option>
                  <option value="30m">30 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="2h">2 hours</option>
                  <option value="4h">4 hours</option>
                  <option value="6h">6 hours</option>
                  <option value="12h">12 hours</option>
                  <option value="1d">1 day</option>
                </select>
              </div>

              <div>
                <label className="label-style">History (days)</label>
                <input
                  name="days"
                  type="number"
                  value={formData.days}
                  onChange={handleChange}
                  min="7"
                  max="365"
                  className="input-field"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label-style">Initial Capital (USDT)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-medium">$</span>
                <input
                  name="initial_capital"
                  type="number"
                  value={formData.initial_capital}
                  onChange={handleChange}
                  min="100"
                  step="100"
                  className="input-field pl-8"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section: Strategy */}
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
                <option value="dca">DCA (Dollar Cost Averaging)</option>
                <option value="ocosell">OCO Sell (Stochastic)</option>
                <option value="trailingstop">Trailing Stop</option>
                <option value="turtle">Turtle Trading</option>
              </select>
            </div>

            {/* Strategy Parameters */}
            <div className="bg-[var(--bg-tertiary)] p-5 rounded-xl border border-[var(--border-color)]">
              {formData.strategy === 'emacross' && (
                <div className="grid grid-cols-2 gap-5">
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
                      required
                    />
                    <p className="text-[11px] text-[var(--text-secondary)] mt-2 leading-tight">Buy when EMA crosses above SMA.</p>
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
                      required
                    />
                    <p className="text-[11px] text-[var(--text-secondary)] mt-2 leading-tight">Sell when EMA crosses below SMA.</p>
                  </div>
                </div>
              )}

              {formData.strategy === 'dca' && (
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="label-style">Interval (Days)</label>
                    <input
                      name="dca_interval"
                      type="number"
                      value={formData.dca_interval}
                      onChange={handleChange}
                      min="1"
                      max="365"
                      className="input-field bg-[var(--bg-primary)]"
                      required
                    />
                  </div>
                  <div>
                    <label className="label-style">Buy Amount (USDT)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-medium">$</span>
                      <input
                        name="dca_buy_amount"
                        type="number"
                        value={formData.dca_buy_amount}
                        onChange={handleChange}
                        min="10"
                        step="10"
                        className="input-field pl-8 bg-[var(--bg-primary)]"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {['ocosell', 'trailingstop', 'turtle'].includes(formData.strategy) && (
                <div className="flex items-start gap-3">
                  <div className="text-[var(--brand-accent)] mt-0.5">
                    <Activity size={16} />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {formData.strategy === 'ocosell' && 'Uses Stochastic Oscillator for entry and OCO orders for exit. No extra parameters required. Timeframe is fixed to 1d.'}
                    {formData.strategy === 'trailingstop' && 'Uses EMA Crossover with trailing stop for exits. No extra parameters required. Timeframe is fixed to 4h.'}
                    {formData.strategy === 'turtle' && 'Turtle trading strategy using 40-period High and 20-period Low. No extra parameters required. Timeframe is fixed to 4h.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4">
            {error && (
              <div className="mb-4 p-4 bg-[var(--error-bg)] text-[var(--error-color)] rounded-lg text-sm flex items-center gap-2">
                <span className="font-bold">Error:</span> {error}
              </div>
            )}

            {loading && !error && (
              <div className="mb-4 p-4 bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg text-sm flex flex-col items-center justify-center gap-3 text-center">
                <div className="spinner w-6 h-6 border-2"></div>
                <span className="font-medium text-[var(--text-secondary)]">Analyzing historical data & executing strategy...</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2 h-12"
            >
              {!loading && <Play size={18} fill="currentColor" />}
              {loading ? 'Processing...' : 'Run Simulation'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Layout>
  );
}