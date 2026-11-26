/**
 * HERMIFACTS — Installable AI Apps Studio for Hermes Desktop.
 *
 * Turns interactive HTML/JS/CSS artifacts into standalone installable PWA and
 * native OS desktop apps powered by the user's own Hermes LLM provider
 * (zero API keys), reactive workflow parameters, portable hf1.<token> share
 * links, and hash-pinned 3-tier permissions.
 */
import * as SDK from '@hermes/plugin-sdk'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const host = SDK.host || {
  notify: () => {},
  navigate: () => {},
  openLink: (u) => { try { window.open(u, '_blank', 'noopener,noreferrer') } catch {} },
  composer: { setDraft: async () => false, focus: () => {} }
}
const ROUTES_AREA = SDK.ROUTES_AREA || 'routes'
const SIDEBAR_NAV_AREA = SDK.SIDEBAR_NAV_AREA || 'sidebar.nav'
const PALETTE_AREA = SDK.PALETTE_AREA || 'palette'
const STATUSBAR_AREAS = SDK.STATUSBAR_AREAS || { left: 'statusBar.left', right: 'statusBar.right' }
const TRANSCRIPT_DIRECTIVE_AREA = SDK.TRANSCRIPT_DIRECTIVE_AREA || 'transcript.directives'

const ID = 'hermifacts'
const ROUTE = '/hermifacts'
const h = React.createElement

const CSS = `
.hf-root {
  --hf-canvas: #0c0e13;
  --hf-panel: #13161f;
  --hf-card: #191d29;
  --hf-card-hi: #212636;
  --hf-inset: #0a0c10;
  --hf-line: rgba(255, 255, 255, 0.09);
  --hf-line-hi: rgba(255, 255, 255, 0.18);
  --hf-ink: #f1f4fa;
  --hf-ink2: #9ba5b8;
  --hf-ink3: #78839a;
  --hf-accent: var(--ui-accent, #6366f1);
  --hf-ok: #34d399;
  --hf-warn: #f59e0b;
  --hf-danger: #f87171;
  --hf-r-sm: 8px;
  --hf-r-md: 12px;
  --hf-r-lg: 16px;
  --hf-r-pill: 999px;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--hf-canvas);
  color: var(--hf-ink);
  font-family: var(--dt-font-sans, var(--ui-font-sans, system-ui, -apple-system, sans-serif));
  font-size: 14px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  position: relative;
  overflow: hidden;
}
.hf-root[data-skin="light"] {
  --hf-canvas: #f6f4ef;
  --hf-panel: #ffffff;
  --hf-card: #f1ede5;
  --hf-card-hi: #e7e1d5;
  --hf-inset: #faf8f4;
  --hf-line: rgba(24, 24, 32, 0.10);
  --hf-line-hi: rgba(24, 24, 32, 0.22);
  --hf-ink: #171923;
  --hf-ink2: #4b5565;
  --hf-ink3: #647084;
  --hf-ok: #059669;
  --hf-warn: #b45309;
  --hf-danger: #dc2626;
}
.hf-root *, .hf-root *::before, .hf-root *::after { box-sizing: border-box; }
.hf-root button, .hf-root input, .hf-root select, .hf-root textarea {
  font-family: inherit;
  color: inherit;
}
.hf-mono {
  font-family: var(--dt-font-mono, var(--ui-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace));
}

/* Header bar */
.hf-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  background: var(--hf-panel);
  border-bottom: 1px solid var(--hf-line);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.hf-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.hf-brand-mark {
  width: 30px; height: 30px; border-radius: 9px;
  display: grid; place-items: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff; font-size: 15px; font-weight: 700; flex-shrink: 0;
  box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
}
.hf-brand-title { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
.hf-brand-sub { font-size: 12px; color: var(--hf-ink2); }
.hf-topbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Buttons & inputs */
.hf-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 32px; padding: 0 12px; border-radius: var(--hf-r-sm);
  border: 1px solid var(--hf-line); background: var(--hf-card);
  color: var(--hf-ink); font-size: 12.5px; font-weight: 600;
  cursor: pointer; white-space: nowrap;
  transition: background .14s ease, border-color .14s ease, transform .08s ease;
}
.hf-btn:hover:not(:disabled) { background: var(--hf-card-hi); border-color: var(--hf-line-hi); }
.hf-btn:active:not(:disabled) { transform: translateY(0.5px); }
.hf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.hf-btn-primary {
  background: var(--hf-accent); border-color: transparent; color: #fff;
}
.hf-btn-primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--hf-accent); border-color: transparent; }
.hf-btn-warn {
  background: rgba(245, 158, 11, 0.16); border-color: rgba(245, 158, 11, 0.45); color: var(--hf-warn);
}
.hf-btn-danger {
  background: rgba(248, 113, 113, 0.12); border-color: rgba(248, 113, 113, 0.35); color: var(--hf-danger);
}
.hf-btn-sm { min-height: 28px; padding: 0 9px; font-size: 12px; }
.hf-input, .hf-select, .hf-textarea {
  width: 100%; padding: 8px 10px; border-radius: var(--hf-r-sm);
  border: 1px solid var(--hf-line); background: var(--hf-inset);
  color: var(--hf-ink); font-size: 13px; outline: none;
}
.hf-input:focus, .hf-select:focus, .hf-textarea:focus { border-color: var(--hf-accent); }

/* Pills & badges */
.hf-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: var(--hf-r-pill);
  font-size: 11.5px; font-weight: 600;
  border: 1px solid var(--hf-line); background: var(--hf-card); color: var(--hf-ink2);
  white-space: nowrap;
}
.hf-pill[data-tier="app"] { background: rgba(99, 102, 241, 0.15); border-color: rgba(99, 102, 241, 0.35); color: #a5b4fc; }
.hf-root[data-skin="light"] .hf-pill[data-tier="app"] { color: #4338ca; }
.hf-pill[data-tier="full"] { background: rgba(248, 113, 113, 0.15); border-color: rgba(248, 113, 113, 0.38); color: var(--hf-danger); }
.hf-pill[data-tone="warn"] { background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.42); color: var(--hf-warn); }
.hf-pill[data-tone="ok"] { background: rgba(52, 211, 153, 0.14); border-color: rgba(52, 211, 153, 0.35); color: var(--hf-ok); }

/* Main 2-column studio body */
.hf-body {
  flex: 1; min-height: 0;
  display: grid;
  grid-template-columns: 276px minmax(0, 1fr);
}
@media (max-width: 860px) {
  .hf-body { grid-template-columns: 1fr; }
  .hf-rail { max-height: 220px; border-right: 0; border-bottom: 1px solid var(--hf-line); }
}

/* Left rail */
.hf-rail {
  display: flex; flex-direction: column; min-height: 0;
  background: var(--hf-panel); border-right: 1px solid var(--hf-line);
}
.hf-rail-tools { padding: 12px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--hf-line); }
.hf-cats { display: flex; gap: 5px; flex-wrap: wrap; }
.hf-cat {
  border: 1px solid var(--hf-line); background: transparent; color: var(--hf-ink2);
  border-radius: var(--hf-r-pill); padding: 3px 9px; font-size: 11.5px; font-weight: 600;
  cursor: pointer;
}
.hf-cat[data-active="1"] { background: var(--hf-card-hi); border-color: var(--hf-line-hi); color: var(--hf-ink); }
.hf-rail-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.hf-item {
  width: 100%; text-align: left; display: flex; align-items: flex-start; gap: 10px;
  padding: 10px; border-radius: var(--hf-r-md);
  border: 1px solid transparent; background: transparent; cursor: pointer;
  transition: background .12s ease, border-color .12s ease;
}
.hf-item:hover { background: var(--hf-card); }
.hf-item[data-selected="1"] { background: var(--hf-card); border-color: var(--hf-line-hi); }
.hf-item-icon {
  width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
  font-size: 17px; flex-shrink: 0; color: #fff;
}
.hf-item-meta { min-width: 0; flex: 1; }
.hf-item-name { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hf-item-desc { font-size: 12px; color: var(--hf-ink2); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hf-item-tags { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 6px; }

/* Stage */
.hf-stage { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--hf-canvas); }
.hf-stage-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 12px 18px; background: var(--hf-panel); border-bottom: 1px solid var(--hf-line);
  flex-shrink: 0;
}
.hf-stage-id { display: flex; align-items: center; gap: 11px; min-width: 0; }
.hf-stage-title { font-size: 15.5px; font-weight: 700; letter-spacing: -0.015em; }
.hf-stage-sub { font-size: 12px; color: var(--hf-ink2); margin-top: 1px; }
.hf-stage-controls { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.hf-seg {
  display: inline-flex; padding: 2px; border-radius: var(--hf-r-sm);
  background: var(--hf-inset); border: 1px solid var(--hf-line);
}
.hf-seg button {
  border: 0; background: transparent; color: var(--hf-ink2);
  padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
}
.hf-seg button[data-active="1"] { background: var(--hf-card-hi); color: var(--hf-ink); }

/* Approval banner */
.hf-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  padding: 9px 18px; background: rgba(245, 158, 11, 0.11);
  border-bottom: 1px solid rgba(245, 158, 11, 0.32);
  font-size: 12.5px; flex-shrink: 0;
}
.hf-banner-text { color: var(--hf-ink); }

/* Reactive workflow parameters strip */
.hf-params {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 9px 18px; background: var(--hf-inset);
  border-bottom: 1px solid var(--hf-line);
  flex-shrink: 0;
}
.hf-param {
  display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--hf-ink2);
}
.hf-param label { font-weight: 600; white-space: nowrap; }
.hf-param select, .hf-param input[type="text"], .hf-param input[type="number"] {
  padding: 4px 8px; border-radius: 6px; border: 1px solid var(--hf-line);
  background: var(--hf-panel); color: var(--hf-ink); font-size: 12px;
}
.hf-param input[type="range"] { width: 108px; accent-color: var(--hf-accent); }

/* Iframe stage */
.hf-frame-wrap { flex: 1; min-height: 0; position: relative; background: #0b0d12; }
.hf-frame { width: 100%; height: 100%; border: 0; display: block; background: #0d1017; }
.hf-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 6px 16px; background: var(--hf-panel); border-top: 1px solid var(--hf-line);
  font-size: 12px; color: var(--hf-ink2); flex-shrink: 0;
}

/* Code & inspector panels */
.hf-pane { flex: 1; min-height: 0; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.hf-card { background: var(--hf-panel); border: 1px solid var(--hf-line); border-radius: var(--hf-r-lg); padding: 16px; }
.hf-card h3 { margin: 0 0 10px; font-size: 13.5px; font-weight: 700; }
.hf-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.hf-field { display: flex; flex-direction: column; gap: 4px; }
.hf-field label { font-size: 12px; font-weight: 600; color: var(--hf-ink2); }
.hf-code { min-height: 320px; font-size: 12.5px; line-height: 1.5; resize: vertical; }
.hf-kv-row, .hf-audit-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid var(--hf-line); font-size: 12.5px;
}
.hf-kv-row:last-child, .hf-audit-row:last-child { border-bottom: 0; }

/* Modals */
.hf-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(5, 7, 12, 0.66); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.hf-modal {
  width: 100%; max-width: 580px; max-height: 88vh; overflow-y: auto;
  background: var(--hf-panel); color: var(--hf-ink);
  border: 1px solid var(--hf-line-hi); border-radius: var(--hf-r-lg);
  padding: 20px; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column; gap: 14px;
}
.hf-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.hf-modal-title { font-size: 16px; font-weight: 700; }
.hf-modal-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.hf-tier-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 540px) { .hf-tier-grid { grid-template-columns: 1fr; } }
.hf-tier-card {
  text-align: left; padding: 11px; border-radius: var(--hf-r-md);
  border: 1px solid var(--hf-line); background: var(--hf-inset); cursor: pointer;
}
.hf-tier-card[data-selected="1"] { border-color: var(--hf-accent); background: rgba(99, 102, 241, 0.12); }
.hf-check-grid { display: flex; gap: 8px; flex-wrap: wrap; }
.hf-check {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px;
  border-radius: var(--hf-r-sm); border: 1px solid var(--hf-line); background: var(--hf-inset);
  font-size: 12.5px; cursor: pointer;
}
.hf-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 36px; gap: 10px; color: var(--hf-ink2);
}
.hf-err { color: var(--hf-danger); font-size: 12.5px; }
`

