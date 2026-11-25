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
