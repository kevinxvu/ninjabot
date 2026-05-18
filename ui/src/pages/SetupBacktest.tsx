import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { MultiSelectPairs } from '../components/MultiSelectPairs';
import { StrategyEngine } from '../components/StrategyEngine';
import { TimeframeSelect } from '../components/TimeframeSelect';
import { Settings2, Activity, Play } from 'lucide-react';
import api from '../api/client';

export function SetupBacktest() {
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
      // Use axios through our api client
      // Note: the interceptor already returns response.data
      await api.post('/api/backtest', payload);
      
      localStorage.setItem('ninjabot_backtest_config', JSON.stringify(payload));
      
      const pairsArr = payload.pairs.split(',').map(s => s.trim()).filter(Boolean);
      if (pairsArr && pairsArr.length > 0) {
        navigate(`/backtesting/dashboard?pair=${pairsArr[0]}`);
      } else {
        navigate('/backtesting/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Backtest failed');
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
                <TimeframeSelect
                  value={formData.timeframe}
                  disabled={isTimeframeDisabled}
                  onChange={(timeframe) => setFormData(prev => ({ ...prev, timeframe }))}
                />
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

          <StrategyEngine values={formData} onChange={handleChange} />

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