/* -------------------------------------------------------------- data layer */
let CTX = null
const setCtx = (c) => { CTX = c }

const api = async (path, opts) => {
  if (CTX && typeof CTX.rest === 'function') {
    const out = await CTX.rest(path, opts)
    if (out && out.ok === false) throw new Error(out.error || 'Request rejected by Hermifacts backend')
    if (out && out.detail && out.ok === undefined) throw new Error(String(out.detail))
    return out
  }
  const method = (opts && opts.method) || 'GET'
  const init = { method, credentials: 'include', headers: {} }
  if (opts && opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
  }
  const res = await fetch(`/api/plugins/${ID}${path}`, init)
  const out = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
  if (!res.ok || out.ok === false) throw new Error(out.error || out.detail || `HTTP ${res.status}`)
  return out
}

const BRIDGE_ROUTES = {
  'llm.complete': '/llm/complete',
  'llm.structured': '/llm/structured',
  'storage.get': '/storage/get',
  'storage.set': '/storage/set',
  'storage.delete': '/storage/delete',
  'storage.list': '/storage/list',
  'tools.call': '/tools/call',
  'notify': '/notify',
  'fs.list': '/fs/list',
  'fs.read': '/fs/read',
  'fs.write': '/fs/write'
}

async function callBridge(appId, method, payload) {
  const suffix = BRIDGE_ROUTES[method]
  if (!suffix) throw new Error(`Unknown Hermifact bridge method: ${method}`)
  return api(`/bridge/${encodeURIComponent(appId)}${suffix}`, {
    method: 'POST',
    body: payload || {}
  })
}

function safeAccent(accent) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(accent || '').trim()) ? String(accent).trim() : '#6366f1'
}

const persist = {
  get(key, dflt) {
    try {
      const v = CTX && CTX.storage && CTX.storage.get(key)
      return v === undefined || v === null ? dflt : v
    } catch {
      return dflt
    }
  },
  set(key, value) {
    try { CTX && CTX.storage && CTX.storage.set(key, value) } catch { /* noop */ }
  }
}

function detectSkin() {
  try {
    const root = document.documentElement
    const dt = (root.getAttribute('data-theme') || root.getAttribute('data-hermes-theme') || '').toLowerCase()
    if (dt.includes('light') || dt.includes('latte') || dt.includes('dawn')) return 'light'
    const bg = getComputedStyle(document.body).backgroundColor || ''
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (m) {
      const lum = (0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3])) / 255
      return lum > 0.58 ? 'light' : 'dark'
    }
  } catch { /* noop */ }
  return 'dark'
}

async function copyText(text, label) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    if (host.notify) host.notify({ title: 'Hermifacts', message: `${label || 'Copied'} to clipboard` })
    return true
  } catch {
    return false
  }
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function parseUrlHints() {
  try {
    const q = new URLSearchParams(window.location.search || '')
    let imp = q.get('import') || ''
    let app = q.get('app') || ''
    if ((!imp || !app) && window.location.hash && window.location.hash.includes('?')) {
      const hq = new URLSearchParams(window.location.hash.split('?')[1] || '')
      if (!imp) imp = hq.get('import') || ''
      if (!app) app = hq.get('app') || ''
    }
    return { importToken: imp.trim(), appId: app.trim() }
  } catch {
    return { importToken: '', appId: '' }
  }
}

const TIER_INFO = {
  sandbox: {
    label: 'Sandbox',
    level: 'Tier 1',
    desc: 'Isolated UI + per-app persistent KV storage. No LLM, tools, or local files.'
  },
  app: {
    label: 'App',
    level: 'Tier 2',
    desc: 'Zero-API-key Hermes LLM calls, desktop notifications, and allowlisted Hermes tools.'
  },
  full: {
    label: 'Full',
    level: 'Tier 3',
    desc: 'Everything in App plus read/write inside one explicitly approved local folder.'
  }
}

