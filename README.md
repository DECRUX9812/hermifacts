# Hermifacts — Installable AI Apps for Hermes Agent

Turn interactive HTML/JS/CSS artifacts into **standalone installable PWA and native OS desktop apps** powered by your own Hermes LLM provider — with **zero API keys**, reactive workflow controls, portable zero-secret `hf1.` share links, and hash-pinned 3-tier permissions.

## Key Capabilities

- **Zero-API-Key LLM Access (`window.hermesApp.llm`)**: Apps call your configured Hermes model/provider through `ctx.llm` via the backend bridge. Shared apps automatically run on each recipient's own Hermes provider — no API keys or secrets ever leave your machine.
- **Install as Standalone PWA & Native OS App**: Every Hermifact serves a dynamic Web App Manifest (`/api/plugins/hermifacts/pwa/<id>/manifest.webmanifest`), Service Worker, SVG/PNG icons, and an isolated PWA shell. On Linux, macOS, and Windows, Hermifacts can also install a native OS desktop launcher (`.desktop` / `.app` / `.cmd`) opening a chromeless `--app` window.
- **Reactive Workflow Controls (`inputs`)**: Declare `select`, `range`, `number`, `checkbox`, and `text` parameters alongside your artifact. Changing any option broadcasts live updates to `window.hermesApp.onParamsChange(...)` so charts, forecasts, and views redraw instantaneously.
- **Portable Zero-Secret Share Links (`hf1.<token>`)**: Export any Hermifact as a URL-safe compressed `/hermifacts?import=hf1.<token>` link or `.hermifact.json` bundle. Imported apps always start in Tier 1 (`sandbox`) until the recipient reviews and approves the code hash. Sharing is built not to surprise either side:
  - **Nothing on the recipient's machine is overwritten.** A bundle carries its sender's app id, so two people's `dashboard` collide; an import that would land on an existing id is renamed (`dashboard` → `dashboard-2`) and says so. Only an explicit `app_id` — an update the user asked for — may target an existing app.
  - **Preview before install.** The recipient sees the sender's name, icon, the tier being requested, the payload size and the exact `#hash` they are about to trust, and the new `/apps/inspect` route answers that without writing a row.
  - **A hash that does not match is called out.** The bundle's recorded hash is a claim; the store recomputes it from the bytes it holds and reports a mismatch (edited or damaged in transit) instead of believing either side.
  - **Links that cannot work are not offered.** Without a configured `public_origin`, export returns the token and path but no URL — a loopback link would point the recipient at their own machine. Tokens past ~8,000 characters (the practical ceiling for a chat client or a mail body) are flagged so the `.hermifact.json` file is sent instead of a link that arrives truncated.
  - **Untrusted input is bounded**: a pasted link over 4 MB is refused before base64/zlib touch it, and decompression is capped so a crafted token cannot expand past the HTML limit.
- **Hash-Pinned 3-Tier Permissions**:
  1. **Tier 1 (`sandbox`)**: Isolated iframe (`sandbox="allow-scripts allow-forms allow-downloads"`, never `allow-same-origin`) + per-app persistent KV storage.
  2. **Tier 2 (`app`)**: Zero-API-key Hermes LLM calls, desktop notifications, and explicitly allowlisted Hermes tools.
  3. **Tier 3 (`full`)**: Everything in App plus read/write confined to one explicitly approved local folder.
  - Every elevated grant is cryptographically pinned to `SHA-256(html + inputs)`. Editing the code automatically locks elevated capabilities until re-approved.

## Agent Tools & Commands

- `hermifact_create` — Create or update a Hermifact app and return a `::hermifact{id="..."}` inline transcript card.
- `hermifact_list` — List installed Hermifacts with tier, hash, and launcher status.
- `hermifact_get` — Inspect metadata, permissions, and HTML source.
- `hermifact_install` — Generate a native OS desktop launcher for an existing Hermifact.
- `hermifact_export` — Export a zero-secret `.hermifact.json` bundle + `hf1.<token>` share link.
- `hermifact_import` — Import from a share link, `hf1.` token, or JSON bundle (always starts in Sandbox).
- `hermifact_delete` — Delete a Hermifact, its storage, and any installed OS launcher.
- `/hermifacts` — Slash command to list apps or inspect studio URLs.

## Development & Deployment

```bash
# Build desktop/plugin.js from src/*.js
node build.mjs
node --check desktop/plugin.js

# Run automated tests
pytest tests/

# Deploy to local Hermes plugin directories
bash tools/deploy.sh
```
