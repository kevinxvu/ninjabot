const form = document.getElementById('form');
const btn  = document.getElementById('btn');
const errBox  = document.getElementById('err-box');
const infoBox = document.getElementById('info-box');
const strategySelect = document.getElementById('strategy-select');

document.addEventListener('DOMContentLoaded', () => {
    const savedConfig = localStorage.getItem('ninjabot_backtest_config');
    if (savedConfig) {
        try {
            const data = JSON.parse(savedConfig);
            for (const [key, value] of Object.entries(data)) {
                const el = form.elements[key];
                if (el) {
                    el.value = value;
                }
            }
        } catch (e) {
            console.error('Failed to parse saved config', e);
        }
    }
    // Always dispatch change event on load to correctly set default visibility and timeframe locking
    strategySelect.dispatchEvent(new Event('change'));
});

strategySelect.addEventListener('change', (e) => {
    document.querySelectorAll('.strategy-params').forEach(el => {
        el.style.display = 'none';
    });
    const selected = document.getElementById(`${e.target.value}-params`);
    if (selected) {
        if (selected.classList.contains('grid')) {
            selected.style.display = 'grid';
        } else {
            selected.style.display = 'flex';
        }
    }

    // Auto-set and lock timeframe based on strategy requirements
    const timeframeSelect = document.querySelector('select[name="timeframe"]');
    if (e.target.value === 'ocosell' || e.target.value === 'dca') {
        timeframeSelect.value = '1d';
        timeframeSelect.disabled = true;
    } else if (e.target.value === 'trailingstop' || e.target.value === 'turtle') {
        timeframeSelect.value = '4h';
        timeframeSelect.disabled = true;
    } else {
        timeframeSelect.disabled = false;
    }
});

function showError(msg) {
  errBox.textContent = '⚠ ' + msg;
  errBox.style.display = 'block';
  infoBox.style.display = 'none';
}
function showInfo(msg) {
  infoBox.textContent = msg;
  infoBox.style.display = 'block';
  errBox.style.display = 'none';
}
function hideAlerts() {
  errBox.style.display = 'none';
  infoBox.style.display = 'none';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlerts();

  // Temporarily enable timeframe to get its value if disabled
  const timeframeSelect = document.querySelector('select[name="timeframe"]');
  const wasDisabled = timeframeSelect.disabled;
  if (wasDisabled) timeframeSelect.disabled = false;

  const data = Object.fromEntries(new FormData(form).entries());

  if (wasDisabled) timeframeSelect.disabled = true;
  const payload = {
    pairs:           data.pairs,
    timeframe:       data.timeframe,
    days:            parseInt(data.days, 10),
    initial_capital: parseFloat(data.initial_capital),
    strategy:        data.strategy,
    fast_period:     parseInt(data.fast_period, 10),
    slow_period:     parseInt(data.slow_period, 10),
    dca_interval:    parseInt(data.dca_interval, 10),
    dca_buy_amount:  parseFloat(data.dca_buy_amount),
  };

  localStorage.setItem('ninjabot_backtest_config', JSON.stringify(data));

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Downloading & running…';
  showInfo('Fetching candles from Binance and running simulation. This may take a few seconds…');

  try {
    const res = await fetch('/api/backtest', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      showError(json.error || 'Unknown server error');
      return;
    }

    const firstPair = json.pairs && json.pairs[0];
    showInfo('Backtest complete! Redirecting to chart…');
    setTimeout(() => {
      window.location.href = '/?pair=' + (firstPair || '');
    }, 600);
  } catch (err) {
    showError('Network error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Run Backtest';
  }
});