const ACCENT_SWATCHES = ['#6366f1', '#10b981', '#0ea5e9', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444']

/* ---------------------------------------------------------------- modals */

const BLOCKED_APP_TOOLS = new Set([
  'terminal', 'process', 'process_manage', 'close_terminal', 'read_terminal',
  'execute_code', 'write_file', 'patch', 'delegate_task', 'cronjob',
  'cronjob_manage', 'send_message', 'computer_use'
])
const isBlockedAppTool = (name) => BLOCKED_APP_TOOLS.has(String(name || '').trim().toLowerCase())
const cleanToolSelection = (items) => new Set((items || []).filter((t) => !isBlockedAppTool(t)))

function PermissionsModal({ app, availableTools, onClose, onSaved }) {
  const [tier, setTier] = useState(app.requested_tier || app.effective_tier || 'sandbox')
  const [caps, setCaps] = useState(() => new Set(app.requested_caps && app.requested_caps.length ? app.requested_caps : (app.effective_caps || [])))
  const [tools, setTools] = useState(() => cleanToolSelection(app.requested_tools || app.effective_tools || []))
  const [fsRoot, setFsRoot] = useState(app.requested_fs_root || app.effective_fs_root || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggleCap = (c) => {
    setCaps((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  const toggleTool = (t) => {
    setTools((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const approve = async () => {
    setBusy(true); setErr('')
    try {
      const out = await api(`/apps/${encodeURIComponent(app.id)}/approve`, {
        method: 'POST',
        body: {
          tier,
          caps: Array.from(caps),
          tools: Array.from(tools),
          fs_root: tier === 'full' ? fsRoot.trim() : '',
          expected_hash: app.code_hash
        }
      })
      onSaved(out.app)
      onClose()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    setBusy(true); setErr('')
    try {
      const out = await api(`/apps/${encodeURIComponent(app.id)}/revoke`, { method: 'POST', body: {} })
      onSaved(out.app)
      onClose()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const toolList = useMemo(() => {
    const s = new Set(availableTools || [])
    ;(app.requested_tools || []).forEach((t) => { if (!isBlockedAppTool(t)) s.add(t) })
    ;(app.effective_tools || []).forEach((t) => { if (!isBlockedAppTool(t)) s.add(t) })
    return Array.from(s).filter((t) => !isBlockedAppTool(t)).sort()
  }, [availableTools, app])

  return h('div', { className: 'hf-backdrop', onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
    h('div', { className: 'hf-modal', role: 'dialog', 'aria-label': 'Hermifact permissions' },
      h('div', { className: 'hf-modal-head' },
        h('div', null,
          h('div', { className: 'hf-modal-title' }, `${app.icon || '✨'} Permissions · ${app.name}`),
          h('div', { className: 'hf-brand-sub hf-mono' }, `Hash-pinned to #${app.code_hash_short} · v${app.version}`)
        ),
        h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: onClose }, 'Close')
      ),
      h('div', { style: { fontSize: '12.5px', color: 'var(--hf-ink2)' } },
        'Permissions are cryptographically pinned to this exact code hash. If the HTML or inputs change, elevated capabilities lock automatically until you re-approve.'
      ),
      h('div', { className: 'hf-tier-grid' },
        ['sandbox', 'app', 'full'].map((t) => {
          const info = TIER_INFO[t]
          return h('button', {
            key: t, type: 'button', className: 'hf-tier-card', 'data-selected': tier === t ? '1' : '0',
            onClick: () => setTier(t)
          },
            h('div', { style: { fontSize: '11px', color: 'var(--hf-ink3)', fontWeight: 700, textTransform: 'uppercase' } }, info.level),
            h('div', { style: { fontSize: '14px', fontWeight: 700, marginTop: '2px' } }, info.label),
            h('div', { style: { fontSize: '11.5px', color: 'var(--hf-ink2)', marginTop: '4px' } }, info.desc)
          )
        })
      ),
      tier !== 'sandbox' && h('div', { className: 'hf-field' },
        h('label', null, 'Capabilities'),
        h('div', { className: 'hf-check-grid' },
          ['llm', 'notify', 'tools', ...(tier === 'full' ? ['fs'] : [])].map((cap) =>
            h('label', { key: cap, className: 'hf-check' },
              h('input', { type: 'checkbox', checked: caps.has(cap), onChange: () => toggleCap(cap) }),
              h('span', { className: 'hf-mono' }, cap)
            )
          )
        )
      ),
      tier !== 'sandbox' && caps.has('tools') && h('div', { className: 'hf-field' },
        h('label', null, 'Allowlisted Hermes Tools'),
        h('div', { className: 'hf-brand-sub' },
          'Execution, file-write, process-control, delegation, cron, messaging, and computer-use tools are never app-allowlistable because bridge calls run outside a chat approval turn.'
        ),
        toolList.length
          ? h('div', { className: 'hf-check-grid', style: { maxHeight: '110px', overflowY: 'auto' } },
              toolList.map((t) =>
                h('label', { key: t, className: 'hf-check' },
                  h('input', { type: 'checkbox', checked: tools.has(t), onChange: () => toggleTool(t) }),
                  h('span', { className: 'hf-mono' }, t)
                )
              )
            )
          : h('div', { className: 'hf-brand-sub' }, 'No extra Hermes tools reported by this gateway process.')
      ),
      tier === 'full' && caps.has('fs') && h('div', { className: 'hf-field' },
        h('label', null, 'Approved Local Folder (scoped read/write root)'),
        h('input', {
          className: 'hf-input hf-mono', value: fsRoot, placeholder: '/home/user/workspace/project',
          onChange: (e) => setFsRoot(e.target.value)
        })
      ),
      err && h('div', { className: 'hf-err' }, err),
      h('div', { className: 'hf-modal-actions' },
        h('button', { type: 'button', className: 'hf-btn hf-btn-danger', disabled: busy, onClick: revoke }, 'Revoke to Sandbox'),
        h('button', { type: 'button', className: 'hf-btn hf-btn-primary', disabled: busy, onClick: approve },
          busy ? 'Saving...' : `Approve ${TIER_INFO[tier].label} for #${app.code_hash_short}`
        )
      )
    )
  )
}

function InstallModal({ app, health, onClose, onInstalled }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || 'http://127.0.0.1:9120'
  const pwaUrl = `${origin}${app.pwa_path}`

  const installOs = async () => {
    setBusy(true); setErr('')
    try {
      const out = await api(`/apps/${encodeURIComponent(app.id)}/install-os`, {
        method: 'POST',
        body: { origin }
      })
      setResult(out.installed)
      if (out.app) onInstalled(out.app)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return h('div', { className: 'hf-backdrop', onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
    h('div', { className: 'hf-modal', role: 'dialog', 'aria-label': 'Install Hermifact as app' },
      h('div', { className: 'hf-modal-head' },
        h('div', { className: 'hf-modal-title' }, `Install ${app.icon || '✨'} ${app.name} as App`),
        h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: onClose }, 'Close')
      ),
      h('div', { className: 'hf-card' },
        h('h3', null, '1. Standalone Installable PWA (All Devices)'),
        h('div', { style: { fontSize: '12.5px', color: 'var(--hf-ink2)', marginBottom: '10px' } },
          'Opens this Hermifact in its own isolated PWA shell with a custom icon, Web App Manifest, Service Worker, and your Hermes provider (zero API keys). Click the browser Install icon to pin it to your Dock / Start Menu / Home Screen.'
        ),
        h('div', { className: 'hf-mono', style: { fontSize: '11.5px', padding: '7px 9px', borderRadius: '8px', background: 'var(--hf-inset)', border: '1px solid var(--hf-line)', wordBreak: 'break-all', marginBottom: '10px' } }, pwaUrl),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { type: 'button', className: 'hf-btn hf-btn-primary', onClick: () => host.openLink(pwaUrl) }, 'Open Standalone PWA'),
          h('button', { type: 'button', className: 'hf-btn', onClick: () => copyText(pwaUrl, 'PWA URL') }, 'Copy PWA URL')
        )
      ),
      h('div', { className: 'hf-card' },
        h('h3', null, '2. Native OS Desktop App Launcher'),
        h('div', { style: { fontSize: '12.5px', color: 'var(--hf-ink2)', marginBottom: '10px' } },
          health && health.browser_bin
            ? `Generates a real OS app entry (.desktop / .app / .cmd) with a dedicated icon launching ${health.browser_bin} in chromeless --app window mode.`
            : 'Generates a real OS desktop launcher (.desktop / .app / .cmd) with a dedicated icon opening this Hermifact.'
        ),
        app.os_installed && h('div', { className: 'hf-pill', 'data-tone': 'ok', style: { marginBottom: '10px' } }, `Installed at ${app.os_launcher_path}`),
        result && h('div', { style: { fontSize: '12px', color: 'var(--hf-ok)', marginBottom: '10px' }, className: 'hf-mono' },
          `Created: ${result.launcher_path}`
        ),
        err && h('div', { className: 'hf-err', style: { marginBottom: '8px' } }, err),
        h('button', { type: 'button', className: 'hf-btn', disabled: busy, onClick: installOs },
          busy ? 'Installing launcher...' : (app.os_installed ? 'Re-install OS Launcher' : 'Install OS Desktop App')
        )
      )
    )
  )
}

function ShareModal({ app, onClose }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    api(`/apps/${encodeURIComponent(app.id)}/export`)
      .then((res) => { if (live) setData(res) })
      .catch((e) => { if (live) setErr(e.message || String(e)) })
    return () => { live = false }
  }, [app.id])

  const shareUrl = useMemo(() => {
    if (!data) return ''
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || ''
    if (origin && data.share_path) return `${origin}${data.share_path}`
    return data.share_url || ''
  }, [data])

  return h('div', { className: 'hf-backdrop', onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
    h('div', { className: 'hf-modal', role: 'dialog', 'aria-label': 'Share Hermifact' },
      h('div', { className: 'hf-modal-head' },
        h('div', { className: 'hf-modal-title' }, `Share ${app.icon || '✨'} ${app.name}`),
        h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: onClose }, 'Close')
      ),
      h('div', { className: 'hf-pill', 'data-tone': 'ok', style: { alignSelf: 'flex-start' } },
        'Zero secrets · Recipients run on their own Hermes provider & start in Sandbox'
      ),
      err && h('div', { className: 'hf-err' }, err),
      !data && !err && h('div', { className: 'hf-brand-sub' }, 'Packing portable Hermifact bundle...'),
      data && h('div', { className: 'hf-field' },
        h('label', null, 'Shareable Hermes Link (hf1 compressed bundle)'),
        !data.link_reachable_by_recipient && h('div', { className: 'hf-brand-sub' },
          'This URL only opens on a machine that can reach this host. For someone else, send the hf1 token or the .hermifact.json file — both work anywhere.'
        ),
        data.fits_in_chat_message === false && h('div', { className: 'hf-err' },
          `This token is ${(data.token_chars || 0).toLocaleString()} characters, too long for a chat message or email. Download the .hermifact.json below and send that file instead.`
        ),
        h('textarea', { className: 'hf-textarea hf-mono', rows: 3, readOnly: true, value: shareUrl }),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } },
          h('button', { type: 'button', className: 'hf-btn hf-btn-primary', onClick: () => copyText(shareUrl, 'Share link') }, 'Copy Share Link'),
          h('button', { type: 'button', className: 'hf-btn', onClick: () => copyText(data.share_token, 'hf1 token') }, 'Copy hf1 Token'),
          h('button', { type: 'button', className: 'hf-btn', onClick: () => downloadJson(`${app.id}.hermifact.json`, data.bundle) }, 'Download .hermifact.json')
        )
      )
    )
  )
}

function ImportModal({ initialLink, onClose, onImported }) {
  const [raw, setRaw] = useState(initialLink || '')
  const [customId, setCustomId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewErr, setPreviewErr] = useState('')

  // Decode + describe the bundle BEFORE anything is written, so the recipient approves
  // from facts (name, tier being requested, size, exact hash) instead of a blind paste.
  useEffect(() => {
    const text = (raw || '').trim()
    setPreview(null); setPreviewErr('')
    if (!text) return undefined
    let live = true
    const timer = setTimeout(async () => {
      try {
        const body = text.startsWith('{') ? { bundle: JSON.parse(text) } : { share_link: text }
        const out = await api('/apps/inspect', { method: 'POST', body })
        if (live) setPreview(out)
      } catch (e) {
        if (!live) return
        const msg = (e && e.message) || String(e)
        // A gateway that has not reloaded this plugin yet has no /apps/inspect route.
        // That is not a broken share link — stay quiet and let Import do its job.
        if (/^(Not Found|HTTP 40[45])/.test(msg)) return
        setPreviewErr(msg)
      }
    }, 400)
    return () => { live = false; clearTimeout(timer) }
  }, [raw])

  const submit = async () => {
    const text = raw.trim()
    if (!text) { setErr('Paste a share link, hf1 token, or JSON bundle.'); return }
    setBusy(true); setErr('')
    try {
      let body = { app_id: customId.trim() || undefined }
      if (text.startsWith('{')) {
        body.bundle = JSON.parse(text)
      } else {
        body.share_link = text
      }
      const out = await api('/apps/import', { method: 'POST', body })
      onImported(out.app)
      onClose()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    try { setRaw(await f.text()); setErr('') } catch (ex) { setErr(String(ex)) }
  }

  return h('div', { className: 'hf-backdrop', onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
    h('div', { className: 'hf-modal', role: 'dialog', 'aria-label': 'Import Hermifact' },
      h('div', { className: 'hf-modal-head' },
        h('div', { className: 'hf-modal-title' }, 'Import Hermifact'),
        h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: onClose }, 'Close')
      ),
      h('div', { style: { fontSize: '12.5px', color: 'var(--hf-ink2)' } },
        'Paste a share link (?import=hf1....), raw hf1.<token>, or .hermifact.json bundle. Imported apps always start in Sandbox until you review and approve their code hash.'
      ),
      h('div', { className: 'hf-field' },
        h('label', null, 'Share Link / Token / JSON'),
        h('textarea', {
          className: 'hf-textarea hf-mono', rows: 5, value: raw,
          placeholder: 'https://.../hermifacts?import=hf1.... or { ... }',
          onChange: (e) => setRaw(e.target.value)
        })
      ),
      h('div', { className: 'hf-form-grid' },
        h('div', { className: 'hf-field' },
          h('label', null, 'Custom App ID (optional)'),
          h('input', { className: 'hf-input hf-mono', value: customId, placeholder: 'auto-slug', onChange: (e) => setCustomId(e.target.value) })
        ),
        h('div', { className: 'hf-field' },
          h('label', null, 'Or load .hermifact.json file'),
          h('input', { type: 'file', accept: '.json,application/json', onChange: onFile, style: { fontSize: '12px', paddingTop: '6px' } })
        )
      ),
      previewErr && h('div', { className: 'hf-err' }, previewErr),
      preview && h('div', { className: 'hf-kv' },
        h('div', { className: 'hf-kv-row' }, h('span', null, 'App'), h('span', null, `${preview.icon || '📦'} ${preview.name}`)),
        h('div', { className: 'hf-kv-row' }, h('span', null, 'Lands as'), h('span', { className: 'hf-mono' }, preview.id_would_be)),
        h('div', { className: 'hf-kv-row' },
          h('span', null, 'Starts at'),
          h('span', null, preview.requested_tier && preview.requested_tier !== 'sandbox'
            ? `Sandbox (Tier 1) — sender asks for ${TIER_INFO[preview.requested_tier] ? TIER_INFO[preview.requested_tier].label : preview.requested_tier}`
            : 'Sandbox (Tier 1)')
        ),
        h('div', { className: 'hf-kv-row' }, h('span', null, 'Payload'), h('span', { className: 'hf-mono' }, `${(preview.html_bytes / 1024).toFixed(1)} KB`)),
        h('div', { className: 'hf-kv-row' }, h('span', null, 'Code hash'), h('span', { className: 'hf-mono' }, `#${preview.code_hash_short}`)),
        preview.renamed_from && h('div', { className: 'hf-kv-row' },
          h('span', null, 'Id conflict'),
          h('span', null, `"${preview.renamed_from}" already exists here — importing as "${preview.id_would_be}". Nothing of yours is overwritten.`)
        )
      ),
      preview && preview.hash_matches_bundle === false && h('div', { className: 'hf-err' },
        'The hash recorded by the sender does not match the HTML in this bundle — it was edited or damaged in transit. It still lands in Sandbox; review the code before approving any permission.'
      ),
      preview && preview.fits_in_chat_message === false && h('div', { className: 'hf-brand-sub' },
        `This token is ${preview.token_chars.toLocaleString()} characters — pasted links that long usually arrive truncated. The .hermifact.json file is the reliable way to move it.`
      ),
      err && h('div', { className: 'hf-err' }, err),
      h('div', { className: 'hf-modal-actions' },
        h('button', { type: 'button', className: 'hf-btn', onClick: onClose }, 'Cancel'),
        h('button', { type: 'button', className: 'hf-btn hf-btn-primary', disabled: busy, onClick: submit },
          busy ? 'Importing...' : (preview ? `Import ${preview.name}` : 'Import into Studio')
        )
      )
    )
  )
}

function NewAppModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('⚡')
  const [accent, setAccent] = useState('#6366f1')
  const [category, setCategory] = useState('utility')
  const [desc, setDesc] = useState('')
  const [tier, setTier] = useState('app')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const create = async () => {
    if (!name.trim()) { setErr('Give your Hermifact a name.'); return }
    setBusy(true); setErr('')
    try {
      const out = await api('/apps', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: desc.trim() || 'Interactive Hermifact AI app',
          icon: icon.trim() || '⚡',
          accent,
          category,
          use_starter_template: true,
          requested_tier: tier,
          requested_caps: tier === 'sandbox' ? [] : ['llm', 'notify']
        }
      })
      onCreated(out.app)
      onClose()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return h('div', { className: 'hf-backdrop', onClick: (e) => { if (e.target === e.currentTarget) onClose() } },
    h('div', { className: 'hf-modal', role: 'dialog', 'aria-label': 'Create Hermifact' },
      h('div', { className: 'hf-modal-head' },
        h('div', { className: 'hf-modal-title' }, 'New Hermifact'),
        h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: onClose }, 'Close')
      ),
      h('div', { className: 'hf-form-grid' },
        h('div', { className: 'hf-field' },
          h('label', null, 'App Name'),
          h('input', { className: 'hf-input', value: name, placeholder: 'Revenue Forecaster', onChange: (e) => setName(e.target.value) })
        ),
        h('div', { className: 'hf-field' },
          h('label', null, 'Icon (emoji)'),
          h('input', { className: 'hf-input', value: icon, onChange: (e) => setIcon(e.target.value) })
        ),
        h('div', { className: 'hf-field' },
          h('label', null, 'Category'),
          h('select', { className: 'hf-select', value: category, onChange: (e) => setCategory(e.target.value) },
            ['utility', 'workflow', 'analytics', 'research', 'productivity', 'creative'].map((c) => h('option', { key: c, value: c }, c))
          )
        ),
        h('div', { className: 'hf-field' },
          h('label', null, 'Requested Permission Tier'),
          h('select', { className: 'hf-select', value: tier, onChange: (e) => setTier(e.target.value) },
            h('option', { value: 'sandbox' }, 'Tier 1: Sandbox (isolated)'),
            h('option', { value: 'app' }, 'Tier 2: App (Hermes LLM + Notify)'),
            h('option', { value: 'full' }, 'Tier 3: Full (App + Scoped FS)')
          )
        )
      ),
      h('div', { className: 'hf-field' },
        h('label', null, 'Description'),
        h('input', { className: 'hf-input', value: desc, placeholder: 'What does this Hermifact do?', onChange: (e) => setDesc(e.target.value) })
      ),
      h('div', { className: 'hf-field' },
        h('label', null, 'Accent Color'),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
          ACCENT_SWATCHES.map((sw) =>
            h('button', {
              key: sw, type: 'button', 'aria-label': sw,
              onClick: () => setAccent(sw),
              style: {
                width: '24px', height: '24px', borderRadius: '99px', background: sw, cursor: 'pointer',
                border: accent === sw ? '2px solid var(--hf-ink)' : '2px solid transparent'
              }
            })
          )
        )
      ),
      err && h('div', { className: 'hf-err' }, err),
      h('div', { className: 'hf-modal-actions' },
        h('button', { type: 'button', className: 'hf-btn', onClick: onClose }, 'Cancel'),
        h('button', { type: 'button', className: 'hf-btn hf-btn-primary', disabled: busy, onClick: create },
          busy ? 'Creating...' : 'Create Hermifact'
        )
      )
    )
  )
}

