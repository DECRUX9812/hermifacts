/**
 * Node ESM smoke test for desktop/plugin.js.
 * Stubs react and @hermes/plugin-sdk via Node module.registerHooks
 * and verifies default plugin export registers route, nav, palette, statusbar, directive, and settings.
 */
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const reactStub = `
export function createElement(type, props, ...children) { return { type, props, children }; }
export function useState(v) { return [typeof v === 'function' ? v() : v, () => {}]; }
export function useEffect() {}
export function useRef(v) { return { current: v }; }
export function useMemo(fn) { return fn(); }
export function useCallback(fn) { return fn; }
export default { createElement, useState, useEffect, useRef, useMemo, useCallback };
`;

const sdkStub = `
export const host = { notify: () => {}, navigate: () => {}, openLink: () => {}, composer: { setDraft: async () => true, focus: () => {} } };
export const ROUTES_AREA = 'routes';
export const SIDEBAR_NAV_AREA = 'sidebar.nav';
export const PALETTE_AREA = 'palette';
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' };
export const TRANSCRIPT_DIRECTIVE_AREA = 'transcript.directives';
export const ListRow = () => null;
export const ToggleRow = () => null;
export const SegmentedControl = () => null;
export const Card = () => null;
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react' || specifier === '@hermes/plugin-sdk') {
      return {
        shortCircuit: true,
        url: 'data:text/javascript;charset=utf-8,' + encodeURIComponent(specifier === 'react' ? reactStub : sdkStub),
      };
    }
    return nextResolve(specifier, context);
  },
});

const pluginUrl = pathToFileURL(path.resolve('desktop/plugin.js')).href;
const mod = await import(pluginUrl);
const plugin = mod.default;
assert.ok(plugin, 'default plugin export missing');
assert.equal(plugin.id, 'hermifacts');
assert.equal(typeof plugin.register, 'function');

const registrations = [];
const settingsPages = [];
const fakeCtx = {
  register(item) { registrations.push(item); return () => {}; },
  registerSettingsPage(page) { settingsPages.push(page); return () => {}; },
  rest: async () => ({ ok: true, apps: [] }),
  storage: { get: () => null, set: () => {} },
};
plugin.register(fakeCtx);

const areas = new Set(registrations.map((r) => r.area));
for (const req of ['routes', 'sidebar.nav', 'palette', 'statusBar.right', 'transcript.directives']) {
  assert.ok(areas.has(req), `Missing registered area: ${req} (got ${[...areas].join(', ')})`);
}
assert.equal(settingsPages.length, 1, 'Expected 1 settings page registration');
assert.equal(settingsPages[0].id, 'hermifacts.settings');
console.log(`JS_SMOKE_OK: ${registrations.length} contributions across ${[...areas].sort().join(', ')} + ${settingsPages.length} settings page`);
