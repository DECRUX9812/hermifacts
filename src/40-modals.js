/* ---------------------------------------------------------------- modals */

function PermissionsModal({ app, availableTools, onClose, onSaved }) {
  const [tier, setTier] = useState(app.requested_tier || app.effective_tier || 'sandbox')
  const [caps, setCaps] = useState(() => new Set(app.requested_caps && app.requested_caps.length ? app.requested_caps : (app.effective_caps || [])))
  const [tools, setTools] = useState(() => new Set(app.requested_tools || app.effective_tools || []))
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
    ;(app.requested_tools || []).forEach((t) => s.add(t))
    ;(app.effective_tools || []).forEach((t) => s.add(t))
    return Array.from(s).sort()
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
      err && h('div', { className: 'hf-err' }, err),
      h('div', { className: 'hf-modal-actions' },
        h('button', { type: 'button', className: 'hf-btn', onClick: onClose }, 'Cancel'),
        h('button', { type: 'button', className: 'hf-btn hf-btn-primary', disabled: busy, onClick: submit },
          busy ? 'Importing...' : 'Import into Studio'
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
