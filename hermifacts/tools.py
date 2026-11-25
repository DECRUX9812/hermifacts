"""Agent tools and /hermifacts slash command handlers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import launcher, runtime
from .store import decode_share_token, encode_share_token, get_store


def _ok(**data: Any) -> str:
    return json.dumps({"ok": True, **data}, indent=2, ensure_ascii=False)


def _err(message: str) -> str:
    return json.dumps({"ok": False, "error": message}, indent=2, ensure_ascii=False)


def _default_origin() -> str:
    cfg = runtime.get_config("public_origin", "")
    if isinstance(cfg, str) and cfg.strip():
        return cfg.strip().rstrip("/")
    return "http://127.0.0.1:9120"


def handle_create(args: dict[str, Any], **_: Any) -> str:
    try:
        html = args.get("html") or ""
        if not html and args.get("file_path"):
            p = Path(str(args["file_path"])).expanduser()
            if not p.is_file():
                return _err(f"HTML file not found: {p}")
            html = p.read_text(encoding="utf-8")
        store = get_store()
        app = store.save_app(
            app_id=args.get("app_id"),
            name=str(args.get("name") or ""),
            description=str(args.get("description") or ""),
            icon=str(args.get("icon") or "✨"),
            accent=str(args.get("accent") or "#6366f1"),
            category=str(args.get("category") or "utility"),
            html=html,
            inputs=args.get("inputs") if isinstance(args.get("inputs"), list) else [],
            requested_tier=str(args.get("requested_tier") or runtime.get_config("default_tier", "sandbox")),
            requested_caps=args.get("requested_caps") if isinstance(args.get("requested_caps"), list) else [],
            requested_tools=args.get("requested_tools") if isinstance(args.get("requested_tools"), list) else [],
            requested_fs_root=str(args.get("requested_fs_root") or ""),
        )
        origin = _default_origin()
        summary = {k: v for k, v in app.items() if k != "html"}
        app_id_val = app['id']
        return _ok(
            app=summary,
            directive=f'::hermifact{{id="{app_id_val}"}}',
            pwa_url=f"{origin}{app['pwa_path']}",
            note="Emit the directive on its own line in chat to render an interactive Install/Run card. Elevated permissions remain locked until the user approves this code hash in Hermifacts Studio.",
        )
    except Exception as exc:
        return _err(str(exc))


def handle_list(args: dict[str, Any], **_: Any) -> str:
    try:
        apps = get_store().list_apps()
        return _ok(count=len(apps), apps=apps)
    except Exception as exc:
        return _err(str(exc))


def handle_get(args: dict[str, Any], **_: Any) -> str:
    try:
        app_id = str(args.get("app_id") or "").strip()
        include_html = bool(args.get("include_html", False))
        app = get_store().get_app(app_id, include_html=include_html)
        return _ok(app=app)
    except Exception as exc:
        return _err(str(exc))


def handle_install(args: dict[str, Any], **_: Any) -> str:
    try:
        app_id = str(args.get("app_id") or "").strip()
        origin = str(args.get("origin") or _default_origin()).strip().rstrip("/")
        store = get_store()
        app = store.get_app(app_id, include_html=False)
        result = launcher.install_os_launcher(app, origin=origin, data_root=store.root)
        updated = store.set_os_launcher(app_id, result["launcher_path"])
        return _ok(installed=result, app=updated)
    except Exception as exc:
        return _err(str(exc))


def handle_delete(args: dict[str, Any], **_: Any) -> str:
    try:
        app_id = str(args.get("app_id") or "").strip()
        info = get_store().delete_app(app_id)
        removed_launcher = launcher.remove_os_launcher(info.get("os_launcher_path", ""))
        return _ok(deleted=app_id, removed_launcher=removed_launcher)
    except Exception as exc:
        return _err(str(exc))


def handle_export(args: dict[str, Any], **_: Any) -> str:
    try:
        app_id = str(args.get("app_id") or "").strip()
        bundle = get_store().export_bundle(app_id)
        share_token = encode_share_token(bundle)
        share_url = f"{_default_origin()}/hermifacts?import={share_token}"
        out_path = str(args.get("output_path") or "").strip()
        if out_path:
            p = Path(out_path).expanduser()
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")
            return _ok(path=str(p), app_id=app_id, code_hash=bundle["code_hash"], share_token=share_token, share_url=share_url)
        return _ok(bundle=bundle, share_token=share_token, share_url=share_url)
    except Exception as exc:
        return _err(str(exc))


def handle_import(args: dict[str, Any], **_: Any) -> str:
    try:
        bundle = args.get("bundle")
        share_link = args.get("share_link") or args.get("share_token")
        if isinstance(share_link, str) and share_link.strip():
            bundle = decode_share_token(share_link)
        elif isinstance(bundle, str):
            bundle = decode_share_token(bundle)
        if not bundle and args.get("file_path"):
            p = Path(str(args["file_path"])).expanduser()
            bundle = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(bundle, dict):
            return _err("Provide 'share_link', 'bundle' (object/JSON string), or 'file_path'")
        app = get_store().import_bundle(bundle, app_id=args.get("app_id"))
        summary = {k: v for k, v in app.items() if k != "html"}
        aid = app['id']
        return _ok(app=summary, directive=f'::hermifact{{id="{aid}"}}')
    except Exception as exc:
        return _err(str(exc))


def handle_slash_command(raw_args: str) -> str:
    parts = (raw_args or "").strip().split()
    sub = parts[0].lower() if parts else "list"
    store = get_store()
    if sub in ("list", "ls", "status"):
        apps = store.list_apps()
        if not apps:
            return "No Hermifacts installed yet. Open /hermifacts in Hermes Desktop or ask Hermes to build one."
        lines = [f"Hermifacts ({len(apps)}):"]
        for a in apps:
            badge = "⚠️ needs approval" if a["needs_approval"] else a["effective_tier"]
            inst = " [OS app]" if a["os_installed"] else ""
            lines.append(f"- {a['icon']} **{a['name']}** (`{a['id']}`) · {badge}{inst} · `{a['pwa_path']}`")
        return "\n".join(lines)
    return (
        "Usage: `/hermifacts` (list installed Hermifacts). "
        "Open the **Hermifacts** page in Hermes Desktop to run, approve permissions, install as a PWA or OS app, or share bundles."
    )