/* ------------------------------------------- sandboxed runner & editors */

function buildDefaultParams(inputs) {
  const out = {}
  ;(Array.isArray(inputs) ? inputs : []).forEach((inp) => {
    if (inp && inp.id !== undefined) out[inp.id] = inp.default !== undefined ? inp.default : ''
  })
  return out
}

function ParamsBar({ inputs, values, onChange, onReset }) {
  if (!Array.isArray(inputs) || !inputs.length) return null
  return h('div', { className: 'hf-params', 'aria-label': 'Reactive workflow controls' },
    inputs.map((inp) => {
      const id = String(inp.id || '')
      if (!id) return null
      const label = inp.label || id
      const val = values[id] !== undefined ? values[id] : (inp.default !== undefined ? inp.default : '')
      const type = String(inp.type || 'text').toLowerCase()

      let control = null
      if (type === 'select' && Array.isArray(inp.options)) {
        control = h('select', {
          value: String(val),
          onChange: (e) => onChange(id, e.target.value)
        }, inp.options.map((opt) => {
          const oVal = typeof opt === 'object' && opt !== null ? opt.value : opt
          const oLab = typeof opt === 'object' && opt !== null ? (opt.label || opt.value) : opt
          return h('option', { key: String(oVal), value: String(oVal) }, String(oLab))
        }))
      } else if (type === 'range') {
        const num = Number(val)
        control = h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
          h('input', {
            type: 'range',
            min: inp.min !== undefined ? inp.min : 0,
            max: inp.max !== undefined ? inp.max : 100,
            step: inp.step !== undefined ? inp.step : 1,
            value: Number.isFinite(num) ? num : 0,
            onChange: (e) => onChange(id, Number(e.target.value))
          }),
          h('span', { className: 'hf-mono', style: { fontSize: '11.5px', minWidth: '34px', color: 'var(--hf-ink)' } },
            `${Number.isFinite(num) ? num : 0}${inp.unit || ''}`
          )
        )
      } else if (type === 'number') {
        control = h('input', {
          type: 'number',
          min: inp.min,
          max: inp.max,
          step: inp.step || 'any',
          value: val === '' ? '' : Number(val),
          style: { width: '88px' },
          onChange: (e) => onChange(id, e.target.value === '' ? '' : Number(e.target.value))
        })
      } else if (type === 'checkbox' || type === 'toggle' || type === 'boolean') {
        control = h('input', {
          type: 'checkbox',
          checked: Boolean(val),
          onChange: (e) => onChange(id, e.target.checked)
        })
      } else {
        control = h('input', {
          type: 'text',
          value: String(val),
          placeholder: inp.placeholder || '',
          style: { width: '140px' },
          onChange: (e) => onChange(id, e.target.value)
        })
      }

      return h('div', { key: id, className: 'hf-param' },
        h('label', null, label),
        control
      )
    }),
    h('button', {
      type: 'button',
      className: 'hf-btn hf-btn-sm',
      style: { marginLeft: 'auto' },
      onClick: onReset
    }, 'Reset Params')
  )
}

