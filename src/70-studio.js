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