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