function SandboxedFrame({ app, params, onParamFromApp, onStatus, onBlocked, reloadSeq }) {
  const iframeRef = useRef(null)
  const [docHtml, setDocHtml] = useState('')
  const [err, setErr] = useState('')
  const paramsRef = useRef(params)
  paramsRef.current = params

  useEffect(() => {
    let live = true
    setErr('')
    setDocHtml('')
    api(`/apps/${encodeURIComponent(app.id)}/render-doc`)
      .then((res) => { if (live) setDocHtml(res.html || '') })
      .catch((e) => { if (live) setErr(e.message || String(e)) })
    return () => { live = false }
  }, [app.id, app.code_hash, app.effective_tier, reloadSeq])

  const pushParams = useCallback((nextParams) => {
    const win = iframeRef.current && iframeRef.current.contentWindow
    if (!win) return
    try {
      win.postMessage({ __hermifact: true, dir: 'event', event: 'params', payload: nextParams || {} }, '*')
    } catch { /* noop */ }
  }, [])

  useEffect(() => {
    pushParams(params)
  }, [params, pushParams])

  useEffect(() => {
    const onMessage = async (ev) => {
      const win = iframeRef.current && iframeRef.current.contentWindow
      if (!win || ev.source !== win) return
      const msg = ev.data
      if (!msg || msg.__hermifact !== true) return

      if (msg.dir === 'event' && msg.event === 'paramChanged' && msg.payload) {
        if (onParamFromApp) onParamFromApp(msg.payload.key, msg.payload.value)
        return
      }

      if (msg.dir !== 'req') return
      const { id, method, payload } = msg
      const started = Date.now()
      if (onStatus) onStatus(`Running ${method}...`)
      try {
        const data = await callBridge(app.id, method, payload)
        const ms = Date.now() - started
        if (onStatus) onStatus(`${method} · ${ms}ms`)
        win.postMessage({ __hermifact: true, dir: 'res', id, ok: true, data }, '*')
      } catch (e) {
        const errMsg = e && e.message ? e.message : String(e)
        if (onStatus) onStatus(`${method} blocked: ${errMsg}`)
        if (onBlocked && /approv|tier|capab|hash|sandbox|permiss|deny|forbid/i.test(errMsg)) {
          onBlocked(errMsg)
        }
        win.postMessage({ __hermifact: true, dir: 'res', id, ok: false, error: errMsg }, '*')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [app.id, onParamFromApp, onStatus, onBlocked])

  if (err) {
    return h('div', { className: 'hf-empty' },
      h('div', { className: 'hf-err' }, `Failed to load Hermifact document: ${err}`)
    )
  }
  if (!docHtml) {
    return h('div', { className: 'hf-empty' }, 'Loading isolated Hermifact runtime...')
  }

  return h('div', { className: 'hf-frame-wrap' },
    h('iframe', {
      ref: iframeRef,
      key: `${app.id}:${app.code_hash}:${app.effective_tier}:${reloadSeq}`,
      className: 'hf-frame',
      title: app.name,
      sandbox: 'allow-scripts allow-forms allow-downloads',
      srcDoc: docHtml,
      onLoad: () => pushParams(paramsRef.current)
    })
  )
}

function CodeEditorPane({ app, onSaved }) {
  const [name, setName] = useState(app.name || '')
  const [desc, setDesc] = useState(app.description || '')
  const [icon, setIcon] = useState(app.icon || '✨')
  const [accent, setAccent] = useState(safeAccent(app.accent))
  const [category, setCategory] = useState(app.category || 'utility')
  const [reqTier, setReqTier] = useState(app.requested_tier || 'sandbox')
  const [inputsText, setInputsText] = useState(() => JSON.stringify(app.inputs || [], null, 2))
  const [html, setHtml] = useState(app.html || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    setName(app.name || '')
    setDesc(app.description || '')
    setIcon(app.icon || '✨')
    setAccent(safeAccent(app.accent))
    setCategory(app.category || 'utility')
    setReqTier(app.requested_tier || 'sandbox')
    setInputsText(JSON.stringify(app.inputs || [], null, 2))
    setHtml(app.html || '')
    setErr('')
    setNote('')
  }, [app.id, app.code_hash])

  const save = async () => {
    let parsedInputs = []
    try {
      parsedInputs = JSON.parse(inputsText || '[]')
      if (!Array.isArray(parsedInputs)) throw new Error('Inputs must be a JSON array.')
    } catch (e) {
      setErr(`Invalid inputs JSON: ${e.message}`)
      return
    }
    setBusy(true); setErr(''); setNote('')
    try {
      const out = await api('/apps', {
        method: 'POST',
        body: {
          app_id: app.id,
          name: name.trim() || app.name,
          description: desc.trim(),
          icon: icon.trim() || '✨',
          accent,
          category,
          html,
          inputs: parsedInputs,
          requested_tier: reqTier,
          requested_caps: reqTier === 'sandbox' ? [] : (app.requested_caps && app.requested_caps.length ? app.requested_caps : ['llm', 'notify']),
          requested_tools: app.requested_tools || [],
          requested_fs_root: app.requested_fs_root || ''
        }
      })
      setNote(`Saved v${out.app.version} · #${out.app.code_hash_short}`)
      onSaved(out.app)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return h('div', { className: 'hf-pane' },
    h('div', { className: 'hf-card' },
      h('h3', null, 'Metadata & Reactive Controls'),
      h('div', { className: 'hf-form-grid' },
        h('div', { className: 'hf-field' },
          h('label', null, 'Name'),
          h('input', { className: 'hf-input', value: name, onChange: (e) => setName(e.target.value) })
        ),
        h('div', { className: 'hf-field' },
          h('label', null, 'Icon'),
          h('input', { className: 'hf-input', value: icon, onChange: (e) => setIcon(e.target.value) })
        ),
        h('div', { className: 'hf-field' },
          h('label', null, 'Accent'),
          h('input', { className: 'hf-input hf-mono', value: accent, onChange: (e) => setAccent(e.target.value) })
        ),
        h('div', { className: 'hf-field' },
          h('label', null, 'Requested Tier'),
          h('select', { className: 'hf-select', value: reqTier, onChange: (e) => setReqTier(e.target.value) },
            h('option', { value: 'sandbox' }, 'sandbox'),
            h('option', { value: 'app' }, 'app'),
            h('option', { value: 'full' }, 'full')
          )
        )
      ),
      h('div', { className: 'hf-field', style: { marginTop: '10px' } },
        h('label', null, 'Description'),
        h('input', { className: 'hf-input', value: desc, onChange: (e) => setDesc(e.target.value) })
      ),
      h('div', { className: 'hf-field', style: { marginTop: '10px' } },
        h('label', null, 'Reactive Workflow Inputs (JSON array — select / range / number / checkbox / text)'),
        h('textarea', {
          className: 'hf-textarea hf-mono', rows: 4, value: inputsText,
          onChange: (e) => setInputsText(e.target.value)
        })
      )
    ),
    h('div', { className: 'hf-card' },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' } },
        h('h3', { style: { margin: 0 } }, 'Artifact HTML / JS / CSS Source'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          note && h('span', { className: 'hf-pill', 'data-tone': 'ok' }, note),
          h('button', { type: 'button', className: 'hf-btn hf-btn-primary', disabled: busy, onClick: save },
            busy ? 'Saving...' : 'Save & Re-Hash'
          )
        )
      ),
      err && h('div', { className: 'hf-err', style: { marginBottom: '8px' } }, err),
      h('textarea', {
        className: 'hf-textarea hf-mono hf-code',
        value: html,
        spellCheck: false,
        onChange: (e) => setHtml(e.target.value)
      }),
      h('div', { style: { fontSize: '12px', color: 'var(--hf-ink3)', marginTop: '8px' } },
        'Editing HTML or reactive inputs computes a new SHA-256 code hash. Elevated permissions automatically lock until re-approved for the new hash.'
      )
    )
  )
}

function InspectorPane({ app, audit, onOpenPerms, onDelete }) {
  const [kv, setKv] = useState({})
  const [kvErr, setKvErr] = useState('')
  const [loadingKv, setLoadingKv] = useState(false)

  const loadKv = useCallback(() => {
    setLoadingKv(true); setKvErr('')
    callBridge(app.id, 'storage.list', {})
      .then((res) => setKv((res && res.items) || {}))
      .catch((e) => setKvErr(e.message || String(e)))
      .finally(() => setLoadingKv(false))
  }, [app.id])

  useEffect(() => { loadKv() }, [loadKv])

  const delKey = async (k) => {
    try {
      await callBridge(app.id, 'storage.delete', { key: k })
      loadKv()
    } catch (e) {
      setKvErr(e.message || String(e))
    }
  }

  const kvEntries = Object.entries(kv || {})

  return h('div', { className: 'hf-pane' },
    h('div', { className: 'hf-card' },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' } },
        h('h3', { style: { margin: 0 } }, 'Hash-Pinned Trust & Runtime'),
        h('div', { style: { display: 'flex', gap: '8px' } },
          h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: onOpenPerms }, 'Edit Permissions'),
          h('button', { type: 'button', className: 'hf-btn hf-btn-sm hf-btn-danger', onClick: onDelete }, 'Delete App')
        )
      ),
      h('div', { className: 'hf-kv-row' }, h('span', null, 'App ID'), h('span', { className: 'hf-mono' }, app.id)),
      h('div', { className: 'hf-kv-row' }, h('span', null, 'Version / Code Hash'), h('span', { className: 'hf-mono' }, `v${app.version} · ${app.code_hash_short}`)),
      h('div', { className: 'hf-kv-row' }, h('span', null, 'Effective Tier'), h('span', { className: 'hf-pill', 'data-tier': app.effective_tier }, app.effective_tier)),
      h('div', { className: 'hf-kv-row' }, h('span', null, 'Effective Capabilities'), h('span', { className: 'hf-mono' }, (app.effective_caps || []).join(', ') || 'none (sandbox)')),
      h('div', { className: 'hf-kv-row' }, h('span', null, 'Allowlisted Tools'), h('span', { className: 'hf-mono' }, (app.effective_tools || []).join(', ') || 'none')),
      app.effective_fs_root && h('div', { className: 'hf-kv-row' }, h('span', null, 'Approved Folder'), h('span', { className: 'hf-mono' }, app.effective_fs_root)),
      h('div', { className: 'hf-kv-row' }, h('span', null, 'Standalone PWA Path'), h('span', { className: 'hf-mono' }, app.pwa_path)),
      h('div', { className: 'hf-kv-row' }, h('span', null, 'OS Desktop Launcher'), h('span', { className: 'hf-mono' }, app.os_installed ? app.os_launcher_path : 'Not installed'))
    ),
    h('div', { className: 'hf-card' },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' } },
        h('h3', { style: { margin: 0 } }, `Per-App Persistent Storage (${kvEntries.length})`),
        h('button', { type: 'button', className: 'hf-btn hf-btn-sm', disabled: loadingKv, onClick: loadKv }, loadingKv ? 'Refreshing...' : 'Refresh')
      ),
      kvErr && h('div', { className: 'hf-err' }, kvErr),
      !kvEntries.length && !kvErr && h('div', { className: 'hf-brand-sub' }, 'No keys saved yet via window.hermesApp.storage.'),
      kvEntries.map(([k, v]) =>
        h('div', { key: k, className: 'hf-kv-row' },
          h('div', { style: { minWidth: 0, flex: 1 } },
            h('div', { className: 'hf-mono', style: { fontWeight: 600 } }, k),
            h('div', { className: 'hf-mono', style: { fontSize: '11.5px', color: 'var(--hf-ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, JSON.stringify(v))
          ),
          h('button', { type: 'button', className: 'hf-btn hf-btn-sm hf-btn-danger', onClick: () => delKey(k) }, 'Delete')
        )
      )
    ),
    h('div', { className: 'hf-card' },
      h('h3', null, `Recent Bridge Audit (${(audit || []).length})`),
      !(audit || []).length && h('div', { className: 'hf-brand-sub' }, 'No bridge calls recorded yet.'),
      (audit || []).map((row) =>
        h('div', { key: row.id || `${row.created_at}-${row.action}`, className: 'hf-audit-row' },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } },
            h('span', { className: 'hf-pill', 'data-tone': row.status === 'ok' ? 'ok' : 'warn' }, row.status),
            h('span', { className: 'hf-mono', style: { fontWeight: 600 } }, row.action),
            row.detail && h('span', { style: { color: 'var(--hf-ink2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.detail)
          ),
          h('span', { className: 'hf-mono', style: { fontSize: '11px', color: 'var(--hf-ink3)', flexShrink: 0 } }, String(row.created_at || '').slice(0, 19).replace('T', ' '))
        )
      )
    )
  )
}

/* -------------------------------------------- Studio & inline directive */

function App({ ctx }) {
  if (ctx && !CTX) setCtx(ctx)

  const [skin, setSkin] = useState(detectSkin)
  const [health, setHealth] = useState(null)
  const [apps, setApps] = useState([])
  const [availableTools, setAvailableTools] = useState([])
  const [selectedId, setSelectedId] = useState(() => persist.get('selectedId', ''))
  const [selectedApp, setSelectedApp] = useState(null)
  const [audit, setAudit] = useState([])
  const [tab, setTab] = useState('run')
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('all')
  const [params, setParams] = useState({})
  const [reloadSeq, setReloadSeq] = useState(0)
  const [status, setStatus] = useState('Ready')
  const [blockedMsg, setBlockedMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [modal, setModal] = useState(null)
  const [pendingImport, setPendingImport] = useState('')

  useEffect(() => {
    const update = () => setSkin(detectSkin())
    update()
    if (typeof MutationObserver === 'undefined') return
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-hermes-theme', 'style'] })
    return () => obs.disconnect()
  }, [])

  const loadAll = useCallback(async (preferredId) => {
    setLoading(true); setErr('')
    try {
      const [hRes, aRes] = await Promise.all([api('/health'), api('/apps')])
      setHealth(hRes)
      const list = Array.isArray(aRes.apps) ? aRes.apps : []
      setApps(list)
      setAvailableTools(Array.isArray(aRes.available_tools) ? aRes.available_tools : [])
      setSelectedId((prev) => {
        const want = preferredId || prev
        if (want && list.some((a) => a.id === want)) return want
        return list[0] ? list[0].id : ''
      })
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const hints = parseUrlHints()
    if (hints.importToken) {
      setPendingImport(hints.importToken)
      setModal('import')
    }
    try {
      const q = new URLSearchParams(window.location.search || '')
      if (q.get('new') === '1') setModal('new')
    } catch { /* noop */ }
    loadAll(hints.appId)
  }, [loadAll])

  const loadSelected = useCallback(async (id) => {
    if (!id) { setSelectedApp(null); setAudit([]); return }
    persist.set('selectedId', id)
    setBlockedMsg('')
    try {
      const out = await api(`/apps/${encodeURIComponent(id)}?include_html=true`)
      setSelectedApp(out.app)
      setAudit(Array.isArray(out.audit) ? out.audit : [])
      setParams(buildDefaultParams(out.app && out.app.inputs))
      setStatus(`Loaded v${out.app.version} · #${out.app.code_hash_short}`)
    } catch (e) {
      setErr(e.message || String(e))
    }
  }, [])

  useEffect(() => { loadSelected(selectedId) }, [selectedId, loadSelected])

  const categories = useMemo(() => {
    const set = new Set(['all'])
    apps.forEach((a) => { if (a.category) set.add(a.category) })
    return Array.from(set)
  }, [apps])

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter((a) => {
      if (cat !== 'all' && a.category !== cat) return false
      if (!q) return true
      return `${a.name} ${a.description} ${a.id} ${a.category}`.toLowerCase().includes(q)
    })
  }, [apps, cat, query])

  const onAppUpdated = useCallback((updated) => {
    if (!updated) return
    setApps((prev) => {
      const exists = prev.some((a) => a.id === updated.id)
      return exists ? prev.map((a) => (a.id === updated.id ? Object.assign({}, a, updated) : a)) : [updated, ...prev]
    })
    setSelectedId(updated.id)
    setSelectedApp((prev) => (prev && prev.id === updated.id ? Object.assign({}, prev, updated) : updated))
    setBlockedMsg('')
    setReloadSeq((n) => n + 1)
    loadSelected(updated.id)
  }, [loadSelected])

  const deleteSelected = async () => {
    if (!selectedApp) return
    if (typeof window !== 'undefined' && !window.confirm(`Delete Hermifact "${selectedApp.name}" and its saved storage?`)) return
    try {
      await api(`/apps/${encodeURIComponent(selectedApp.id)}`, { method: 'DELETE' })
      const rest = apps.filter((a) => a.id !== selectedApp.id)
      setApps(rest)
      setSelectedId(rest[0] ? rest[0].id : '')
      setTab('run')
    } catch (e) {
      setErr(e.message || String(e))
    }
  }

  const askHermesToEdit = async () => {
    if (!selectedApp) return
    const prompt = `Update Hermifact "${selectedApp.id}" (${selectedApp.name}) using hermifact_get and hermifact_create: `
    if (host.composer && host.composer.setDraft) {
      await host.composer.setDraft(prompt)
      if (host.composer.focus) host.composer.focus()
      if (host.navigate) host.navigate('/')
    } else {
      copyText(prompt, 'Edit prompt')
    }
  }

  const clearImportQuery = () => {
    try {
      const u = new URL(window.location.href)
      if (u.searchParams.has('import')) {
        u.searchParams.delete('import')
        window.history.replaceState({}, '', u.toString())
      }
    } catch { /* noop */ }
  }

  return h('div', { className: 'hf-root', 'data-skin': skin },
    h('style', null, CSS),
    h('header', { className: 'hf-topbar' },
      h('div', { className: 'hf-brand' },
        h('div', { className: 'hf-brand-mark' }, '✦'),
        h('div', null,
          h('div', { className: 'hf-brand-title' }, 'Hermifacts'),
          h('div', { className: 'hf-brand-sub' },
            health
              ? `${apps.length} app${apps.length === 1 ? '' : 's'} · ${health.model_ready ? 'Zero-API-key Hermes LLM Ready' : 'Sandbox / Local Mode'}`
              : 'Installable AI Apps Studio'
          )
        )
      ),
      h('div', { className: 'hf-topbar-actions' },
        h('button', { type: 'button', className: 'hf-btn hf-btn-primary', onClick: () => setModal('new') }, '+ New Hermifact'),
        h('button', { type: 'button', className: 'hf-btn', onClick: () => { setPendingImport(''); setModal('import') } }, 'Import Link / JSON'),
        h('button', { type: 'button', className: 'hf-btn', onClick: () => loadAll(selectedId) }, 'Refresh')
      )
    ),
    err && h('div', { className: 'hf-banner' },
      h('span', { className: 'hf-err' }, err),
      h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: () => setErr('') }, 'Dismiss')
    ),
    h('div', { className: 'hf-body' },
      h('aside', { className: 'hf-rail' },
        h('div', { className: 'hf-rail-tools' },
          h('input', {
            className: 'hf-input',
            placeholder: 'Search Hermifacts...',
            value: query,
            onChange: (e) => setQuery(e.target.value)
          }),
          h('div', { className: 'hf-cats' },
            categories.map((c) =>
              h('button', {
                key: c, type: 'button', className: 'hf-cat', 'data-active': cat === c ? '1' : '0',
                onClick: () => setCat(c)
              }, c)
            )
          )
        ),
        h('div', { className: 'hf-rail-list' },
          loading && !apps.length && h('div', { className: 'hf-empty' }, 'Loading Hermifacts...'),
          !loading && !filteredApps.length && h('div', { className: 'hf-empty' }, 'No matching Hermifacts.'),
          filteredApps.map((a) =>
            h('button', {
              key: a.id, type: 'button', className: 'hf-item', 'data-selected': a.id === selectedId ? '1' : '0',
              onClick: () => { setSelectedId(a.id); setTab('run') }
            },
              h('div', { className: 'hf-item-icon', style: { background: safeAccent(a.accent) } }, a.icon || '✨'),
              h('div', { className: 'hf-item-meta' },
                h('div', { className: 'hf-item-name' }, a.name),
                h('div', { className: 'hf-item-desc' }, a.description || 'Interactive Hermifact'),
                h('div', { className: 'hf-item-tags' },
                  h('span', { className: 'hf-pill', 'data-tier': a.effective_tier }, a.effective_tier),
                  a.os_installed && h('span', { className: 'hf-pill', 'data-tone': 'ok' }, 'Installed'),
                  a.needs_approval && h('span', { className: 'hf-pill', 'data-tone': 'warn' }, 'Approve')
                )
              )
            )
          )
        )
      ),
      h('main', { className: 'hf-stage' },
        !selectedApp
          ? h('div', { className: 'hf-empty' },
              h('div', { style: { fontSize: '28px' } }, '✦'),
              h('div', { style: { fontWeight: 700, color: 'var(--hf-ink)' } }, 'Select or create a Hermifact'),
              h('div', null, 'Build interactive reactive workflows powered by your own Hermes provider, install them as standalone PWA or desktop apps, and share zero-secret hf1 links.'),
              h('button', { type: 'button', className: 'hf-btn hf-btn-primary', onClick: () => setModal('new') }, '+ Create Hermifact')
            )
          : h(React.Fragment, null,
              h('div', { className: 'hf-stage-head' },
                h('div', { className: 'hf-stage-id' },
                  h('div', { className: 'hf-item-icon', style: { background: safeAccent(selectedApp.accent) } }, selectedApp.icon || '✨'),
                  h('div', { style: { minWidth: 0 } },
                    h('div', { className: 'hf-stage-title' }, selectedApp.name),
                    h('div', { className: 'hf-stage-sub hf-mono' },
                      `${selectedApp.id} · v${selectedApp.version} · #${selectedApp.code_hash_short}`
                    )
                  )
                ),
                h('div', { className: 'hf-stage-controls' },
                  h('div', { className: 'hf-seg' },
                    ['run', 'code', 'inspect'].map((t) =>
                      h('button', {
                        key: t, type: 'button', 'data-active': tab === t ? '1' : '0',
                        onClick: () => setTab(t)
                      }, t === 'run' ? 'Run' : (t === 'code' ? 'Code' : 'Inspect'))
                    )
                  ),
                  h('button', { type: 'button', className: 'hf-btn hf-btn-sm hf-btn-primary', onClick: () => setModal('install') }, 'Install as App'),
                  h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: () => setModal('share') }, 'Share'),
                  h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: () => setModal('perms') }, `Tier: ${selectedApp.effective_tier}`),
                  h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: askHermesToEdit }, 'Edit w/ Hermes'),
                  h('button', { type: 'button', className: 'hf-btn hf-btn-sm', onClick: () => setReloadSeq((n) => n + 1) }, 'Reload')
                )
              ),
              (selectedApp.needs_approval || blockedMsg) && h('div', { className: 'hf-banner' },
                h('div', { className: 'hf-banner-text' },
                  blockedMsg
                    ? `Capability blocked: ${blockedMsg}`
                    : (selectedApp.approval_stale
                        ? `Code changed (#${selectedApp.code_hash_short}). Elevated capabilities are locked until you re-approve this hash.`
                        : `This Hermifact requests ${selectedApp.requested_tier} tier (${(selectedApp.requested_caps || []).join(', ') || 'elevated'}). Currently running in ${selectedApp.effective_tier}.`)
                ),
                h('button', { type: 'button', className: 'hf-btn hf-btn-sm hf-btn-warn', onClick: () => setModal('perms') }, 'Review & Approve')
              ),
              tab === 'run' && h(ParamsBar, {
                inputs: selectedApp.inputs,
                values: params,
                onChange: (k, v) => setParams((prev) => Object.assign({}, prev, { [k]: v })),
                onReset: () => setParams(buildDefaultParams(selectedApp.inputs))
              }),
              tab === 'run' && h(SandboxedFrame, {
                app: selectedApp,
                params,
                reloadSeq,
                onParamFromApp: (k, v) => setParams((prev) => Object.assign({}, prev, { [k]: v })),
                onStatus: setStatus,
                onBlocked: setBlockedMsg
              }),
              tab === 'code' && h(CodeEditorPane, { app: selectedApp, onSaved: onAppUpdated }),
              tab === 'inspect' && h(InspectorPane, {
                app: selectedApp,
                audit,
                onOpenPerms: () => setModal('perms'),
                onDelete: deleteSelected
              }),
              h('footer', { className: 'hf-foot' },
                h('span', null, `Isolated iframe (no allow-same-origin) · ${status}`),
                h('span', { className: 'hf-mono' }, `tier:${selectedApp.effective_tier} · #${selectedApp.code_hash_short}`)
              )
            )
      )
    ),
    modal === 'perms' && selectedApp && h(PermissionsModal, {
      app: selectedApp,
      availableTools,
      onClose: () => setModal(null),
      onSaved: onAppUpdated
    }),
    modal === 'install' && selectedApp && h(InstallModal, {
      app: selectedApp,
      health,
      onClose: () => setModal(null),
      onInstalled: onAppUpdated
    }),
    modal === 'share' && selectedApp && h(ShareModal, {
      app: selectedApp,
      onClose: () => setModal(null)
    }),
    modal === 'import' && h(ImportModal, {
      initialLink: pendingImport,
      onClose: () => { setModal(null); clearImportQuery() },
      onImported: (app) => { clearImportQuery(); onAppUpdated(app) }
    }),
    modal === 'new' && h(NewAppModal, {
      onClose: () => setModal(null),
      onCreated: onAppUpdated
    })
  )
}

