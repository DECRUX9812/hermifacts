"""PWA shell, dynamic Web App Manifest, Service Worker, SVG/PNG icon generator,
and the injected ``window.hermesApp`` guest SDK.
"""

from __future__ import annotations

import html as html_mod
import json
import struct
import zlib
from typing import Any


def _parse_hex_color(accent: str) -> tuple[int, int, int]:
    s = (accent or "#6366f1").strip().lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) != 6:
        return (99, 102, 241)
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return (99, 102, 241)


def _safe_accent(accent: str | None) -> str:
    r, g, b = _parse_hex_color(accent or "#6366f1")
    return f"#{r:02x}{g:02x}{b:02x}"


def render_icon_svg(name: str, icon: str = "✨", accent: str = "#6366f1") -> str:
    """Render a crisp squircle SVG app icon for the OS launcher, manifest, and UI."""
    r, g, b = _parse_hex_color(accent)
    r2 = max(0, int(r * 0.58))
    g2 = max(0, int(g * 0.58))
    b2 = max(0, int(b * 0.68))
    glyph = (icon or (name[:1] if name else "H")).strip()[:4]
    safe_glyph = html_mod.escape(glyph)
    c1 = f"rgb({r},{g},{b})"
    c2 = f"rgb({r2},{g2},{b2})"
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
        '<defs>'
        f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="{c1}"/>'
        f'<stop offset="100%" stop-color="{c2}"/>'
        '</linearGradient>'
        '</defs>'
        '<rect x="20" y="20" width="472" height="472" rx="112" fill="url(#bg)"/>'
        '<rect x="20" y="20" width="472" height="472" rx="112" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="8"/>'
        f'<text x="256" y="310" text-anchor="middle" font-size="210" ' 
        'font-family="system-ui, -apple-system, Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif" ' 
        f'fill="#ffffff">{safe_glyph}</text>'
        '</svg>'
    )


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def render_icon_png(name: str, icon: str = "✨", accent: str = "#6366f1", size: int = 192) -> bytes:
    """Generate a valid RGBA PNG icon (192 or 512) with zero external dependencies.

    Chrome/Edge require real raster PNG icons in ``manifest.webmanifest`` to mark a
    web app as installable (PWA). Draws a shaded rounded squircle with a crisp inner
    monogram badge.
    """
    sz = max(64, min(int(size), 512))
    r1, g1, b1 = _parse_hex_color(accent)
    r2 = max(0, int(r1 * 0.55))
    g2 = max(0, int(g1 * 0.55))
    b2 = max(0, int(b1 * 0.72))
    pad = max(4, sz // 24)
    rad = sz // 4
    inner = sz - 2 * pad
    cx = sz / 2.0
    cy = sz / 2.0
    ring_r = sz * 0.24
    ring_in = sz * 0.16

    raw = bytearray()
    for y in range(sz):
        raw.append(0)  # PNG filter type 0
        ty = y / max(1, sz - 1)
        for x in range(sz):
            # Signed distance to rounded rectangle
            dx = max(0, (pad + rad) - x, x - (sz - pad - rad - 1))
            dy = max(0, (pad + rad) - y, y - (sz - pad - rad - 1))
            dist_sq = dx * dx + dy * dy
            if x < pad or x >= sz - pad or y < pad or y >= sz - pad or dist_sq > rad * rad:
                raw.extend((0, 0, 0, 0))
                continue
            t = (x / max(1, sz - 1) + ty) * 0.5
            rr = int(r1 + (r2 - r1) * t)
            gg = int(g1 + (g2 - g1) * t)
            bb = int(b1 + (b2 - b1) * t)
            # Subtle bright geometric ring emblem in center
            cd = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if ring_in <= cd <= ring_r:
                rr = min(255, int(rr * 0.25 + 255 * 0.75))
                gg = min(255, int(gg * 0.25 + 255 * 0.75))
                bb = min(255, int(bb * 0.25 + 255 * 0.75))
            elif cd < ring_in * 0.42:
                rr = min(255, int(rr * 0.2 + 255 * 0.8))
                gg = min(255, int(gg * 0.2 + 255 * 0.8))
                bb = min(255, int(bb * 0.2 + 255 * 0.8))
            raw.extend((rr, gg, bb, 255))

    ihdr = struct.pack(">IIBBBBB", sz, sz, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=6)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", idat)
        + _png_chunk(b"IEND", b"")
    )


