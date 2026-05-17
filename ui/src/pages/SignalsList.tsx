import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Activity, Plus, PlaySquare, Square, Trash2 } from 'lucide-react';
import api from '../api/client';

export function SignalsList() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      const data = await api.get('/api/realtime-signals');
      if (Array.isArray(data)) {
        setSessions(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="text-indigo-500" />
            Realtime Signals
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">Manage your paper-trading bot sessions</p>
        </div>
        <button
          onClick={() => navigate('/realtime-signals/setup')}
          className="btn-primary flex items-center gap-2 px-4 py-2"
        >
          <Plus size={16} /> New Session
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)]">
          <Activity size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h3 className="text-lg font-medium">No active signals</h3>
          <p className="text-[var(--text-secondary)] mt-1 mb-4">Start a new realtime session to generate signals.</p>
          <button onClick={() => navigate('/realtime-signals/setup')} className="text-indigo-600 font-medium hover:underline">
            + Create your first session
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map(s => (
            <div 
              key={s.id} 
              className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-color)] p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/realtime-signals/${s.id}`)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="font-bold text-lg">{s.pair}</div>
                <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded font-semibold ${s.status === 'running' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                   {s.status === 'running' ? <PlaySquare size={12} /> : <Square size={12} />}
                   {s.status.toUpperCase()}
                </div>
              </div>
              
              <div className="space-y-2 text-sm text-[var(--text-secondary)] mb-4">
                <div className="flex justify-between">
                  <span>Strategy:</span> <span className="font-medium text-[var(--text-primary)]">{s.strategy} ({s.timeframe})</span>
                </div>
                <div className="flex justify-between">
                  <span>Initial Capital:</span> <span className="font-medium text-[var(--text-primary)]">{s.initial_amount} {s.initial_asset}</span>
                </div>
                <div className="flex justify-between">
                  <span>Started:</span> <span className="font-medium text-[var(--text-primary)]">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2 pt-4 border-t border-[var(--border-color)]">
                {s.status === 'running' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/realtime-signals/${s.id}/stop`, { method: 'POST' })
                        .then(() => fetchSessions());
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                  >
                    <Square size={14} /> Stop
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/realtime-signals/${s.id}/resume`, { method: 'POST' })
                        .then(() => fetchSessions());
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                  >
                    <PlaySquare size={14} /> Resume
                  </button>
                )}
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this session?')) {
                      fetch(`/api/realtime-signals/${s.id}`, { method: 'DELETE' })
                        .then(() => fetchSessions());
                    }
                  }}
                  className={`${s.status === 'running' ? 'px-3' : 'flex-1'} flex items-center justify-center gap-2 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors`}
                >
                  <Trash2 size={14} /> {s.status === 'running' ? '' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