function HermifactDirective(rawProps) {
  const attrs = (rawProps && (rawProps.props || rawProps.attrs || rawProps.params || rawProps)) || {}
  const appId = String(attrs.id || attrs.app || attrs.slug || '').trim()
  const [app, setApp] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [params, setParams] = useState({})
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!appId) return
    let live = true
    api(`/apps/${encodeURIComponent(appId)}?include_html=false`)
      .then((res) => {
        if (!live) return
        setApp(res.app)
        setParams(buildDefaultParams(res.app && res.app.inputs))
      })
      .catch((e) => { if (live) setErr(e.message || String(e)) })
    return () => { live = false }
  }, [appId])

  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) || 'http://127.0.0.1:9120'

  return h('div', {
    style: {
      border: '1px solid var(--border, rgba(255,255,255,0.12))',
      borderRadius: '14px',
      background: 'var(--card, #141822)',
      color: 'var(--foreground, #eef2ff)',
      overflow: 'hidden',
      margin: '8px 0',
      fontFamily: 'var(--dt-font-sans, system-ui, sans-serif)'
    }
  },
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        padding: '12px 14px', flexWrap: 'wrap'
      }
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 } },
        h('div', {
          style: {
            width: '34px', height: '34px', borderRadius: '10px', display: 'grid', placeItems: 'center',
            background: safeAccent(app && app.accent), color: '#fff', fontSize: '17px', flexShrink: 0
          }
        }, (app && app.icon) || '✦'),
        h('div', { style: { minWidth: 0 } },
          h('div', { style: { fontWeight: 700, fontSize: '14px' } }, (app && app.name) || appId || 'Hermifact'),
          h('div', { style: { fontSize: '12px', color: 'var(--muted-foreground, #94a3b8)' } },
            err || (app ? `${app.description || 'Installable Hermifact'} · tier:${app.effective_tier} · #${app.code_hash_short}` : 'Loading Hermifact...')
          )
        )
      ),
      app && h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        h('button', {
          type: 'button',
          onClick: () => setExpanded((v) => !v),
          style: { padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border, rgba(255,255,255,0.16))', background: 'transparent', color: 'inherit', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }
        }, expanded ? 'Hide Preview' : 'Run Inline'),
        h('button', {
          type: 'button',
          onClick: () => host.navigate(`${ROUTE}?app=${encodeURIComponent(app.id)}`),
          style: { padding: '5px 10px', borderRadius: '8px', border: 0, background: safeAccent(app.accent), color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }
        }, 'Open in Studio'),
        h('button', {
          type: 'button',
          onClick: () => host.openLink(`${origin}${app.pwa_path}`),
          style: { padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border, rgba(255,255,255,0.16))', background: 'transparent', color: 'inherit', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }
        }, 'Install / PWA')
      )
    ),
    expanded && app && h('div', { style: { borderTop: '1px solid var(--border, rgba(255,255,255,0.10))', height: '420px', display: 'flex', flexDirection: 'column' } },
      h(ParamsBar, {
        inputs: app.inputs,
        values: params,
        onChange: (k, v) => setParams((prev) => Object.assign({}, prev, { [k]: v })),
        onReset: () => setParams(buildDefaultParams(app.inputs))
      }),
      h('div', { style: { flex: 1, minHeight: 0 } },
        h(SandboxedFrame, {
          app,
          params,
          reloadSeq: 0,
          onParamFromApp: (k, v) => setParams((prev) => Object.assign({}, prev, { [k]: v }))
        })
      )
    )
  )
}

