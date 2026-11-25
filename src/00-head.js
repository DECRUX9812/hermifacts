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
