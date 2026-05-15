import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiSelectPairs } from '../components/MultiSelectPairs';

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

    // Ensure numeric fields are actually numbers before sending to the backend.
    // This is especially important if values were loaded from old localStorage strings.
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

      // Save valid config
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
    <div className="min-h-screen bg-[var(--bg-secondary)] py-8 px-4 flex items-center justify-center">
      <div className="card">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">TradingBot</h1>
          <p className="text-[var(--text-secondary)]">Backtest Configuration</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="z-20 relative">
              <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">
                Trading Pairs <span className="text-[var(--text-tertiary)] lowercase tracking-normal">(max 5 pairs)</span>
              </label>
              <MultiSelectPairs
                value={formData.pairs}
                maxPairs={5}
                onChange={(newPairs) => setFormData(prev => ({ ...prev, pairs: newPairs }))}
              />
              <p className="text-xs text-[var(--text-secondary)] mt-1">Uses Binance public API — no API key needed.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">Timeframe</label>
                <select
                  name="timeframe"
                  value={formData.timeframe}
                  onChange={handleChange}
                  className="input-field disabled:opacity-50 disabled:cursor-not-allowed"
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
                <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">History (days)</label>
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
              <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">Initial Capital (USDT)</label>
              <input
                name="initial_capital"
                type="number"
                value={formData.initial_capital}
                onChange={handleChange}
                min="100"
                step="100"
                className="input-field"
                required
              />
            </div>

            <hr className="border-[var(--border-color)] my-6" />

            <div className="text-sm font-bold uppercase tracking-wider text-[#8b5cf6] mb-2 mt-4">Strategy Parameters</div>

            <div>
              <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">Strategy</label>
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
            <div className="bg-[var(--bg-tertiary)] p-4 rounded-lg">
              {formData.strategy === 'emacross' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">Fast Period (EMA)</label>
                    <input
                      name="fast_period"
                      type="number"
                      value={formData.fast_period}
                      onChange={handleChange}
                      min="2"
                      max="100"
                      className="input-field"
                      required
                    />
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Buy when EMA crosses above SMA.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">Slow Period (SMA)</label>
                    <input
                      name="slow_period"
                      type="number"
                      value={formData.slow_period}
                      onChange={handleChange}
                      min="3"
                      max="200"
                      className="input-field"
                      required
                    />
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Sell when EMA crosses below SMA.</p>
                  </div>
                </div>
              )}

              {formData.strategy === 'dca' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">Interval (Days)</label>
                    <input
                      name="dca_interval"
                      type="number"
                      value={formData.dca_interval}
                      onChange={handleChange}
                      min="1"
                      max="365"
                      className="input-field"
                      required
                    />
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Buy every N days. Timeframe is fixed to 1d.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 uppercase tracking-wider text-[var(--text-secondary)]">Buy Amount (USDT)</label>
                    <input
                      name="dca_buy_amount"
                      type="number"
                      value={formData.dca_buy_amount}
                      onChange={handleChange}
                      min="10"
                      step="10"
                      className="input-field"
                      required
                    />
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Fixed amount to invest each time.</p>
                  </div>
                </div>
              )}

              {formData.strategy === 'ocosell' && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Uses Stochastic Oscillator for entry and OCO orders for exit. No extra parameters required. Timeframe is fixed to 1d.
                </p>
              )}

              {formData.strategy === 'trailingstop' && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Uses EMA Crossover with trailing stop for exits. No extra parameters required. Timeframe is fixed to 4h.
                </p>
              )}

              {formData.strategy === 'turtle' && (
                <p className="text-sm text-[var(--text-secondary)]">
                  Turtle trading strategy using 40-period High and 20-period Low. No extra parameters required. Timeframe is fixed to 4h.
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-[var(--error-bg)] text-[var(--error-color)] border border-[var(--error-color)] border-opacity-40 rounded-lg text-sm font-medium">
              ⚠ {error}
            </div>
          )}

          {loading && !error && (
            <div className="p-4 bg-[var(--success-bg)] text-[var(--brand-color)] border border-[var(--brand-color)] border-opacity-35 rounded-lg text-sm font-medium">
              Fetching candles from Binance and running simulation. This may take a few seconds…
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Running Backtest...
              </>
            ) : (
              'Run Backtest'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}