/* ------------------------------------------------------ plugin registration */

function contribute(ctx, localId, area, payload) {
  const fullId = `${ID}.${localId}`
  try {
    if (ctx && typeof ctx.register === 'function') {
      return ctx.register({ id: fullId, area, data: payload, render: payload && payload.render })
    }
    if (ctx && typeof ctx.contribution === 'function') {
      return ctx.contribution(area, Object.assign({ id: fullId }, payload))
    }
  } catch (e) {
    try { console.warn(`[${ID}] area ${area} failed:`, e && e.message ? e.message : e) } catch { /* noop */ }
  }
  return undefined
}

function StatusBarPill() {
  const [count, setCount] = useState(null)
  useEffect(() => {
    let live = true
    api('/apps').then((d) => {
      if (live && d && Array.isArray(d.apps)) setCount(d.apps.length)
    }).catch(() => {})
    return () => { live = false }
  }, [])
  return h('button', {
    type: 'button',
    onClick: () => host.navigate(ROUTE),
    title: count !== null ? `Hermifacts Studio (${count} apps)` : 'Open Hermifacts Studio',
    'aria-label': 'Open Hermifacts Studio',
    style: {
      display: 'inline-flex', alignItems: 'center', gap: '5px', minHeight: '24px',
      border: 0, borderRadius: '7px', background: 'transparent',
      color: 'var(--ui-text-tertiary, inherit)',
      fontSize: '12px', cursor: 'pointer', padding: '0 7px'
    }
  },
    h('span', {
      style: {
        width: '6px', height: '6px', borderRadius: '99px',
        background: count !== null ? 'var(--ui-success, #34d399)' : 'var(--ui-text-quaternary, #78839a)'
      }
    }),
    count !== null ? `hermifacts ${count}` : 'hermifacts'
  )
}

