"""Pre-seeded starter Hermifacts showcasing reactive workflows, zero-API-key LLM,
per-app persistent storage, and desktop notifications.
"""

from __future__ import annotations

SCENARIO_STUDIO_HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root { --bg:#0d1017; --card:#151a24; --line:rgba(255,255,255,.09); --ink:#eef2ff; --muted:#93a0b8; --accent:#6366f1; --ok:#34d399; --warn:#fbbf24; }
  * { box-sizing:border-box; }
  body { margin:0; padding:20px; background:var(--bg); color:var(--ink); font:14px/1.5 system-ui,-apple-system,sans-serif; }
  .top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
  h1 { margin:0; font-size:20px; letter-spacing:-0.02em; }
  .sub { color:var(--muted); font-size:12.5px; margin-top:2px; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  button { border:1px solid var(--line); background:var(--card); color:var(--ink); padding:7px 12px; border-radius:9px; font-size:12.5px; font-weight:600; cursor:pointer; }
  button:hover { border-color:rgba(255,255,255,.22); }
  button.primary { background:var(--accent); border-color:transparent; color:#fff; }
  button:disabled { opacity:.55; cursor:wait; }
  .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:14px; }
  .kpi { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; }
  .kpi-label { color:var(--muted); font-size:11.5px; text-transform:uppercase; letter-spacing:.05em; }
  .kpi-val { font-size:22px; font-weight:700; margin-top:4px; font-variant-numeric:tabular-nums; }
  .kpi-sub { font-size:11.5px; color:var(--ok); margin-top:2px; }
  .grid { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr); gap:14px; }
  @media (max-width:780px) { .grid { grid-template-columns:1fr; } }
  .panel { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; }
  .panel h2 { margin:0 0 10px; font-size:13.5px; color:var(--muted); font-weight:600; display:flex; justify-content:space-between; }
  svg.chart { width:100%; height:230px; display:block; }
  .memo { white-space:pre-wrap; font-size:13px; color:#d7dfef; line-height:1.6; min-height:140px; }
  .presets { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; }
  .chip { font-size:11.5px; padding:4px 9px; border-radius:99px; background:rgba(99,102,241,.16); color:#c7d2fe; border:1px solid rgba(99,102,241,.35); cursor:pointer; }
  .err { color:#fca5a5; font-size:12.5px; margin-top:8px; }
</style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Scenario Chart Studio</h1>
      <div class="sub">Reactive workflow document — change any parameter above to live-redraw projections, or run an AI stress test on your Hermes model.</div>
    </div>
    <div class="actions">
      <button id="btn-save">Save Preset</button>
      <button id="btn-ai" class="primary">AI Stress-Test</button>
    </div>
  </div>

  <div class="kpis" id="kpis"></div>

  <div class="grid">
    <div class="panel">
      <h2><span>12-Month Projected MRR &amp; Net Cash</span><span id="model-tag"></span></h2>
      <svg class="chart" id="chart" viewBox="0 0 600 230"></svg>
      <div class="presets" id="presets"></div>
    </div>
    <div class="panel">
      <h2><span>Hermes Executive Stress-Test</span><span id="llm-meta"></span></h2>
      <div class="memo" id="memo">Adjust the sliders/dropdown in the top bar — the chart and KPIs update instantly.

Click &quot;AI Stress-Test&quot; to ask your active Hermes provider for risks, break-even sensitivity, and concrete next moves.</div>
      <div class="err" id="err"></div>
    </div>
  </div>

<script>
  const fmt = (n) => '$' + Math.round(n).toLocaleString();
  let state = Object.assign({ model: 'SaaS', start_mrr: 12000, growth_pct: 14, churn_pct: 4, burn: 18000 }, window.hermesApp.params);

  function compute(p) {
    const mult = p.model === 'Usage-Based' ? 1.08 : p.model === 'Agency' ? 0.92 : 1.0;
    const months = [];
    let mrr = Number(p.start_mrr) || 12000;
    let cumCash = 120000;
    let breakEven = null;
    for (let i = 1; i <= 12; i++) {
      const netRate = ((Number(p.growth_pct) - Number(p.churn_pct)) / 100) * mult;
      mrr = Math.max(0, mrr * (1 + netRate));
      const net = mrr - (Number(p.burn) || 18000);
      cumCash += net;
      if (breakEven === null && net >= 0) breakEven = i;
      months.push({ m: 'M' + i, mrr, net, cumCash });
    }
    return { months, endMrr: months[11].mrr, arr: months[11].mrr * 12, endCash: months[11].cumCash, breakEven };
  }

  function render() {
    const res = compute(state);
    document.getElementById('model-tag').textContent = state.model + ' · +' + state.growth_pct + '% / -' + state.churn_pct + '%';
    document.getElementById('kpis').innerHTML = [
      { l: 'Month 12 MRR', v: fmt(res.endMrr), s: 'Start ' + fmt(state.start_mrr) },
      { l: 'Projected ARR', v: fmt(res.arr), s: 'Run-rate at M12' },
      { l: 'Cash at M12', v: fmt(res.endCash), s: res.endCash >= 0 ? 'Positive runway' : 'Needs funding' },
      { l: 'Break-Even', v: res.breakEven ? 'Month ' + res.breakEven : 'M12+', s: 'Burn ' + fmt(state.burn) + '/mo' }
    ].map(k => '<div class="kpi"><div class="kpi-label">' + k.l + '</div><div class="kpi-val">' + k.v + '</div><div class="kpi-sub">' + k.s + '</div></div>').join('');

    const svg = document.getElementById('chart');
    const maxV = Math.max(1000, ...res.months.map(x => x.mrr), Number(state.burn) || 18000) * 1.15;
    const padL = 54, padR = 16, padT = 18, padB = 28, W = 600, H = 230;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xAt = (i) => padL + (i / 11) * plotW;
    const yAt = (v) => padT + plotH - (Math.max(0, v) / maxV) * plotH;
    const pts = res.months.map((d, i) => xAt(i).toFixed(1) + ',' + yAt(d.mrr).toFixed(1)).join(' ');
    const area = padL + ',' + (padT + plotH) + ' ' + pts + ' ' + xAt(11).toFixed(1) + ',' + (padT + plotH);
    const burnY = yAt(Number(state.burn) || 18000).toFixed(1);
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const val = (maxV * g) / 4, y = yAt(val).toFixed(1);
      grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="rgba(255,255,255,0.07)"/>';
      grid += '<text x="' + (padL - 8) + '" y="' + (Number(y) + 4) + '" text-anchor="end" font-size="10" fill="#8290a8">$' + Math.round(val / 1000) + 'k</text>';
    }
    const labels = res.months.map((d, i) => '<text x="' + xAt(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#8290a8">' + d.m + '</text>').join('');
    const dots = res.months.map((d, i) => '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(d.mrr).toFixed(1) + '" r="3.5" fill="#818cf8"><title>' + d.m + ': ' + fmt(d.mrr) + '</title></circle>').join('');
    svg.innerHTML = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366f1" stop-opacity="0.42"/><stop offset="100%" stop-color="#6366f1" stop-opacity="0.02"/></linearGradient></defs>'
      + grid
      + '<line x1="' + padL + '" y1="' + burnY + '" x2="' + (W - padR) + '" y2="' + burnY + '" stroke="#fbbf24" stroke-dasharray="5 4" stroke-width="1.5"/>'
      + '<text x="' + (W - padR - 4) + '" y="' + (Number(burnY) - 5) + '" text-anchor="end" font-size="10" fill="#fbbf24">Burn ' + fmt(state.burn) + '</text>'
      + '<polygon points="' + area + '" fill="url(#g)"/>'
      + '<polyline fill="none" stroke="#818cf8" stroke-width="2.5" points="' + pts + '"/>'
      + dots + labels;
  }

  async function loadPresets() {
    try {
      const saved = (await window.hermesApp.storage.get('presets')) || [];
      const el = document.getElementById('presets');
      el.innerHTML = saved.map((p, idx) => '<button class="chip" data-idx="' + idx + '">' + p.label + '</button>').join('');
      el.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
        const p = saved[Number(btn.dataset.idx)];
        if (p) { state = Object.assign({}, state, p.params); render(); }
      }));
    } catch (e) {}
  }

  document.getElementById('btn-save').addEventListener('click', async () => {
    const saved = (await window.hermesApp.storage.get('presets')) || [];
    saved.unshift({ label: state.model + ' +' + state.growth_pct + '% / -' + state.churn_pct + '%', params: Object.assign({}, state) });
    await window.hermesApp.storage.set('presets', saved.slice(0, 6));
    loadPresets();
  });

  document.getElementById('btn-ai').addEventListener('click', async () => {
    const btn = document.getElementById('btn-ai');
    const err = document.getElementById('err');
    const memo = document.getElementById('memo');
    btn.disabled = true; err.textContent = ''; memo.textContent = 'Running stress-test on your Hermes model...';
    try {
      const calc = compute(state);
      const out = await window.hermesApp.llm.complete([
        { role: 'system', content: 'You are a concise CFO advisor. Reply in 4 crisp bullet points: 1) verdict, 2) biggest risk, 3) sensitivity lever, 4) one concrete action. No filler.' },
        { role: 'user', content: JSON.stringify({ params: state, m12_mrr: Math.round(calc.endMrr), arr: Math.round(calc.arr), cash_m12: Math.round(calc.endCash), break_even_month: calc.breakEven }) }
      ], { max_tokens: 320, temperature: 0.3 });
      memo.textContent = out.text || '(empty response)';
      document.getElementById('llm-meta').textContent = (out.provider || '') + (out.model ? ' · ' + out.model : '');
    } catch (e) {
      err.textContent = e.message || String(e);
      memo.textContent = 'Stress-test blocked or failed — see message below.';
    } finally { btn.disabled = false; }
  });

  window.hermesApp.onParamsChange((p) => { state = Object.assign({}, state, p); render(); });
  render();
  loadPresets();
</script>
</body></html>"""

SCRATCHPAD_HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing:border-box; }
  body { margin:0; padding:20px; background:#0d1017; color:#eef2ff; font:14px/1.5 system-ui,-apple-system,sans-serif; }
  h1 { margin:0 0 4px; font-size:19px; }
  .sub { color:#93a0b8; font-size:12.5px; margin-bottom:14px; }
  .modes { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
  .mode { border:1px solid rgba(255,255,255,.12); background:#151a24; color:#cbd5e1; border-radius:99px; padding:5px 12px; font-size:12.5px; cursor:pointer; }
  .mode.active { background:#0ea5e9; border-color:transparent; color:#fff; font-weight:600; }
  .split { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width:740px) { .split { grid-template-columns:1fr; } }
  textarea { width:100%; min-height:220px; background:#151a24; color:#f1f5f9; border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:12px; font:13.5px/1.55 inherit; resize:vertical; }
  .out { min-height:220px; background:#121722; border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:14px; white-space:pre-wrap; font-size:13.5px; line-height:1.6; }
  .bar { display:flex; align-items:center; gap:8px; margin-top:10px; flex-wrap:wrap; }
  button.run { background:#0ea5e9; color:#fff; border:0; border-radius:9px; padding:8px 16px; font-weight:600; cursor:pointer; }
  button.sec { background:#151a24; color:#cbd5e1; border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:8px 12px; cursor:pointer; }
  .meta { color:#93a0b8; font-size:12px; margin-left:auto; font-family:ui-monospace,monospace; }
</style>
</head>
<body>
  <h1>Quick AI Scratchpad</h1>
  <div class="sub">Zero-API-key mini app powered directly by your active Hermes model &amp; persistent storage.</div>
  <div class="modes" id="modes"></div>
  <div class="split">
    <textarea id="src" placeholder="Paste notes, an email, meeting transcript, or draft here..."></textarea>
    <div class="out" id="out">Output appears here...</div>
  </div>
  <div class="bar">
    <button class="run" id="run">Run with Hermes</button>
    <button class="sec" id="save">Save Note</button>
    <span class="meta" id="meta"></span>
  </div>
<script>
  const MODES = [
    { id: 'summarize', label: 'TL;DR', sys: 'Summarize into 3 crisp bullet points. No preamble.' },
    { id: 'actions', label: 'Action Items', sys: 'Extract concrete action items as a markdown checklist with owners if mentioned.' },
    { id: 'sharp', label: 'Rewrite Crisp', sys: 'Rewrite to be concise, direct, and clear while keeping the exact meaning.' },
    { id: 'critique', label: 'Red-Team', sys: 'List the top 3 flaws, hidden assumptions, or missing edge cases.' }
  ];
  let mode = MODES[0];
  const modesEl = document.getElementById('modes');
  function drawModes() {
    modesEl.innerHTML = MODES.map(m => '<button class="mode' + (m.id === mode.id ? ' active' : '') + '" data-id="' + m.id + '">' + m.label + '</button>').join('');
    modesEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { mode = MODES.find(x => x.id === b.dataset.id); drawModes(); }));
  }
  drawModes();
  window.hermesApp.storage.get('draft').then(v => { if (v) document.getElementById('src').value = v; }).catch(() => {});
  document.getElementById('save').addEventListener('click', async () => {
    await window.hermesApp.storage.set('draft', document.getElementById('src').value);
    document.getElementById('meta').textContent = 'Saved to app storage';
  });
  document.getElementById('run').addEventListener('click', async () => {
    const text = document.getElementById('src').value.trim();
    if (!text) return;
    const btn = document.getElementById('run');
    const out = document.getElementById('out');
    btn.disabled = true; out.textContent = 'Thinking...';
    try {
      const res = await window.hermesApp.llm.complete([{ role: 'system', content: mode.sys }, { role: 'user', content: text }], { max_tokens: 400 });
      out.textContent = res.text || '';
      document.getElementById('meta').textContent = (res.provider || 'hermes') + (res.model ? ' · ' + res.model : '');
    } catch (e) { out.textContent = 'Error: ' + (e.message || e); }
    finally { btn.disabled = false; }
  });
</script>
</body></html>"""

FOCUS_PULSE_HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing:border-box; }
  body { margin:0; padding:22px; background:#0d1017; color:#eef2ff; font:14px/1.5 system-ui,-apple-system,sans-serif; display:grid; grid-template-columns:280px 1fr; gap:18px; }
  @media (max-width:680px) { body { grid-template-columns:1fr; } }
  .card { background:#151a24; border:1px solid rgba(255,255,255,.09); border-radius:16px; padding:18px; }
  .ring-wrap { display:flex; flex-direction:column; align-items:center; gap:14px; }
  .time { font-size:38px; font-weight:700; font-variant-numeric:tabular-nums; letter-spacing:-0.02em; }
  .row { display:flex; gap:8px; }
  button { border:1px solid rgba(255,255,255,.12); background:#1d2433; color:#eef2ff; padding:7px 14px; border-radius:9px; font-weight:600; cursor:pointer; }
  button.primary { background:#10b981; border-color:transparent; color:#042f2e; }
  .add { display:flex; gap:8px; margin-bottom:12px; }
  .add input { flex:1; background:#0f131c; color:#eef2ff; border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:8px 10px; }
  ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
  li { display:flex; align-items:center; gap:8px; background:#10141e; padding:8px 10px; border-radius:9px; }
  li.done span { text-decoration:line-through; color:#64748b; }
</style>
</head>
<body>
  <div class="card ring-wrap">
    <svg width="170" height="170" viewBox="0 0 170 170">
      <circle cx="85" cy="85" r="72" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>
      <circle id="prog" cx="85" cy="85" r="72" fill="none" stroke="#10b981" stroke-width="10" stroke-linecap="round" transform="rotate(-90 85 85)" stroke-dasharray="452.39" stroke-dashoffset="0"/>
    </svg>
    <div class="time" id="clock">25:00</div>
    <div class="row">
      <button class="primary" id="toggle">Start</button>
      <button id="reset">Reset</button>
      <button id="ping">Test Notify</button>
    </div>
  </div>
  <div class="card">
    <h2 style="margin:0 0 10px;font-size:16px">Sprint Queue</h2>
    <div class="add"><input id="inp" placeholder="Add focus task and press Enter..."/><button id="add-btn">Add</button></div>
    <ul id="list"></ul>
  </div>
<script>
  let mins = Number(window.hermesApp.params.minutes) || 25;
  let total = mins * 60, left = total, timer = null, tasks = [];
  const C = 452.39;
  function drawClock() {
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    document.getElementById('clock').textContent = m + ':' + s;
    document.getElementById('prog').setAttribute('stroke-dashoffset', String(C * (1 - left / Math.max(1, total))));
  }
  function drawTasks() {
    const ul = document.getElementById('list');
    ul.innerHTML = tasks.map((t, i) => '<li class="' + (t.done ? 'done' : '') + '"><input type="checkbox" data-i="' + i + '" ' + (t.done ? 'checked' : '') + '/><span style="flex:1">' + t.text.replace(/</g, '&lt;') + '</span><button data-del="' + i + '" style="padding:2px 7px;font-size:11px">×</button></li>').join('');
    ul.querySelectorAll('input').forEach(cb => cb.addEventListener('change', () => { tasks[cb.dataset.i].done = cb.checked; save(); }));
    ul.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { tasks.splice(Number(b.dataset.del), 1); save(); }));
  }
  function save() { drawTasks(); window.hermesApp.storage.set('tasks', tasks).catch(() => {}); }
  window.hermesApp.storage.get('tasks').then(t => { if (Array.isArray(t)) { tasks = t; drawTasks(); } }).catch(() => {});
  function addTask() { const el = document.getElementById('inp'); const v = el.value.trim(); if (!v) return; tasks.push({ text: v, done: false }); el.value = ''; save(); }
  document.getElementById('add-btn').addEventListener('click', addTask);
  document.getElementById('inp').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  document.getElementById('toggle').addEventListener('click', () => {
    if (timer) { clearInterval(timer); timer = null; document.getElementById('toggle').textContent = 'Start'; return; }
    document.getElementById('toggle').textContent = 'Pause';
    timer = setInterval(() => {
      left = Math.max(0, left - 1); drawClock();
      if (left === 0) { clearInterval(timer); timer = null; document.getElementById('toggle').textContent = 'Start'; window.hermesApp.notify('Focus Pulse', 'Sprint complete! Time for a short break.').catch(() => {}); }
    }, 1000);
  });
  document.getElementById('reset').addEventListener('click', () => { if (timer) { clearInterval(timer); timer = null; } left = total; document.getElementById('toggle').textContent = 'Start'; drawClock(); });
  document.getElementById('ping').addEventListener('click', () => { window.hermesApp.notify('Focus Pulse', 'Notifications are wired up and working!').catch(e => alert(e.message)); });
  window.hermesApp.onParamsChange(p => { if (p.minutes) { mins = Number(p.minutes); total = mins * 60; if (!timer) { left = total; drawClock(); } } });
  drawClock();
</script>
</body></html>"""

STARTER_APPS = [
    {
        "app_id": "scenario-chart-studio",
        "name": "Scenario Chart Studio",
        "description": "Reactive workflow doc: change pricing model, growth, churn or burn to live-redraw SVG projections, save presets, and run AI stress-tests on your Hermes model.",
        "icon": "📈",
        "accent": "#6366f1",
        "category": "workflow",
        "requested_tier": "app",
        "requested_caps": ["llm"],
        "inputs": [
            {"id": "model", "label": "Model", "type": "select", "default": "SaaS", "options": ["SaaS", "Usage-Based", "Agency"]},
            {"id": "start_mrr", "label": "Start MRR", "type": "number", "default": 12000, "min": 1000, "max": 500000, "step": 1000},
            {"id": "growth_pct", "label": "Growth %", "type": "range", "default": 14, "min": 0, "max": 40, "step": 1},
            {"id": "churn_pct", "label": "Churn %", "type": "range", "default": 4, "min": 0, "max": 20, "step": 1},
            {"id": "burn", "label": "Burn/mo", "type": "number", "default": 18000, "min": 1000, "max": 500000, "step": 1000},
        ],
        "html": SCENARIO_STUDIO_HTML,
    },
    {
        "app_id": "ai-scratchpad",
        "name": "Quick AI Scratchpad",
        "description": "Zero-API-key mini workbench for TL;DRs, action item extraction, crisp rewrites, and red-teaming using your active Hermes provider.",
        "icon": "⚡",
        "accent": "#0ea5e9",
        "category": "ai-tool",
        "requested_tier": "app",
        "requested_caps": ["llm"],
        "inputs": [],
        "html": SCRATCHPAD_HTML,
    },
    {
        "app_id": "focus-pulse",
        "name": "Focus Pulse",
        "description": "Standalone Pomodoro timer + sprint task queue with persistent storage and native notifications.",
        "icon": "⏱️",
        "accent": "#10b981",
        "category": "productivity",
        "requested_tier": "app",
        "requested_caps": ["notify"],
        "inputs": [
            {"id": "minutes", "label": "Sprint (min)", "type": "range", "default": 25, "min": 5, "max": 60, "step": 5},
        ],
        "html": FOCUS_PULSE_HTML,
    },
]

NEW_APP_TEMPLATE_INPUTS = [
    {"id": "tone", "label": "Tone", "type": "select", "default": "Concise", "options": ["Concise", "Analytical", "Creative"]},
    {"id": "scale", "label": "Multiplier", "type": "range", "default": 10, "min": 1, "max": 50, "step": 1},
]

NEW_APP_TEMPLATE_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #0f172a; color: #e2e8f0; }
  .card { max-width: 720px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 18px; }
  h1 { margin: 0 0 8px; font-size: 20px; }
  p { color: #94a3b8; font-size: 13px; margin: 0 0 14px; }
  textarea { width: 100%; box-sizing: border-box; min-height: 90px; border-radius: 10px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; padding: 10px; font: inherit; }
  .row { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
  button { background: #6366f1; color: #fff; border: 0; border-radius: 10px; padding: 8px 14px; font-weight: 600; cursor: pointer; }
  pre { white-space: pre-wrap; background: #0b1120; border: 1px solid #334155; border-radius: 10px; padding: 12px; margin-top: 14px; font-size: 13px; min-height: 54px; }
</style></head><body>
<div class="card">
  <h1>Interactive Hermifact</h1>
  <p>Uses your active Hermes model with zero API keys. Adjust reactive parameters above to live-update.</p>
  <textarea id="prompt" placeholder="Describe what you want to analyze or generate..."></textarea>
  <div class="row">
    <button id="run">Run with Hermes</button>
    <span id="meta" style="font-size:12px;color:#94a3b8;"></span>
  </div>
  <pre id="out">Ready.</pre>
</div>
<script>
  let params = { tone: 'Concise', scale: 10 };
  const meta = document.getElementById('meta');
  const out = document.getElementById('out');
  function paintMeta() { meta.textContent = `Tone: ${params.tone} · Multiplier: ${params.scale}x`; }
  if (window.hermesApp && window.hermesApp.onParamsChange) {
    window.hermesApp.onParamsChange((next) => { params = Object.assign({}, params, next || {}); paintMeta(); });
  }
  document.getElementById('run').addEventListener('click', async () => {
    const text = document.getElementById('prompt').value.trim() || 'Give me 3 sharp ideas to test next.';
    out.textContent = 'Thinking via Hermes...';
    try {
      const res = await window.hermesApp.llm.complete({
        prompt: `Respond in a ${params.tone} tone (scale=${params.scale}):\n\n${text}`
      });
      out.textContent = res.text || JSON.stringify(res);
    } catch (err) {
      out.textContent = 'Error: ' + (err.message || err);
    }
  });
  paintMeta();
</script>
</body></html>"""
