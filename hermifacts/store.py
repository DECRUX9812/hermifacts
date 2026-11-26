"""Persistent SQLite store for Hermifacts apps, hash-pinned 3-tier permissions,
per-app key-value storage, reactive presets, and audit logs.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import sqlite3
import threading
import time
import zlib
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import parse_qs, urlparse

from . import runtime

TIERS = ("sandbox", "app", "full")
TIER_ORDER = {"sandbox": 0, "app": 1, "full": 2}

APP_CAPABILITIES = frozenset({"llm", "notify", "tools", "window"})
FULL_CAPABILITIES = frozenset({"fs", "exec"})
ALL_CAPABILITIES = APP_CAPABILITIES | FULL_CAPABILITIES

# Hermifact bridge calls happen outside a chat turn, so tools that can execute,
# write, delegate, schedule, control the desktop, or message the world are never
# app-allowlistable. Users can still run those tools through Hermes itself, where
# the normal turn/approval machinery is present.
APP_TOOL_DENYLIST = frozenset({
    "terminal",
    "process",
    "process_manage",
    "close_terminal",
    "read_terminal",
    "execute_code",
    "write_file",
    "patch",
    "delegate_task",
    "cronjob",
    "cronjob_manage",
    "send_message",
    "computer_use",
})

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
MAX_HTML_BYTES = 2 * 1024 * 1024  # 2 MiB
MAX_KV_VALUE_BYTES = 512 * 1024   # 512 KiB
# A pasted share link is untrusted input: refuse absurd payloads BEFORE base64/zlib
# touch them, so a 40 MB paste cannot burn memory in a dashboard request.
MAX_SHARE_INPUT_CHARS = 4 * 1024 * 1024
# Above this the token survives no chat client, email body or QR code. Export still
# produces it (a file or a paste into a text editor is fine), but callers must say so
# instead of handing the user a link that gets silently truncated by the messenger.
MAX_SHARE_MESSAGE_CHARS = 8000

_init_lock = threading.Lock()
_initialized_dbs: set[str] = set()


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    s = re.sub(r"-+", "-", s)[:48].strip("-")
    return s or f"app-{int(time.time()) % 100000}"


def compute_code_hash(html: str, inputs: list[dict[str, Any]] | None = None) -> str:
    """Deterministic SHA-256 fingerprint of an app's executable content + parameter schema."""
    h = hashlib.sha256()
    h.update((html or "").encode("utf-8"))
    if inputs:
        h.update(b"\n--INPUTS--\n")
        h.update(json.dumps(inputs, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    return h.hexdigest()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _validate_tier(tier: str) -> str:
    t = (tier or "sandbox").strip().lower()
    if t not in TIER_ORDER:
        raise ValueError(f"Invalid tier {tier!r}; must be one of: sandbox, app, full")
    return t


def _clean_caps(caps: list[str] | None, tier: str) -> list[str]:
    allowed = set()
    if tier == "app":
        allowed = set(APP_CAPABILITIES)
    elif tier == "full":
        allowed = set(ALL_CAPABILITIES)
    out: list[str] = []
    for c in caps or []:
        cc = str(c).strip().lower()
        if cc in allowed and cc not in out:
            out.append(cc)
    return sorted(out)


def is_blocked_app_tool(tool_name: str) -> bool:
    return str(tool_name or "").strip().lower() in APP_TOOL_DENYLIST


def _clean_str_list(items: list[str] | None, max_items: int = 40) -> list[str]:
    out: list[str] = []
    for x in items or []:
        s = str(x).strip()
        if s and s not in out:
            out.append(s)
        if len(out) >= max_items:
            break
    return out


def _clean_app_tools(items: list[str] | None) -> list[str]:
    return [name for name in _clean_str_list(items) if not is_blocked_app_tool(name)]


class HermifactsStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(root) if root is not None else runtime.data_dir()
        self.root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.root / "hermifacts.db"
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _ensure_schema(self) -> None:
        key = str(self.db_path.resolve())
        if key in _initialized_dbs:
            return
        with _init_lock:
            if key in _initialized_dbs:
                return
            with self._tx() as conn:
                conn.executescript("""
                CREATE TABLE IF NOT EXISTS apps (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    icon TEXT NOT NULL DEFAULT '✨',
                    accent TEXT NOT NULL DEFAULT '#6366f1',
                    category TEXT NOT NULL DEFAULT 'utility',
                    html TEXT NOT NULL,
                    inputs_json TEXT NOT NULL DEFAULT '[]',
                    code_hash TEXT NOT NULL,
                    requested_tier TEXT NOT NULL DEFAULT 'sandbox',
                    requested_caps_json TEXT NOT NULL DEFAULT '[]',
                    requested_tools_json TEXT NOT NULL DEFAULT '[]',
                    requested_fs_root TEXT NOT NULL DEFAULT '',
                    approved_tier TEXT NOT NULL DEFAULT 'sandbox',
                    approved_caps_json TEXT NOT NULL DEFAULT '[]',
                    approved_tools_json TEXT NOT NULL DEFAULT '[]',
                    approved_fs_root TEXT NOT NULL DEFAULT '',
                    approved_hash TEXT NOT NULL DEFAULT '',
                    approved_at TEXT NOT NULL DEFAULT '',
                    os_launcher_path TEXT NOT NULL DEFAULT '',
                    version INTEGER NOT NULL DEFAULT 1,
                    starter INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS app_kv (
                    app_id TEXT NOT NULL,
                    k TEXT NOT NULL,
                    v_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (app_id, k),
                    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    app_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_audit_app ON audit_log(app_id, id DESC);
                """)
            _initialized_dbs.add(key)

    def _row_to_dict(self, row: sqlite3.Row, *, include_html: bool = False) -> dict[str, Any]:
        code_hash = row["code_hash"]
        approved_hash = row["approved_hash"]
        requested_tier = row["requested_tier"]
        approved_tier = row["approved_tier"]
        requested_caps = json.loads(row["requested_caps_json"] or "[]")
        approved_caps = json.loads(row["approved_caps_json"] or "[]")
        requested_tools = json.loads(row["requested_tools_json"] or "[]")
        approved_tools = json.loads(row["approved_tools_json"] or "[]")

        hash_matches = bool(approved_hash) and approved_hash == code_hash
        needs_approval = (
            requested_tier != "sandbox"
            and (
                not hash_matches
                or TIER_ORDER.get(approved_tier, 0) < TIER_ORDER.get(requested_tier, 0)
                or not set(requested_caps).issubset(set(approved_caps))
            )
        )
        approval_stale = bool(approved_hash) and approved_hash != code_hash and approved_tier != "sandbox"

        # Effective runtime capabilities are strictly gated by hash match!
        effective_tier = approved_tier if hash_matches else "sandbox"
        effective_caps = approved_caps if hash_matches else []
        effective_tools = [t for t in approved_tools if not is_blocked_app_tool(t)] if hash_matches else []
        effective_fs_root = row["approved_fs_root"] if (hash_matches and effective_tier == "full") else ""

        out: dict[str, Any] = {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "icon": row["icon"],
            "accent": row["accent"],
            "category": row["category"],
            "inputs": json.loads(row["inputs_json"] or "[]"),
            "code_hash": code_hash,
            "code_hash_short": code_hash[:12],
            "requested_tier": requested_tier,
            "requested_caps": requested_caps,
            "requested_tools": requested_tools,
            "requested_fs_root": row["requested_fs_root"],
            "approved_tier": approved_tier,
            "approved_caps": approved_caps,
            "approved_tools": approved_tools,
            "approved_fs_root": row["approved_fs_root"],
            "approved_hash": approved_hash,
            "approved_at": row["approved_at"],
            "effective_tier": effective_tier,
            "effective_caps": effective_caps,
            "effective_tools": effective_tools,
            "effective_fs_root": effective_fs_root,
            "hash_matches": hash_matches,
            "needs_approval": needs_approval,
            "approval_stale": approval_stale,
            "os_launcher_path": row["os_launcher_path"],
            "os_installed": bool(row["os_launcher_path"]) and Path(row["os_launcher_path"]).exists(),
            "version": row["version"],
            "starter": bool(row["starter"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "pwa_path": f"/api/plugins/hermifacts/pwa/{row['id']}/",
            "manifest_path": f"/api/plugins/hermifacts/pwa/{row['id']}/manifest.webmanifest",
            "icon_path": f"/api/plugins/hermifacts/pwa/{row['id']}/icon.svg",
        }
        if include_html:
            out["html"] = row["html"]
        return out

    def ensure_starters(self) -> int:
        """Seed starter Hermifacts on a brand-new empty store."""
        with self._tx() as conn:
            count = conn.execute("SELECT COUNT(*) FROM apps").fetchone()[0]
        if count > 0:
            return 0
        from .starters import STARTER_APPS
        added = 0
        for spec in STARTER_APPS:
            self.save_app(**spec, starter=True, auto_approve_starter=True)
            added += 1
        return added

    def list_apps(self) -> list[dict[str, Any]]:
        self.ensure_starters()
        with self._tx() as conn:
            rows = conn.execute("SELECT * FROM apps ORDER BY updated_at DESC, name ASC").fetchall()
        return [self._row_to_dict(r, include_html=False) for r in rows]

    def get_app(self, app_id: str, *, include_html: bool = True) -> dict[str, Any]:
        self.ensure_starters()
        with self._tx() as conn:
            row = conn.execute("SELECT * FROM apps WHERE id = ?", (app_id,)).fetchone()
        if row is None:
            raise KeyError(f"Hermifact not found: {app_id}")
        return self._row_to_dict(row, include_html=include_html)

    def save_app(
        self,
        *,
        name: str,
        html: str,
        app_id: str | None = None,
        description: str = "",
        icon: str = "✨",
        accent: str = "#6366f1",
        category: str = "utility",
        inputs: list[dict[str, Any]] | None = None,
        requested_tier: str = "sandbox",
        requested_caps: list[str] | None = None,
        requested_tools: list[str] | None = None,
        requested_fs_root: str = "",
        starter: bool = False,
        auto_approve_starter: bool = False,
    ) -> dict[str, Any]:
        name = (name or "").strip()
        if not name:
            raise ValueError("App name is required")
        if not isinstance(html, str) or not html.strip():
            raise ValueError("App HTML content is required")
        if len(html.encode("utf-8")) > MAX_HTML_BYTES:
            raise ValueError(f"App HTML exceeds {MAX_HTML_BYTES // 1024} KB limit")

        aid = slugify(app_id or name)
        if not SLUG_RE.match(aid):
            raise ValueError(f"Invalid app id: {aid!r}")

        tier = _validate_tier(requested_tier)
        caps = _clean_caps(requested_caps, tier)
        tools = _clean_app_tools(requested_tools)
        fs_root = str(requested_fs_root or "").strip()
        if tier == "app" and not caps:
            caps = ["llm"]
        if tier == "full" and not caps:
            caps = ["llm", "fs"]

        clean_inputs = inputs if isinstance(inputs, list) else []
        code_hash = compute_code_hash(html, clean_inputs)
        now = _now_iso()

        with self._tx() as conn:
            existing = conn.execute("SELECT * FROM apps WHERE id = ?", (aid,)).fetchone()
            if existing is None:
                approved_tier = tier if (auto_approve_starter and starter and tier != "full") else "sandbox"
                approved_caps = caps if (auto_approve_starter and starter and tier != "full") else []
                approved_tools = tools if (auto_approve_starter and starter and tier != "full") else []
                approved_hash = code_hash if approved_tier != "sandbox" else ""
                approved_at = now if approved_tier != "sandbox" else ""
                conn.execute(
                    """
                    INSERT INTO apps (
                        id, name, description, icon, accent, category, html, inputs_json,
                        code_hash, requested_tier, requested_caps_json, requested_tools_json,
                        requested_fs_root, approved_tier, approved_caps_json, approved_tools_json,
                        approved_fs_root, approved_hash, approved_at, version, starter,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                    """,
                    (
                        aid, name, description.strip(), (icon or "✨").strip()[:8],
                        (accent or "#6366f1").strip()[:24], (category or "utility").strip()[:32],
                        html, json.dumps(clean_inputs), code_hash, tier, json.dumps(caps),
                        json.dumps(tools), fs_root, approved_tier, json.dumps(approved_caps),
                        json.dumps(approved_tools), "", approved_hash, approved_at,
                        1 if starter else 0, now, now,
                    ),
                )
                self._audit_conn(conn, aid, "create", "ok", f"v1 tier={tier} hash={code_hash[:12]}")
            else:
                version = int(existing["version"]) + 1
                # Notice: we NEVER update approved_hash on edit! If code_hash changed,
                # hash_matches immediately flips to False and elevated perms fail closed.
                conn.execute(
                    """
                    UPDATE apps SET
                        name = ?, description = ?, icon = ?, accent = ?, category = ?,
                        html = ?, inputs_json = ?, code_hash = ?,
                        requested_tier = ?, requested_caps_json = ?, requested_tools_json = ?,
                        requested_fs_root = ?, version = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        name, description.strip(), (icon or existing["icon"]).strip()[:8],
                        (accent or existing["accent"]).strip()[:24],
                        (category or existing["category"]).strip()[:32],
                        html, json.dumps(clean_inputs), code_hash,
                        tier, json.dumps(caps), json.dumps(tools), fs_root,
                        version, now, aid,
                    ),
                )
                stale_note = " (re-approval required)" if existing["code_hash"] != code_hash and existing["approved_tier"] != "sandbox" else ""
                self._audit_conn(conn, aid, "update", "ok", f"v{version} hash={code_hash[:12]}{stale_note}")
            row = conn.execute("SELECT * FROM apps WHERE id = ?", (aid,)).fetchone()
        return self._row_to_dict(row, include_html=True)

    def approve_permissions(
        self,
        app_id: str,
        *,
        tier: str,
        caps: list[str] | None = None,
        tools: list[str] | None = None,
        fs_root: str = "",
        expected_hash: str | None = None,
    ) -> dict[str, Any]:
        """Pin approved permissions to the app's exact current code_hash."""
        tier = _validate_tier(tier)
        with self._tx() as conn:
            row = conn.execute("SELECT * FROM apps WHERE id = ?", (app_id,)).fetchone()
            if row is None:
                raise KeyError(f"Hermifact not found: {app_id}")
            current_hash = row["code_hash"]
            if expected_hash and expected_hash != current_hash:
                raise ValueError("App code changed before approval; review the latest code first")
            clean_caps = _clean_caps(caps if caps is not None else json.loads(row["requested_caps_json"] or "[]"), tier)
            clean_tools = _clean_app_tools(tools if tools is not None else json.loads(row["requested_tools_json"] or "[]"))
            resolved_fs = ""
            if tier == "full" and (fs_root or row["requested_fs_root"]):
                resolved_fs = str(Path(fs_root or row["requested_fs_root"]).expanduser().resolve())
            now = _now_iso()
            conn.execute(
                """
                UPDATE apps SET
                    approved_tier = ?, approved_caps_json = ?, approved_tools_json = ?,
                    approved_fs_root = ?, approved_hash = ?, approved_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (tier, json.dumps(clean_caps), json.dumps(clean_tools), resolved_fs, current_hash, now, now, app_id),
            )
            self._audit_conn(conn, app_id, "approve", "ok", f"tier={tier} caps={','.join(clean_caps)} hash={current_hash[:12]}")
            updated = conn.execute("SELECT * FROM apps WHERE id = ?", (app_id,)).fetchone()
        return self._row_to_dict(updated, include_html=False)

    def revoke_permissions(self, app_id: str) -> dict[str, Any]:
        with self._tx() as conn:
            row = conn.execute("SELECT * FROM apps WHERE id = ?", (app_id,)).fetchone()
            if row is None:
                raise KeyError(f"Hermifact not found: {app_id}")
            now = _now_iso()
            conn.execute(
                """
                UPDATE apps SET
                    approved_tier = 'sandbox', approved_caps_json = '[]', approved_tools_json = '[]',
                    approved_fs_root = '', approved_hash = '', approved_at = '', updated_at = ?
                WHERE id = ?
                """,
                (now, app_id),
            )
            self._audit_conn(conn, app_id, "revoke", "ok", "downgraded to sandbox")
            updated = conn.execute("SELECT * FROM apps WHERE id = ?", (app_id,)).fetchone()
        return self._row_to_dict(updated, include_html=False)

    def set_os_launcher(self, app_id: str, launcher_path: str) -> dict[str, Any]:
        with self._tx() as conn:
            row = conn.execute("SELECT * FROM apps WHERE id = ?", (app_id,)).fetchone()
            if row is None:
                raise KeyError(f"Hermifact not found: {app_id}")
            conn.execute(
                "UPDATE apps SET os_launcher_path = ?, updated_at = ? WHERE id = ?",
                (launcher_path, _now_iso(), app_id),
            )
            self._audit_conn(conn, app_id, "install_os", "ok", launcher_path)
            updated = conn.execute("SELECT * FROM apps WHERE id = ?", (app_id,)).fetchone()
        return self._row_to_dict(updated, include_html=False)

    def delete_app(self, app_id: str) -> dict[str, Any]:
        with self._tx() as conn:
            row = conn.execute("SELECT * FROM apps WHERE id = ?", (app_id,)).fetchone()
            if row is None:
                raise KeyError(f"Hermifact not found: {app_id}")
            launcher_path = row["os_launcher_path"]
            conn.execute("DELETE FROM apps WHERE id = ?", (app_id,))
        return {"id": app_id, "os_launcher_path": launcher_path}

    # --- Permission enforcement helper ----------------------------------------

    def require_capability(self, app_id: str, capability: str, *, tool_name: str | None = None) -> dict[str, Any]:
        app = self.get_app(app_id, include_html=False)
        if app["approval_stale"]:
            self.record_audit(app_id, f"cap:{capability}", "denied", "code hash changed; re-approval required")
            raise PermissionError(
                f"App '{app['name']}' changed since permissions were approved (hash {app['code_hash_short']}). Re-approve permissions in Hermifacts Studio."
            )
        if not app["hash_matches"] or capability not in app["effective_caps"]:
            self.record_audit(app_id, f"cap:{capability}", "denied", f"capability '{capability}' not approved")
            raise PermissionError(
                f"App '{app['name']}' does not have approved '{capability}' permission. Approve it in Hermifacts Studio."
            )
        if capability == "tools" and tool_name:
            if is_blocked_app_tool(tool_name):
                self.record_audit(app_id, f"tool:{tool_name}", "denied", "tool class cannot be allowlisted to apps")
                raise PermissionError(
                    f"Tool '{tool_name}' can execute, write, schedule, delegate, or message outside a chat turn and cannot be allowlisted to a Hermifact."
                )
            if tool_name not in app["effective_tools"]:
                self.record_audit(app_id, f"tool:{tool_name}", "denied", "tool not in app allowlist")
                raise PermissionError(
                    f"Tool '{tool_name}' is not allowlisted for '{app['name']}'. Approved tools: {', '.join(app['effective_tools']) or '(none)'}"
                )
        return app

    # --- Per-app isolated KV storage (Tier 1 sandbox & above) -----------------

    def kv_list(self, app_id: str) -> dict[str, Any]:
        self.get_app(app_id, include_html=False)
        with self._tx() as conn:
            rows = conn.execute("SELECT k, v_json, updated_at FROM app_kv WHERE app_id = ? ORDER BY k", (app_id,)).fetchall()
        return {r["k"]: json.loads(r["v_json"]) for r in rows}

    def kv_get(self, app_id: str, key: str) -> Any:
        self.get_app(app_id, include_html=False)
        with self._tx() as conn:
            row = conn.execute("SELECT v_json FROM app_kv WHERE app_id = ? AND k = ?", (app_id, key)).fetchone()
        return json.loads(row["v_json"]) if row else None

    def kv_set(self, app_id: str, key: str, value: Any) -> dict[str, Any]:
        self.get_app(app_id, include_html=False)
        k = str(key or "").strip()
        if not k or len(k) > 128:
            raise ValueError("Storage key must be 1..128 characters")
        encoded = json.dumps(value, ensure_ascii=False)
        if len(encoded.encode("utf-8")) > MAX_KV_VALUE_BYTES:
            raise ValueError("Storage value exceeds 512 KB limit")
        now = _now_iso()
        with self._tx() as conn:
            conn.execute(
                """
                INSERT INTO app_kv (app_id, k, v_json, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(app_id, k) DO UPDATE SET v_json = excluded.v_json, updated_at = excluded.updated_at
                """,
                (app_id, k, encoded, now),
            )
        return {"key": k, "updated_at": now}

    def kv_delete(self, app_id: str, key: str) -> bool:
        self.get_app(app_id, include_html=False)
        with self._tx() as conn:
            cur = conn.execute("DELETE FROM app_kv WHERE app_id = ? AND k = ?", (app_id, key))
        return cur.rowcount > 0

    # --- Portable share bundles (zero secrets, zero personal KV data) ---------

    def export_bundle(self, app_id: str) -> dict[str, Any]:
        app = self.get_app(app_id, include_html=True)
        return {
            "schema": "hermifact.bundle.v1",
            "exported_at": _now_iso(),
            "id": app["id"],
            "name": app["name"],
            "description": app["description"],
            "icon": app["icon"],
            "accent": app["accent"],
            "category": app["category"],
            "inputs": app["inputs"],
            "code_hash": app["code_hash"],
            "permissions": {
                "requested_tier": app["requested_tier"],
                "requested_caps": app["requested_caps"],
                "requested_tools": app["requested_tools"],
            },
            "html": app["html"],
            "note": "Portable Hermifact bundle — contains zero API keys, credentials, or personal data. Runs on the recipient's own Hermes provider after they review & approve requested permissions.",
        }

    def import_bundle(self, bundle: dict[str, Any], *, app_id: str | None = None) -> dict[str, Any]:
        if not isinstance(bundle, dict):
            raise ValueError("Bundle must be a JSON object")
        if bundle.get("schema") not in (None, "hermifact.bundle.v1"):
            raise ValueError(f"Unsupported bundle schema: {bundle.get('schema')!r}")
        perms = bundle.get("permissions") if isinstance(bundle.get("permissions"), dict) else {}
        html = str(bundle.get("html") or "")
        inputs = bundle.get("inputs") if isinstance(bundle.get("inputs"), list) else []
        # NEVER let a shared bundle overwrite an app that is already here. A bundle id
        # travels between machines, so two people's "dashboard" collide; landing on the
        # same id would hit save_app's UPDATE branch and destroy the recipient's app
        # (its own code, name and approvals) with someone else's. Only an explicit
        # app_id from the caller — an update the user asked for — may target an
        # existing id.
        renamed_from = ""
        target_id = str(app_id or "").strip()
        if target_id:
            try:
                self.get_app(target_id, include_html=False)
            except KeyError:
                renamed_from = ""
            else:
                renamed_from = target_id  # explicit overwrite/update, reported not hidden
        else:
            base = slugify(str(bundle.get("id") or bundle.get("name") or "imported"))
            target_id, renamed_from = self._free_app_id(base)
        # Imported apps ALWAYS land unapproved (sandbox) until the recipient explicitly approves!
        app = self.save_app(
            app_id=target_id,
            name=str(bundle.get("name") or "Imported Hermifact"),
            description=str(bundle.get("description") or ""),
            icon=str(bundle.get("icon") or "📦"),
            accent=str(bundle.get("accent") or "#6366f1"),
            category=str(bundle.get("category") or "imported"),
            html=html,
            inputs=inputs,
            requested_tier=str(perms.get("requested_tier") or bundle.get("requested_tier") or "sandbox"),
            requested_caps=perms.get("requested_caps") or bundle.get("requested_caps") or [],
            requested_tools=perms.get("requested_tools") or bundle.get("requested_tools") or [],
            starter=False,
            auto_approve_starter=False,
        )
        if app is None:  # pragma: no cover - save_app always returns the stored row
            raise ValueError("Import failed: the app was not persisted")
        # The bundle's own code_hash is only a claim; the store recomputed it from the
        # bytes it actually holds. Report a disagreement instead of trusting either.
        declared = str(bundle.get("code_hash") or "").strip()
        app["hash_matches_bundle"] = bool(declared) and declared == app.get("code_hash")
        app["hash_declared"] = declared
        app["import_renamed_from"] = renamed_from
        app["imported"] = True
        return app

    def preview_bundle(self, bundle: dict[str, Any]) -> dict[str, Any]:
        """Describe what importing this bundle WOULD do, without writing anything.

        Lets the recipient see the name, the tier they are being asked to grant, the
        size, and the hash they are approving before a single row changes.
        """
        if not isinstance(bundle, dict):
            raise ValueError("Bundle must be a JSON object")
        if bundle.get("schema") not in (None, "hermifact.bundle.v1"):
            raise ValueError(f"Unsupported bundle schema: {bundle.get('schema')!r}")
        perms = bundle.get("permissions") if isinstance(bundle.get("permissions"), dict) else {}
        html = str(bundle.get("html") or "")
        inputs = bundle.get("inputs") if isinstance(bundle.get("inputs"), list) else []
        if not html.strip():
            raise ValueError("Bundle has no HTML payload")
        if len(html.encode("utf-8")) > MAX_HTML_BYTES:
            raise ValueError(f"App HTML exceeds {MAX_HTML_BYTES // 1024} KB limit")
        computed = compute_code_hash(html, inputs)
        declared = str(bundle.get("code_hash") or "").strip()
        base = slugify(str(bundle.get("id") or bundle.get("name") or "imported"))
        target_id, renamed_from = self._free_app_id(base)
        return {
            "id_would_be": target_id,
            "renamed_from": renamed_from,
            "would_overwrite": False,
            "name": str(bundle.get("name") or "Imported Hermifact"),
            "description": str(bundle.get("description") or ""),
            "icon": str(bundle.get("icon") or "📦"),
            "category": str(bundle.get("category") or "imported"),
            "requested_tier": str(perms.get("requested_tier") or bundle.get("requested_tier") or "sandbox"),
            "requested_caps": perms.get("requested_caps") or bundle.get("requested_caps") or [],
            "requested_tools": _clean_app_tools(perms.get("requested_tools") or bundle.get("requested_tools") or []),
            "html_bytes": len(html.encode("utf-8")),
            "code_hash": computed,
            "code_hash_short": computed[:12],
            "hash_matches_bundle": bool(declared) and declared == computed,
            "starts_in_sandbox": True,
        }

    def _free_app_id(self, base: str) -> tuple[str, str]:
        """Return (id that is not taken, the base id it had to move off of).

        The suffix is deterministic-ish (``-2``, ``-3`` …) so a second import of the
        same bundle is easy to spot, and the id always satisfies SLUG_RE.
        """
        base = (base or "imported")[:48] or "imported"
        if not SLUG_RE.match(base):
            base = slugify(base)
        with self._tx() as conn:
            taken = {r["id"] for r in conn.execute("SELECT id FROM apps")}
        if base not in taken:
            return base, ""
        for n in range(2, 1000):
            cand = f"{base}-{n}"[:64].rstrip("-")
            if SLUG_RE.match(cand) and cand not in taken:
                return cand, base
        stamp = str(int(time.time()))[-6:]
        return f"{base[:50]}-{stamp}", base

    # --- Audit log ------------------------------------------------------------

    def _audit_conn(self, conn: sqlite3.Connection, app_id: str, action: str, status: str, detail: str = "") -> None:
        conn.execute(
            "INSERT INTO audit_log (app_id, action, status, detail, created_at) VALUES (?, ?, ?, ?, ?)",
            (app_id, action, status, (detail or "")[:400], _now_iso()),
        )

    def record_audit(self, app_id: str, action: str, status: str, detail: str = "") -> None:
        try:
            with self._tx() as conn:
                self._audit_conn(conn, app_id, action, status, detail)
        except Exception:
            pass

    def list_audit(self, app_id: str, limit: int = 30) -> list[dict[str, Any]]:
        self.get_app(app_id, include_html=False)
        with self._tx() as conn:
            rows = conn.execute(
                "SELECT id, action, status, detail, created_at FROM audit_log WHERE app_id = ? ORDER BY id DESC LIMIT ?",
                (app_id, max(1, min(int(limit), 200))),
            ).fetchall()
        return [dict(r) for r in rows]


def encode_share_token(bundle: dict[str, Any]) -> str:
    """Compress a zero-secret Hermifact bundle into a URL-safe ``hf1.<token>`` string."""
    raw = json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = zlib.compress(raw, level=9)
    b64 = base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")
    return f"hf1.{b64}"


def decode_share_token(raw_input: str) -> dict[str, Any]:
    """Decode a ``hf1.<token>`` or a shareable URL containing ``import=hf1.<token>``."""
    s = (raw_input or "").strip()
    if not s:
        raise ValueError("Share token or URL is required")
    # Untrusted paste: bound it before base64/zlib allocate anything.
    if len(s) > MAX_SHARE_INPUT_CHARS:
        raise ValueError(
            f"Share link is {len(s):,} characters — larger than the "
            f"{MAX_SHARE_INPUT_CHARS:,} character limit. Use the .hermifact.json bundle instead."
        )
    token = s
    if "://" in s or "?import=" in s or "#import=" in s:
        parsed = urlparse(s)
        qs = parse_qs(parsed.query)
        if "import" in qs and qs["import"]:
            token = qs["import"][0]
        elif parsed.fragment:
            fqs = parse_qs(parsed.fragment.lstrip("?"))
            if "import" in fqs and fqs["import"]:
                token = fqs["import"][0]
    if token.startswith("hf1."):
        token = token[4:]
    elif not token.startswith("{"):
        raise ValueError("Unrecognized share link/token format (expected hf1.<token> or JSON)")
    else:
        obj = json.loads(token)
        if not isinstance(obj, dict):
            raise ValueError("Bundle JSON must be an object")
        return obj
    pad = "=" * (-len(token) % 4)
    try:
        compressed = base64.urlsafe_b64decode((token + pad).encode("ascii"))
        dobj = zlib.decompressobj()
        raw = dobj.decompress(compressed, MAX_HTML_BYTES + 65536)
        if not dobj.eof or dobj.unconsumed_tail:
            raise ValueError("Share token exceeds maximum allowed size")
        obj = json.loads(raw.decode("utf-8"))
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Invalid or corrupted share token: {exc}") from exc
    if not isinstance(obj, dict):
        raise ValueError("Decoded share bundle must be a JSON object")
    return obj


def get_store(root: Path | None = None) -> HermifactsStore:
    return HermifactsStore(root=root)