def build_manifest(app: dict[str, Any]) -> dict[str, Any]:
    """Dynamic per-app Web App Manifest enabling native PWA install in any browser."""
    base = app["pwa_path"].rstrip("/")
    accent = app.get("accent") or "#6366f1"
    return {
        "id": f"{base}/",
        "name": app["name"],
        "short_name": app["name"][:16],
        "description": app.get("description") or f"{app['name']} — Hermifact AI App",
        "start_url": f"{base}/",
        "scope": f"{base}/",
        "display": "standalone",
        "background_color": "#0f1117",
        "theme_color": accent,
        "icons": [
            {"src": f"{base}/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": f"{base}/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
            {"src": f"{base}/icon.svg", "sizes": "any", "type": "image/svg+xml"},
        ],
    }


def build_service_worker(app: dict[str, Any]) -> str:
    """Minimal per-app Service Worker required for browser PWA installability."""
    ver = f"hermifact-{app['id']}-v{app.get('version', 1)}-{app.get('code_hash_short', '0')}"
    return f"""// Hermifacts Service Worker ({ver})
const CACHE = {json.dumps(ver)};
self.addEventListener('install', (e) => {{ self.skipWaiting(); }});
self.addEventListener('activate', (e) => {{ e.waitUntil(self.clients.claim()); }});
self.addEventListener('fetch', (e) => {{
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.includes('/bridge/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
}});
"""


def guest_sdk_script(app: dict[str, Any], initial_params: dict[str, Any] | None = None) -> str:
    """JavaScript snippet injected into every sandboxed Hermifact iframe.

    Exposes ``window.hermesApp`` (and alias ``window.hermifacts``) over ``postMessage``
    so untrusted app HTML never sees cookies, tokens, or API keys.
    """
    meta = {
        "id": app["id"],
        "name": app["name"],
        "version": app.get("version", 1),
        "codeHash": app.get("code_hash_short", ""),
        "effectiveTier": app.get("effective_tier", "sandbox"),
        "effectiveCaps": app.get("effective_caps", []),
        "effectiveTools": app.get("effective_tools", []),
        "inputs": app.get("inputs", []),
    }
    params_init = initial_params if isinstance(initial_params, dict) else {}
    for inp in app.get("inputs", []):
        if isinstance(inp, dict) and inp.get("id") and inp["id"] not in params_init:
            params_init[inp["id"]] = inp.get("default")

    meta_json = json.dumps(meta).replace("</", r"<\/")
    params_json = json.dumps(params_init).replace("</", r"<\/")
    return f"""<script>
(function() {{
  const APP_META = {meta_json};
  let _seq = 1;
  const _pending = new Map();
  const _paramListeners = new Set();
  const _params = Object.assign({{}}, {params_json});

  function rpc(method, payload) {{
    return new Promise((resolve, reject) => {{
      const id = 'hf_' + (++_seq) + '_' + Date.now();
      const timer = setTimeout(() => {{
        _pending.delete(id);
        reject(new Error('Hermes bridge timeout for ' + method));
      }}, 120000);
      _pending.set(id, {{ resolve, reject, timer }});
      window.parent.postMessage({{ __hermifact: true, dir: 'req', id, appId: APP_META.id, method, payload }}, '*');
    }});
  }}

  window.addEventListener('message', (ev) => {{
    const msg = ev && ev.data;
    if (!msg || !msg.__hermifact) return;
    if (msg.dir === 'res' && _pending.has(msg.id)) {{
      const entry = _pending.get(msg.id);
      _pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.ok) entry.resolve(msg.data);
      else entry.reject(new Error(msg.error || 'Hermes bridge error'));
      return;
    }}
    if (msg.dir === 'event' && msg.event === 'params') {{
      Object.assign(_params, msg.payload || {{}});
      _paramListeners.forEach((fn) => {{ try {{ fn(Object.assign({{}}, _params)); }} catch (e) {{ console.error(e); }} }});
    }}
    if (msg.dir === 'event' && msg.event === 'theme' && msg.payload) {{
      const r = document.documentElement;
      Object.entries(msg.payload).forEach(([k, v]) => r.style.setProperty(k, v));
    }}
  }});

  const sdk = {{
    app: Object.freeze(APP_META),
    get params() {{ return Object.assign({{}}, _params); }},
    onParamsChange(fn) {{
      if (typeof fn === 'function') _paramListeners.add(fn);
      return () => _paramListeners.delete(fn);
    }},
    setParam(key, value) {{
      _params[key] = value;
      window.parent.postMessage({{ __hermifact: true, dir: 'event', event: 'paramChanged', appId: APP_META.id, payload: {{ key, value }} }}, '*');
      _paramListeners.forEach((fn) => {{ try {{ fn(Object.assign({{}}, _params)); }} catch (e) {{}} }});
    }},
    llm: {{
      complete(messages, opts) {{
        const msgs = typeof messages === 'string' ? [{{ role: 'user', content: messages }}] : messages;
        return rpc('llm.complete', Object.assign({{ messages: msgs }}, opts || {{}}));
      }},
      structured(instructions, input, jsonSchema, opts) {{
        return rpc('llm.structured', Object.assign({{ instructions, input, json_schema: jsonSchema }}, opts || {{}}));
      }}
    }},
    storage: {{
      get(key) {{ return rpc('storage.get', {{ key }}).then((r) => r ? r.value : null); }},
      set(key, value) {{ return rpc('storage.set', {{ key, value }}); }},
      delete(key) {{ return rpc('storage.delete', {{ key }}); }},
      list() {{ return rpc('storage.list', {{}}).then((r) => (r && r.items) || {{}}); }}
    }},
    tools: {{
      call(name, args) {{ return rpc('tools.call', {{ name, args: args || {{}} }}); }}
    }},
    fs: {{
      list(path) {{ return rpc('fs.list', {{ path: path || '' }}); }},
      read(path) {{ return rpc('fs.read', {{ path }}); }},
      write(path, content) {{ return rpc('fs.write', {{ path, content }}); }}
    }},
    notify(title, body) {{
      return rpc('notify', {{ title: String(title || APP_META.name), body: String(body || '') }});
    }}
  }};

  window.hermesApp = sdk;
  window.hermifacts = sdk;
}})();
</script>"""


def inject_guest_sdk(html: str, app: dict[str, Any], initial_params: dict[str, Any] | None = None) -> str:
    """Inject ``window.hermesApp`` into the app HTML before its own scripts execute."""
    snippet = guest_sdk_script(app, initial_params)
    raw = html or ""
    lower = raw.lower()
    idx = lower.find("<head>")
    if idx != -1:
        pos = idx + len("<head>")
        return raw[:pos] + "\n" + snippet + "\n" + raw[pos:]
    idx2 = lower.find("<html")
    if idx2 != -1:
        end = raw.find(">", idx2)
        if end != -1:
            return raw[:end + 1] + "\n<head>" + snippet + "</head>\n" + raw[end + 1:]
    return "<!doctype html><html><head><meta charset='utf-8'>" + snippet + "</head><body>" + raw + "</body></html>"


def render_pwa_shell(app: dict[str, Any]) -> str:
    """Standalone installable PWA host page for ``/api/plugins/hermifacts/pwa/{id}/``.

    Runs same-origin with Hermes (so the user's existing Hermes session cookie applies)
    while isolating the Hermifact inside an opaque sandboxed iframe (``allow-scripts
    allow-forms allow-downloads`` — never ``allow-same-origin``).
    """
    app_id = app["id"]
    name_esc = html_mod.escape(app["name"])
    desc_esc = html_mod.escape(app.get("description") or "Hermifact AI App")
    icon_esc = html_mod.escape(app.get("icon") or "✨")
    accent = _safe_accent(app.get("accent"))
    base = app["pwa_path"].rstrip("/")
    bridge_base = f"/api/plugins/hermifacts/bridge/{app_id}"
    srcdoc_html = inject_guest_sdk(app.get("html", ""), app)
    srcdoc_json = json.dumps(srcdoc_html).replace("</", r"<\/")
    app_meta_json = json.dumps({
        "id": app_id,
        "name": app["name"],
        "effective_tier": app["effective_tier"],
        "effective_caps": app["effective_caps"],
        "needs_approval": app["needs_approval"],
        "approval_stale": app["approval_stale"],
        "code_hash_short": app["code_hash_short"],
        "inputs": app.get("inputs", []),
    }).replace("</", r"<\/")

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="theme-color" content="{accent}"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-title" content="{name_esc}"/>
  <title>{name_esc}</title>
  <link rel="manifest" href="{base}/manifest.webmanifest"/>
  <link rel="icon" type="image/svg+xml" href="{base}/icon.svg"/>
  <link rel="apple-touch-icon" href="{base}/icon-192.png"/>
  <style>
    * {{ box-sizing: border-box; }}
    html, body {{ margin: 0; padding: 0; height: 100%; background: #0d0f14; color: #e8ecf3; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }}
    .shell {{ display: flex; flex-direction: column; height: 100vh; }}
    .bar {{ display: flex; align-items: center; gap: 10px; height: 42px; padding: 0 14px; background: #141720; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; flex-shrink: 0; }}
    .brand {{ display: flex; align-items: center; gap: 8px; font-weight: 600; min-width: 0; }}
    .brand-icon {{ width: 22px; height: 22px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: {accent}; font-size: 13px; }}
    .pill {{ font-size: 11px; padding: 2px 8px; border-radius: 99px; background: rgba(255,255,255,0.08); color: #b5bfd1; font-family: ui-monospace, monospace; }}
    .pill.warn {{ background: rgba(245, 158, 11, 0.18); color: #fbbf24; }}
    .pill.ok {{ background: rgba(34, 197, 94, 0.16); color: #4ade80; }}
    .spacer {{ flex: 1; }}
    .btn {{ border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); color: #eef2ff; border-radius: 8px; padding: 4px 10px; font-size: 12px; cursor: pointer; font-weight: 500; }}
    .btn:hover {{ background: rgba(255,255,255,0.12); }}
    .btn.primary {{ background: {accent}; border-color: transparent; color: #fff; }}
    .params {{ display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 14px; background: #11141c; border-bottom: 1px solid rgba(255,255,255,0.07); font-size: 12px; }}
    .param {{ display: flex; align-items: center; gap: 6px; color: #b5bfd1; }}
    .param input, .param select {{ background: #1a1f2c; color: #f3f5fa; border: 1px solid rgba(255,255,255,0.14); border-radius: 6px; padding: 3px 7px; font-size: 12px; }}
    .frame-wrap {{ flex: 1; min-height: 0; position: relative; }}
    iframe {{ width: 100%; height: 100%; border: 0; display: block; background: #0d0f14; }}
    @media (display-mode: standalone) {{ .hide-standalone {{ display: none !important; }} }}
  </style>
</head>
<body>
  <div class="shell">
    <header class="bar">
      <div class="brand"><span class="brand-icon">{icon_esc}</span><span>{name_esc}</span></div>
      <span id="tier-pill" class="pill"></span>
      <span class="spacer"></span>
      <button id="btn-install" class="btn primary hide-standalone" style="display:none">Install App</button>
      <button id="btn-reload" class="btn" title="Reload app">Reload</button>
      <a class="btn hide-standalone" href="/hermifacts" style="text-decoration:none">Studio</a>
    </header>
    <div id="params-bar" class="params" style="display:none"></div>
    <div class="frame-wrap">
      <iframe id="app-frame" title="{name_esc}" sandbox="allow-scripts allow-forms allow-downloads"></iframe>
    </div>
  </div>
  <script>
    const APP = {app_meta_json};
    const BRIDGE = {json.dumps(bridge_base)};
    const SRCDOC = {srcdoc_json};
    const frame = document.getElementById('app-frame');
    const tierPill = document.getElementById('tier-pill');
    const paramsBar = document.getElementById('params-bar');
    const installBtn = document.getElementById('btn-install');

    // Status pill
    if (APP.approval_stale) {{
      tierPill.textContent = 'Re-approval needed (' + APP.code_hash_short + ')';
      tierPill.className = 'pill warn';
    }} else if (APP.needs_approval) {{
      tierPill.textContent = 'Sandbox · pending approval';
      tierPill.className = 'pill warn';
    }} else {{
      tierPill.textContent = APP.effective_tier + (APP.effective_caps.length ? ' · ' + APP.effective_caps.join(', ') : '');
      tierPill.className = 'pill ok';
    }}

    // Reactive parameters bar
    const paramState = {{}};
    if (Array.isArray(APP.inputs) && APP.inputs.length > 0) {{
      paramsBar.style.display = 'flex';
      APP.inputs.forEach((inp) => {{
        paramState[inp.id] = inp.default;
        const wrap = document.createElement('label');
        wrap.className = 'param';
        wrap.textContent = (inp.label || inp.id) + ': ';
        let ctrl;
        if (inp.type === 'select' && Array.isArray(inp.options)) {{
          ctrl = document.createElement('select');
          inp.options.forEach((o) => {{
            const opt = document.createElement('option');
            opt.value = typeof o === 'object' ? o.value : o;
            opt.textContent = typeof o === 'object' ? (o.label || o.value) : o;
            if (opt.value == inp.default) opt.selected = true;
            ctrl.appendChild(opt);
          }});
          ctrl.addEventListener('change', () => pushParam(inp.id, ctrl.value));
        }} else if (inp.type === 'range' || inp.type === 'number') {{
          ctrl = document.createElement('input');
          ctrl.type = inp.type;
          if (inp.min !== undefined) ctrl.min = inp.min;
          if (inp.max !== undefined) ctrl.max = inp.max;
          if (inp.step !== undefined) ctrl.step = inp.step;
          ctrl.value = inp.default ?? 0;
          const readout = document.createElement('span');
          readout.style.fontFamily = 'ui-monospace, monospace';
          readout.textContent = String(ctrl.value);
          ctrl.addEventListener('input', () => {{ readout.textContent = ctrl.value; pushParam(inp.id, Number(ctrl.value)); }});
          wrap.appendChild(ctrl);
          wrap.appendChild(readout);
          paramsBar.appendChild(wrap);
          return;
        }} else if (inp.type === 'toggle' || inp.type === 'checkbox') {{
          ctrl = document.createElement('input');
          ctrl.type = 'checkbox';
          ctrl.checked = Boolean(inp.default);
          ctrl.addEventListener('change', () => pushParam(inp.id, ctrl.checked));
        }} else {{
          ctrl = document.createElement('input');
          ctrl.type = 'text';
          ctrl.value = inp.default ?? '';
          ctrl.addEventListener('input', () => pushParam(inp.id, ctrl.value));
        }}
        wrap.appendChild(ctrl);
        paramsBar.appendChild(wrap);
      }});
    }}

    function pushParam(key, val) {{
      paramState[key] = val;
      if (frame.contentWindow) {{
        frame.contentWindow.postMessage({{ __hermifact: true, dir: 'event', event: 'params', payload: Object.assign({{}}, paramState) }}, '*');
      }}
    }}

    function mountApp() {{ frame.srcdoc = SRCDOC; }}
    document.getElementById('btn-reload').addEventListener('click', mountApp);
    mountApp();

    // Bridge RPC calls from sandboxed iframe -> authenticated Hermes gateway
    async function callBridge(path, body) {{
      const res = await fetch(BRIDGE + path, {{
        method: 'POST',
        credentials: 'include',
        headers: {{ 'content-type': 'application/json' }},
        body: JSON.stringify(body || {{}})
      }});
      const data = await res.json().catch(() => ({{}}));
      if (!res.ok || data.ok === false) throw new Error(data.error || data.detail || ('HTTP ' + res.status));
      return data;
    }}

    window.addEventListener('message', async (ev) => {{
      if (ev.source !== frame.contentWindow) return;
      const msg = ev.data;
      if (!msg || !msg.__hermifact || msg.dir !== 'req') return;
      try {{
        let data;
        const p = msg.payload || {{}};
        if (msg.method === 'llm.complete') data = await callBridge('/llm/complete', p);
        else if (msg.method === 'llm.structured') data = await callBridge('/llm/structured', p);
        else if (msg.method === 'storage.get') data = await callBridge('/storage/get', p);
        else if (msg.method === 'storage.set') data = await callBridge('/storage/set', p);
        else if (msg.method === 'storage.delete') data = await callBridge('/storage/delete', p);
        else if (msg.method === 'storage.list') data = await callBridge('/storage/list', p);
        else if (msg.method === 'tools.call') data = await callBridge('/tools/call', p);
        else if (msg.method === 'fs.list') data = await callBridge('/fs/list', p);
        else if (msg.method === 'fs.read') data = await callBridge('/fs/read', p);
        else if (msg.method === 'fs.write') data = await callBridge('/fs/write', p);
        else if (msg.method === 'notify') {{
          data = await callBridge('/notify', p);
          if ('Notification' in window) {{
            if (Notification.permission === 'granted') new Notification(p.title || APP.name, {{ body: p.body || '' }});
            else if (Notification.permission !== 'denied') {{
              Notification.requestPermission().then((perm) => {{ if (perm === 'granted') new Notification(p.title || APP.name, {{ body: p.body || '' }}); }});
            }}
          }}
        }}
        else throw new Error('Unknown Hermifact bridge method: ' + msg.method);
        frame.contentWindow.postMessage({{ __hermifact: true, dir: 'res', id: msg.id, ok: true, data }}, '*');
      }} catch (err) {{
        frame.contentWindow.postMessage({{ __hermifact: true, dir: 'res', id: msg.id, ok: false, error: err && err.message ? err.message : String(err) }}, '*');
      }}
    }});

    // PWA registration + 1-click Install App button
    if ('serviceWorker' in navigator) {{
      navigator.serviceWorker.register('{base}/sw.js', {{ scope: '{base}/' }}).catch(() => {{}});
    }}
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {{
      e.preventDefault();
      deferredPrompt = e;
      installBtn.style.display = 'inline-block';
    }});
    installBtn.addEventListener('click', async () => {{
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.style.display = 'none';
    }});
  </script>
</body>
</html>"""
