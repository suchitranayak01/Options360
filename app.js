// app.js

// Generate demo data for the chart
function generateDemoData(expiry) {
  // Generate OHLC data (candlestick) centered on an expiry-specific base
  const points = 30;
  const baseByExpiry = { '2025-01-02': 1200, '2025-01-16': 1400 };
  const base = baseByExpiry[expiry] || 1000;

  const labels = [];
  const data = [];
  let prevClose = base * (0.98 + Math.random() * 0.04);

  for (let i = 0; i < points; i++) {
    labels.push('T' + i);

    const open = prevClose + (Math.random() - 0.5) * (base * 0.01);
    const close = open + (Math.random() - 0.5) * (base * 0.02);
    const high = Math.max(open, close) + Math.random() * (base * 0.005);
    const low = Math.min(open, close) - Math.random() * (base * 0.005);

    const o = Number(open.toFixed(2));
    const h = Number(high.toFixed(2));
    const l = Number(low.toFixed(2));
    const c = Number(close.toFixed(2));

    // include `x` so financial plugin can map points explicitly
    data.push({ x: labels[i], o, h, l, c });
    prevClose = c;
  }

  return { labels, data };
}

// Wait for DOM to be ready, then initialize chart
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('straddleChart');
  if (!canvas) return; // nothing to do if element missing

  const statusEl = document.getElementById('status');
  const setStatus = (msg) => {
    console.log(msg);
    if (statusEl) statusEl.textContent = msg;
  };

  const ctx = canvas.getContext('2d');
  // ensure Chart.js renders crisply on high DPI displays
  if (window.Chart) {
    try { Chart.defaults.devicePixelRatio = window.devicePixelRatio || 1; } catch (e) { console.warn('Could not set devicePixelRatio', e); }
  }
  const expirySelect = document.getElementById('expiry');
  const refreshBtn = document.getElementById('refreshBtn');
  const apiKeyInput = document.getElementById('apiKey');
  const symbolInput = document.getElementById('symbol');
  const useLiveCheckbox = document.getElementById('useLive');
  const modeSelect = document.getElementById('mode');
  const marketTypeSelect = document.getElementById('marketType');
  const indexSelect = document.getElementById('indexSelect');
  const expiryDateSelect = document.getElementById('expiryDate');
  const metricSelect = document.getElementById('metricSelect');
  const metricCall = document.getElementById('metric-call');
  const metricPut = document.getElementById('metric-put');
  const metricStraddle = document.getElementById('metric-straddle');
  const metricUpdated = document.getElementById('metric-updated');
  const metricIV = document.getElementById('metric-iv');
  const metricPCR = document.getElementById('metric-pcr');
  const metricPrice = document.getElementById('metric-price');
  const liveIntervalInput = document.getElementById('liveInterval');
  const liveBadge = document.getElementById('liveBadge');
  const liveDot = document.getElementById('liveDot');
  const liveText = document.getElementById('liveText');

  let liveTimer = null;
  function setLiveState(isLive) {
    if (liveBadge) {
      if (isLive) liveBadge.classList.add('live'); else liveBadge.classList.remove('live');
    }
    if (liveDot) liveDot.style.background = isLive ? '#34d399' : '#475569';
    if (liveText) liveText.textContent = isLive ? 'Live' : 'Offline';
  }
  function startLive() {
    const s = Number(liveIntervalInput && liveIntervalInput.value) || 30;
    stopLive();
    liveTimer = setInterval(() => { try { refresh(); } catch(e){ console.error(e); } }, s * 1000);
    setLiveState(true);
  }
  function stopLive() {
    if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
    setLiveState(false);
  }

  function updateMetrics(obj) {
    if (!obj) return;
    const { ts, iv, pcr, callPremium, putPremium, straddlePrice, lastPrice } = obj;
    if (metricIV) metricIV.textContent = iv != null ? iv + '%' : (metricIV.textContent || 'n/a');
    if (metricPCR) metricPCR.textContent = pcr != null ? pcr : (metricPCR.textContent || 'n/a');
    if (metricCall) metricCall.textContent = callPremium != null ? String(callPremium) : (metricCall.textContent || '-');
    if (metricPut) metricPut.textContent = putPremium != null ? String(putPremium) : (metricPut.textContent || '-');
    if (metricStraddle) metricStraddle.textContent = straddlePrice != null ? String(straddlePrice) : (metricStraddle.textContent || '-');
    if (metricPrice) metricPrice.textContent = lastPrice != null ? String(lastPrice) : (metricPrice.textContent || '-');
    if (metricUpdated) metricUpdated.textContent = ts || new Date().toISOString();
  }

  // Populate index options depending on market type
  const optionsByMarket = {
    equity: [ { value: 'nifty', text: 'Nifty' }, { value: 'sensex', text: 'Sensex' } ],
    mcx: [ { value: 'gold', text: 'Gold' }, { value: 'silver', text: 'Silver' }, { value: 'aluminium', text: 'Aluminium' } ]
  };

  const exampleSymbols = {
    nifty: '^NSEI',
    sensex: '^BSESN',
    gold: 'GC=F',
    silver: 'SI=F',
    aluminium: 'ALI=F'
  };

  function populateIndexOptions() {
    if (!indexSelect || !marketTypeSelect) return;
    const m = marketTypeSelect.value || 'equity';
    const opts = optionsByMarket[m] || [];
    indexSelect.innerHTML = '';
    opts.forEach(o => {
      const el = document.createElement('option');
      el.value = o.value;
      el.textContent = o.text;
      indexSelect.appendChild(el);
    });
    updateSymbolPlaceholder();
  }

  function updateSymbolPlaceholder() {
    if (!indexSelect || !symbolInput) return;
    const v = indexSelect.value;
    const ex = exampleSymbols[v] || '';
    symbolInput.placeholder = ex ? `e.g. ${ex}` : 'symbol';
  }

  if (marketTypeSelect) marketTypeSelect.addEventListener('change', populateIndexOptions);
  if (indexSelect) indexSelect.addEventListener('change', updateSymbolPlaceholder);

  let chart;

  // Quick test helper to verify Chart.js can draw a simple chart
  function drawTestChart() {
    try {
      if (chart) chart.destroy();
      chart = new Chart(ctx, {
        type: 'line',
        data: { labels: ['a', 'b', 'c'], datasets: [{ label: 'test', data: [1, 2, 3], borderColor: 'green' }] },
        options: { responsive: true }
      });
      setStatus('Test chart drawn — Chart.js is working.');
      return true;
    } catch (e) {
      console.error('Test chart failed', e);
      setStatus('Test chart failed — see console.');
      return false;
    }
  }

  function renderChart(expiry) {
    const result = generateDemoData(expiry);
    const labels = result.labels;
    const ohlc = result.data;

    if (chart) chart.destroy();

    try {
      setStatus('Creating demo line chart...');
      const closes = ohlc.map(p => p.c);
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'ATM Call + ATM Put (Demo Close)',
            data: closes,
            borderColor: 'rgb(56, 189, 248)',
            backgroundColor: 'rgba(56,189,248,0.2)',
            fill: true,
            tension: 0.3,
            pointRadius: 2
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: { x: { type: 'category', title: { display: true, text: 'Time steps' } }, y: { title: { display: true, text: 'Premium' } } }
        }
      });
    } catch (err) {
      console.error('Demo line chart render failed:', err);
      setStatus('Demo render failed — see console for details.');
    }
  }

  function refresh() {
    const expiry = expirySelect ? expirySelect.value : undefined;

    // If live mode enabled and symbol provided, fetch live data first
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    const symbol = symbolInput ? symbolInput.value.trim() : '';
    const useLive = useLiveCheckbox ? useLiveCheckbox.checked : false;

    if (useLive && symbol) {
      setStatus('Fetching live data...');
      // prefer Alpha Vantage if API key provided, otherwise use Yahoo
      if (apiKey) {
        fetchAlphaVantageIntraday(apiKey, symbol).then(result => {
          if (result && result.data && result.labels) {
            if (metricSelect && metricSelect.value === 'iv') {
              // alpha vantage doesn't return option IVs; fallback to Yahoo IV
              fetchYahooStraddleIV(symbol, expiryDateSelect ? expiryDateSelect.value : undefined).then(({ts, iv, pcr, callPremium, putPremium, straddlePrice}) => {
                ivHistory.labels.push(ts); ivHistory.values.push(iv);
                if (ivHistory.labels.length > 30) { ivHistory.labels.shift(); ivHistory.values.shift(); }
                renderLine(ivHistory.labels, ivHistory.values, 'Straddle IV (%)');
                updateMetrics({ ts, iv, pcr, callPremium, putPremium, straddlePrice });
                setStatus('Live IV loaded (via Yahoo).');
              }).catch(e => { console.error(e); setStatus('IV fetch failed — showing price.'); renderLineFromOHLC(result.labels, result.data); });
            } else if (metricSelect && metricSelect.value === 'pcr') {
              fetchYahooStraddleIV(symbol, expiryDateSelect ? expiryDateSelect.value : undefined).then(({ts, iv, pcr, callPremium, putPremium, straddlePrice}) => {
                pcrHistory.labels.push(ts); pcrHistory.values.push(pcr);
                if (pcrHistory.labels.length > 30) { pcrHistory.labels.shift(); pcrHistory.values.shift(); }
                renderLine(pcrHistory.labels, pcrHistory.values, 'PCR (put/call)');
                updateMetrics({ ts, iv, pcr, callPremium, putPremium, straddlePrice });
                setStatus('Live PCR loaded (via Yahoo).');
              }).catch(e => { console.error(e); setStatus('PCR fetch failed — showing price.'); renderLineFromOHLC(result.labels, result.data); });
            } else {
              renderLineFromOHLC(result.labels, result.data);
              setStatus('Live data (AlphaVantage) loaded.');
            }
          } else {
            setStatus('AlphaVantage returned no data — trying Yahoo.');
            fetchYahooAndRender(symbol, expiry);
          }
        }).catch(err => {
          console.error('AlphaVantage error', err);
          setStatus('AlphaVantage failed — trying Yahoo.');
          fetchYahooAndRender(symbol, expiry);
        });
      } else {
        // No API key: prefer Yahoo. Use metricSelect to pick IV or PCR or price
        if (metricSelect && metricSelect.value === 'iv') {
          fetchYahooStraddleIV(symbol, expiryDateSelect ? expiryDateSelect.value : undefined).then(({ts, iv, pcr, callPremium, putPremium, straddlePrice}) => {
            // reset history if symbol changed
            if ((ivHistory._symbol || '') !== symbol) { ivHistory.labels = []; ivHistory.values = []; ivHistory._symbol = symbol; }
            ivHistory.labels.push(ts); ivHistory.values.push(iv);
            if (ivHistory.labels.length > 30) { ivHistory.labels.shift(); ivHistory.values.shift(); }
            renderLine(ivHistory.labels, ivHistory.values, 'Straddle IV (%)');
            updateMetrics({ ts, iv, pcr, callPremium, putPremium, straddlePrice });
            setStatus('Live IV loaded (Yahoo).');
          }).catch(err => { console.error('Yahoo IV error', err); setStatus('Yahoo IV failed — using demo.'); renderChart(expiry); });
        } else if (metricSelect && metricSelect.value === 'pcr') {
          fetchYahooStraddleIV(symbol, expiryDateSelect ? expiryDateSelect.value : undefined).then(({ts, iv, pcr, callPremium, putPremium, straddlePrice}) => {
            if ((pcrHistory._symbol || '') !== symbol) { pcrHistory.labels = []; pcrHistory.values = []; pcrHistory._symbol = symbol; }
            pcrHistory.labels.push(ts); pcrHistory.values.push(pcr);
            if (pcrHistory.labels.length > 30) { pcrHistory.labels.shift(); pcrHistory.values.shift(); }
            renderLine(pcrHistory.labels, pcrHistory.values, 'PCR (put/call)');
            updateMetrics({ ts, iv, pcr, callPremium, putPremium, straddlePrice });
            setStatus('Live PCR loaded (Yahoo).');
          }).catch(err => { console.error('Yahoo PCR error', err); setStatus('Yahoo PCR failed — using demo.'); renderChart(expiry); });
        } else {
          fetchYahooAndRender(symbol, expiry);
        }
      }
    } else {
      renderChart(expiry);
    }
  }

  // Helper: fetch from Yahoo and render, with fallback to demo
  function fetchYahooAndRender(symbol, expiry) {
    fetchYahooChart(symbol).then(result => {
      if (result && result.data && result.labels) {
          renderLineFromOHLC(result.labels, result.data);
          // update simple price metric (last close)
          try {
            const last = result.data[result.data.length - 1];
            const lastPrice = last && last.c != null ? last.c : null;
            updateMetrics({ lastPrice, ts: result.labels[result.labels.length - 1] || new Date().toISOString() });
          } catch (e) { /* ignore */ }
        setStatus('Live data (Yahoo) loaded.');
      } else {
        setStatus('Yahoo returned no data — using demo.');
        renderChart(expiry);
      }
    }).catch(err => {
      console.error('Yahoo fetch error', err);
      setStatus('Yahoo fetch failed — using demo. See console for details.');
      if (metricPrice) metricPrice.textContent = '-';
      if (metricUpdated) metricUpdated.textContent = new Date().toISOString();
      renderChart(expiry);
    });
  }

  // Fetch intraday series from Alpha Vantage and convert to labels+OHLC
  async function fetchAlphaVantageIntraday(apiKey, symbol, interval = '60min', points = 30) {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok');
    const json = await res.json();
    const seriesKey = Object.keys(json).find(k => k.includes('Time Series'));
    if (!seriesKey || !json[seriesKey]) throw new Error('No time series in response');

    const raw = json[seriesKey];
    // raw keys are timestamps (newest first). convert to array oldest->newest
    const entries = Object.keys(raw).map(ts => ({ ts, v: raw[ts] })).sort((a, b) => new Date(a.ts) - new Date(b.ts));
    // take last `points` entries
    const slice = entries.slice(-points);
    const labels = [];
    const data = [];
    slice.forEach((e, i) => {
      const v = e.v;
      const o = Number(v['1. open']);
      const h = Number(v['2. high']);
      const l = Number(v['3. low']);
      const c = Number(v['4. close']);
      labels.push(e.ts);
      data.push({ x: e.ts, o, h, l, c });
    });
    return { labels, data };
  }

  // Fetch chart data from Yahoo Finance using the v8 chart API
  // Note: browser may block this request due to CORS depending on environment
  async function fetchYahooChart(symbol, interval = '60m', range = '7d', points = 30) {
    // Yahoo uses intervals like 1m,2m,5m,15m,60m,1d
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network response not ok for Yahoo');
    const json = await res.json();
    if (!json || !json.chart || !json.chart.result || !json.chart.result[0]) throw new Error('Invalid Yahoo response');
    const res0 = json.chart.result[0];
    const timestamps = res0.timestamp || [];
    const indicators = res0.indicators || {};
    const quote = indicators.quote && indicators.quote[0];
    if (!quote || !quote.open) throw new Error('No OHLC in Yahoo response');

    // build arrays oldest->newest
    const labels = [];
    const data = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const o = quote.open[i];
      const h = quote.high[i];
      const l = quote.low[i];
      const c = quote.close[i];
      if (o == null || h == null || l == null || c == null) continue;
      const label = new Date(ts * 1000).toISOString();
      labels.push(label);
      data.push({ x: label, o: Number(o.toFixed(2)), h: Number(h.toFixed(2)), l: Number(l.toFixed(2)), c: Number(c.toFixed(2)) });
    }

    // keep only last `points` entries
    const start = Math.max(0, data.length - points);
    return { labels: labels.slice(start), data: data.slice(start) };
  }

  // Render chart directly from OHLC arrays (used for live data)
  function renderLineFromOHLC(labels, ohlc) {
    if (chart) chart.destroy();
    try {
      const closes = ohlc.map(p => p.c);
      chart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Close (live)', data: closes, borderColor: 'rgb(56, 189, 248)', backgroundColor: 'rgba(56,189,248,0.2)', fill: true, tension: 0.3, pointRadius: 2 }] },
        options: { responsive: true, plugins: { legend: { display: true } }, scales: { x: { type: 'category' }, y: { title: { display: true, text: 'Price' } } } }
      });
    } catch (err) {
      console.error('renderLineFromOHLC failed', err);
      // fallback to demo candlestick
      renderChart(undefined);
    }
  }

  // Generic line renderer
  function renderLine(labels, values, labelText) {
    if (chart) chart.destroy();
    try {
      chart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{ label: labelText, data: values, borderColor: 'rgb(56, 189, 248)', backgroundColor: 'rgba(56,189,248,0.2)', fill: true, tension: 0.3, pointRadius: 2 }] },
        options: { responsive: true, plugins: { legend: { display: true } }, scales: { x: { type: 'category' }, y: { title: { display: true, text: labelText } } } }
      });
    } catch (err) {
      console.error('renderLine failed', err);
      setStatus('Line render failed — see console.');
    }
  }

  // Keep a small in-memory history for IV when user polls live
  const ivHistory = { labels: [], values: [] };
  const pcrHistory = { labels: [], values: [] };

  // Fetch straddle IV from Yahoo options chain (ATM avg of call+put implied vol)
  async function fetchYahooStraddleIV(symbol, expiryDate) {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Yahoo options network response not ok');
    const json = await res.json();
    if (!json || !json.optionChain || !json.optionChain.result || !json.optionChain.result[0]) throw new Error('Invalid Yahoo options response');
    const r = json.optionChain.result[0];
    const quote = r.quote;
    const underlying = quote && (quote.regularMarketPrice || quote.regularMarketPreviousClose || quote.regularMarketOpen);
    const optionsSeries = r.options || [];
    if (!optionsSeries.length) throw new Error('No options series in response');

    // If expiryDate provided (YYYY-MM-DD), try to match the series by expirationDate
    let optionsArr = optionsSeries[0];
    if (expiryDate) {
      try {
        const targetTs = Math.floor(new Date(expiryDate).getTime() / 1000);
        const found = optionsSeries.find(s => s.expirationDate === targetTs);
        if (found) optionsArr = found;
      } catch (e) {
        // ignore and use first series
      }
    }
    if (!optionsArr) throw new Error('No options in response');
    const calls = optionsArr.calls || [];
    const puts = optionsArr.puts || [];

    // find nearest strike to underlying
    let targetStrike = null;
    if (underlying != null && calls.length) {
      let minDiff = Infinity;
      calls.forEach(c => {
        const diff = Math.abs((c.strike || 0) - underlying);
        if (diff < minDiff) {
          minDiff = diff;
          targetStrike = c.strike;
        }
      });
    }

    // find call and put at targetStrike
    const call = calls.find(c => c.strike === targetStrike) || calls[Math.floor(calls.length/2)];
    const put = puts.find(p => p.strike === targetStrike) || puts[Math.floor(puts.length/2)];
    const callIV = call && (call.impliedVolatility || call.impliedVolatility === 0 ? call.impliedVolatility : null);
    const putIV = put && (put.impliedVolatility || put.impliedVolatility === 0 ? put.impliedVolatility : null);
    if (callIV == null && putIV == null) throw new Error('No impliedVolatility available');
    const avgIV = ((callIV || 0) + (putIV || 0)) / ( (callIV!=null && putIV!=null) ? 2 : 1 );
    const ivPercent = Number((avgIV * 100).toFixed(2));

    // compute PCR using volume if available, otherwise openInterest
    let callSum = 0;
    let putSum = 0;
    calls.forEach(c => { callSum += (c.volume != null ? c.volume : (c.openInterest || 0)); });
    puts.forEach(p => { putSum += (p.volume != null ? p.volume : (p.openInterest || 0)); });
    const pcr = callSum === 0 ? null : Number((putSum / callSum).toFixed(4));
    // derive premiums: prefer lastPrice, fallback to mid of bid/ask, else 0
    const callPremium = call ? (call.lastPrice != null ? call.lastPrice : ((call.bid != null && call.ask != null) ? ( (call.bid + call.ask) / 2 ) : 0)) : 0;
    const putPremium = put ? (put.lastPrice != null ? put.lastPrice : ((put.bid != null && put.ask != null) ? ( (put.bid + put.ask) / 2 ) : 0)) : 0;
    const straddlePrice = Number((callPremium + putPremium).toFixed(2));
    const ts = new Date().toISOString();
    return { ts, iv: ivPercent, pcr, callPremium: Number(callPremium.toFixed ? callPremium.toFixed(2) : callPremium), putPremium: Number(putPremium.toFixed ? putPremium.toFixed(2) : putPremium), straddlePrice };
  }

  if (expirySelect) expirySelect.addEventListener('change', refresh);
  if (refreshBtn) refreshBtn.addEventListener('click', refresh);

  // Initial draw
  const initialExpiry = expirySelect ? expirySelect.value : undefined;
  renderChart(initialExpiry);

  // After a short delay, if no data rendered, attempt a test draw and show diagnostics
  setTimeout(() => {
    if (!chart || !chart.data || !chart.data.datasets || chart.data.datasets.length === 0 || (chart.data.datasets[0].data || []).length === 0) {
      console.warn('No chart data detected after initial render; attempting test draw.');
      setStatus('No chart data detected — running diagnostics.');
      // Log availability of Chart and plugin
      console.log('window.Chart:', !!window.Chart);
      console.log('Chart.controllers:', window.Chart && window.Chart.controllers);
      drawTestChart();
    }
  }, 600);
});