function SettingsPage() {
  const ListRow = SDK.ListRow
  const ToggleRow = SDK.ToggleRow
  const SegmentedControl = SDK.SegmentedControl
  const [health, setHealth] = useState(null)
  const [defaultView, setDefaultView] = useState(() => persist.get('defaultTab', 'run'))
  const [showPill, setShowPill] = useState(() => persist.get('statusPill', true))

  useEffect(() => {
    api('/health').then(setHealth).catch(() => setHealth(null))
  }, [])

  const rows = []
  if (ListRow) {
    rows.push(h(ListRow, {
      key: 'view',
      title: 'Default app view',
      description: 'Which tab opens first when selecting a Hermifact in Studio.',
      action: SegmentedControl
        ? h(SegmentedControl, {
            value: defaultView,
            onChange: (v) => { setDefaultView(v); persist.set('defaultTab', v) },
            items: [
              { value: 'run', label: 'Live App' },
              { value: 'code', label: 'HTML' },
              { value: 'inputs', label: 'Workflow' }
            ]
          })
        : null
    }))
  }
  if (ToggleRow) {
    rows.push(h(ToggleRow, {
      key: 'pill',
      label: 'Status-bar shortcut',
      description: 'Show a quick launcher pill for Hermifacts Studio in the status bar.',
      checked: showPill,
      onChange: (on) => { setShowPill(on); persist.set('statusPill', on) }
    }))
  }
  if (ListRow) {
    rows.push(h(ListRow, {
      key: 'backend',
      title: 'Hermifacts runtime',
      description: health && health.ok
        ? `${health.app_count || 0} apps · ${health.llm_ready ? 'LLM provider bound (zero API keys)' : 'LLM bridge awaiting agent context'}`
        : 'Backend API not reachable from this window',
      hint: health && health.data_root ? health.data_root : ''
    }))
  }
  return h('div', { style: { display: 'flex', flexDirection: 'column' } }, rows)
}

const plugin = {
  id: ID,
  name: 'Hermifacts',
  version: '0.1.0',
  description: 'Installable AI Apps Studio — turn interactive artifacts into standalone PWA & OS desktop apps.',
  defaultEnabled: true,
  register(ctx) {
    setCtx(ctx)

    const shells = [
      ['route', ROUTES_AREA, { path: ROUTE, title: 'Hermifacts' }, () => h(App, { ctx })],
      ['nav', SIDEBAR_NAV_AREA, { path: ROUTE, label: 'Hermifacts', codicon: 'sparkle', icon: 'sparkles', order: 45 }, undefined],
      ['status', STATUSBAR_AREAS ? STATUSBAR_AREAS.right : 'statusBar.right', { order: 119 }, () => h(StatusBarPill, null)],
      ['palette-open', PALETTE_AREA, {
        id: `${ID}.open`,
        label: 'Hermifacts: open studio',
        keywords: ['hermifacts', 'apps', 'pwa', 'artifacts', 'install'],
        run: () => host.navigate(ROUTE)
      }, undefined],
      ['palette-new', PALETTE_AREA, {
        id: `${ID}.new`,
        label: 'Hermifacts: new installable app',
        keywords: ['hermifacts', 'create', 'new', 'artifact', 'app'],
        run: () => host.navigate(`${ROUTE}?new=1`)
      }, undefined]
    ]

    for (const [localId, area, data, render] of shells) {
      contribute(ctx, localId, area, render ? Object.assign({}, data, { render }) : data)
    }

    contribute(ctx, 'directive', TRANSCRIPT_DIRECTIVE_AREA, {
      name: 'hermifact',
      render: (props) => h(HermifactDirective, props)
    })

    try {
      if (ctx && typeof ctx.registerSettingsPage === 'function') {
        ctx.registerSettingsPage({
          id: `${ID}.settings`,
          title: 'Hermifacts',
          description: 'Installable AI apps, runtime bridge, and defaults.',
          render: () => h(SettingsPage, null)
        })
      }
    } catch (e) {
      try { console.warn('[hermifacts] settings page not registered:', e) } catch { /* noop */ }
    }
  }
}

export default plugin

export { App, HermifactDirective, CSS, plugin }
