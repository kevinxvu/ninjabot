// ── Backtest Summary Panel ────────────────────────────────────────────────
(function () {
    'use strict';

    function fmt(n, d) {
        return Number(n).toLocaleString(undefined, { minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 });
    }
    function fmtPct(n) {
        var s = n >= 0 ? '+' : '';
        return s + fmt(n, 2) + '%';
    }
    function colorPct(n) {
        return n >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    }

    function buildKPI(label, value, sub, color) {
        return '<div class="kpi-card">'
            + '<div class="kpi-label">' + label + '</div>'
            + '<div class="kpi-value" style="color:' + (color || 'var(--text-primary)') + '">' + value + '</div>'
            + (sub ? '<div class="kpi-sub">' + sub + '</div>' : '')
            + '</div>';
    }

    function renderSummary(d) {
        var section = document.getElementById('backtest-summary');
        if (!section) return;
        section.style.display = '';

        // ── Strategy tag
        var html = '<div class="chart-container" style="padding:1.5rem">';
        html += '<div class="summary-header">';
        html += '<h2 class="chart-title" style="margin:0">📊 Backtest Summary</h2>';
        html += '<span class="summary-strategy">' + d.strategy_info + '</span>';
        html += '</div>';

        // ── Top-level KPIs
        var grossColor = colorPct(d.gross_profit_pct);
        var ddColor = d.max_drawdown_pct <= 0 ? 'var(--accent-red)' : 'var(--accent-green)';
        html += '<div class="summary-kpi-grid">';
        html += buildKPI('Initial Capital', fmt(d.initial_capital) + ' ' + d.base_coin, null, null);
        html += buildKPI('Final Portfolio', fmt(d.final_portfolio) + ' ' + d.base_coin,
            fmtPct(d.gross_profit_pct) + ' gross return', grossColor);
        html += buildKPI('Gross Profit', fmt(d.gross_profit) + ' ' + d.base_coin, null, grossColor);
        html += buildKPI('Win Rate', fmt(d.win_rate, 1) + '%',
            d.total_wins + ' W / ' + d.total_losses + ' L / ' + d.total_trades + ' trades',
            d.win_rate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)');
        html += buildKPI('Avg Payoff', fmt(d.avg_payoff, 3), 'avg win / avg loss ratio', null);
        html += buildKPI('Profit Factor', fmt(d.avg_profit_factor, 3), 'gross win / gross loss', null);
        html += buildKPI('SQN', fmt(d.avg_sqn, 1), 'System Quality Number', null);
        html += buildKPI('Max Drawdown', fmt(d.max_drawdown_pct, 2) + '%', null, ddColor);
        html += buildKPI('Total Volume', fmt(d.total_volume) + ' ' + d.base_coin, null, null);
        html += '</div>'; // kpi-grid

        // ── Per-pair performance table
        html += '<div class="summary-sub-card" style="margin-bottom:1rem">';
        html += '<h4>Per-Pair Performance</h4>';
        html += '<table class="pair-table">';
        html += '<thead><tr>';
        ['Pair','Trades','Win','Loss','% Win','Payoff','Pr.Fact','SQN','Profit','Volume'].forEach(function(h){
            html += '<th>' + h + '</th>';
        });
        html += '</tr></thead><tbody>';

        d.pairs.forEach(function(p) {
            var winColor = p.win_pct >= 50 ? 'var(--accent-green)' : 'var(--accent-red)';
            html += '<tr>'
                + '<td>' + p.pair + '</td>'
                + '<td>' + p.trades + '</td>'
                + '<td style="color:var(--accent-green)">' + p.win + '</td>'
                + '<td style="color:var(--accent-red)">' + p.loss + '</td>'
                + '<td style="color:' + winColor + '">' + fmt(p.win_pct,1) + '%</td>'
                + '<td>' + fmt(p.payoff,3) + '</td>'
                + '<td>' + fmt(p.profit_factor,3) + '</td>'
                + '<td>' + fmt(p.sqn,1) + '</td>'
                + '<td style="color:' + colorPct(p.profit) + '">' + fmt(p.profit) + '</td>'
                + '<td>' + fmt(p.volume) + '</td>'
                + '</tr>';
        });
        // totals row
        var totWinColor = d.win_rate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)';
        html += '<tr>'
            + '<td>TOTAL</td>'
            + '<td>' + d.total_trades + '</td>'
            + '<td style="color:var(--accent-green)">' + d.total_wins + '</td>'
            + '<td style="color:var(--accent-red)">' + d.total_losses + '</td>'
            + '<td style="color:' + totWinColor + '">' + fmt(d.win_rate,1) + '%</td>'
            + '<td>' + fmt(d.avg_payoff,3) + '</td>'
            + '<td>' + fmt(d.avg_profit_factor,3) + '</td>'
            + '<td>' + fmt(d.avg_sqn,1) + '</td>'
            + '<td style="color:' + colorPct(d.total_profit) + '">' + fmt(d.total_profit) + '</td>'
            + '<td>' + fmt(d.total_volume) + '</td>'
            + '</tr>';
        html += '</tbody></table></div>';

        // ── Two-column row: Confidence Intervals + Return Histogram
        html += '<div class="summary-row">';

        // Confidence Intervals
        html += '<div class="summary-sub-card">';
        html += '<h4>Confidence Intervals (95%)</h4><div class="ci-grid">';
        d.pairs.forEach(function(p) {
            html += '<div class="ci-pair-label">' + p.pair + '</div>';
            [
                { name:'Return',      mean: fmt(p.ci_return_mean,2)+'%', range: fmt(p.ci_return_lower,2)+'% ~ '+fmt(p.ci_return_upper,2)+'%' },
                { name:'Payoff',      mean: fmt(p.ci_payoff_mean,2),     range: fmt(p.ci_payoff_lower,2)+' ~ '+fmt(p.ci_payoff_upper,2) },
                { name:'Prof.Factor', mean: fmt(p.ci_pf_mean,2),         range: fmt(p.ci_pf_lower,2)+' ~ '+fmt(p.ci_pf_upper,2) },
            ].forEach(function(row) {
                html += '<div class="ci-row">'
                    + '<span class="ci-name">' + row.name + '</span>'
                    + '<span class="ci-value">' + row.mean + '</span>'
                    + '<span class="ci-range">(' + row.range + ')</span>'
                    + '</div>';
            });
        });
        html += '</div></div>'; // ci-grid + sub-card

        // Return Distribution Histogram
        html += '<div class="summary-sub-card">';
        html += '<h4>Return Distribution (%)</h4>';
        if (d.return_buckets && d.return_buckets.length) {
            var maxPct = Math.max.apply(null, d.return_buckets.map(function(b){ return b.pct; }));
            d.return_buckets.forEach(function(b) {
                var widthPct = maxPct > 0 ? (b.pct / maxPct * 100) : 0;
                var barColor = b.from < 0 ? 'var(--accent-red)' : 'var(--accent-green)';
                if (b.from < 0 && b.to > 0) barColor = 'var(--accent-yellow)';
                html += '<div class="hist-bar-row">'
                    + '<span class="hist-label">' + b.label + '</span>'
                    + '<div class="hist-bar-wrap"><div class="hist-bar-fill" style="width:'+widthPct+'%;background:'+barColor+'"></div></div>'
                    + '<span class="hist-pct" style="color:' + barColor + '">' + fmt(b.pct,1) + '%</span>'
                    + '<span class="hist-count">(' + b.count + ')</span>'
                    + '</div>';
            });
        } else {
            html += '<p style="color:var(--text-secondary);font-size:.8rem">Not enough data.</p>';
        }
        html += '</div>'; // sub-card

        html += '</div>'; // summary-row

        // ── Final Wallet + Risk & Volume
        html += '<div class="summary-row">';

        // Final Wallet
        html += '<div class="summary-sub-card">';
        html += '<h4>Final Wallet</h4>';
        d.final_assets.forEach(function(a) {
            html += '<div class="wallet-row">'
                + '<span class="wallet-asset">' + a.asset + '</span>'
                + '<span class="wallet-val">' + fmt(a.value_usdt) + ' USDT</span>'
                + '</div>';
        });
        html += '<div class="wallet-row">'
            + '<span class="wallet-asset">' + d.base_coin + '</span>'
            + '<span class="wallet-val">' + fmt(d.base_balance) + ' USDT</span>'
            + '</div>';
        html += '<div class="wallet-row" style="margin-top:.5rem;border-top:1px solid var(--border-color);padding-top:.5rem">'
            + '<span style="font-weight:700">Total Portfolio</span>'
            + '<span class="wallet-val" style="font-weight:700;color:' + colorPct(d.gross_profit) + '">' + fmt(d.final_portfolio) + ' USDT</span>'
            + '</div>';
        html += '</div>'; // sub-card

        // Risk & Volume
        html += '<div class="summary-sub-card">';
        html += '<h4>Risk &amp; Returns</h4>';
        [
            { label:'Start Portfolio',  value: fmt(d.initial_capital) + ' USDT' },
            { label:'Final Portfolio',  value: fmt(d.final_portfolio) + ' USDT' },
            { label:'Gross Profit',     value: fmt(d.gross_profit) + ' USDT (' + fmtPct(d.gross_profit_pct) + ')', color: colorPct(d.gross_profit) },
            { label:'Max Drawdown',     value: fmt(d.max_drawdown_pct,2) + '%', color: 'var(--accent-red)' },
            { label:'Total Volume',     value: fmt(d.total_volume) + ' USDT' },
        ].forEach(function(row) {
            html += '<div class="wallet-row">'
                + '<span style="color:var(--text-secondary);font-size:.8rem">' + row.label + '</span>'
                + '<span class="wallet-val" style="font-weight:600' + (row.color ? ';color:'+row.color : '') + '">' + row.value + '</span>'
                + '</div>';
        });
        html += '</div>'; // sub-card

        html += '</div>'; // summary-row
        html += '</div>'; // chart-container

        section.innerHTML = html;
    }

    // Try to load summary after the enhanced chart JS has run.
    window.addEventListener('load', function () {
        fetch('/api/summary')
            .then(function (res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function (data) {
                if (data) renderSummary(data);
            })
            .catch(function () { /* endpoint not available – skip */ });
    });
})();