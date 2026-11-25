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
