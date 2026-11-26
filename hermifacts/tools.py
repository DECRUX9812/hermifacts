"""Agent tools and /hermifacts slash command handlers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import launcher, runtime
from .store import MAX_HTML_BYTES, decode_share_token, encode_share_token, get_store


def _ok(**data: Any) -> str:
    return json.dumps({"ok": True, **data}, indent=2, ensure_ascii=False)


def _err(message: str) -> str:
    return json.dumps({"ok": False, "error": message}, indent=2, ensure_ascii=False)


def _default_origin() -> str:
    cfg = runtime.get_config("public_origin", "")
    if isinstance(cfg, str) and cfg.strip():
        return cfg.strip().rstrip("/")
    return "http://127.0.0.1:9120"


def _public_origin() -> str:
    """The origin a RECIPIENT could actually reach, or "" when there is none.

    ``_default_origin`` falls back to 127.0.0.1 for local PWA links, but a loopback
    URL is worse than no URL in a share: it silently points the recipient at their
    own machine. Only a configured ``public_origin`` may be put in a shared link.
    """
    cfg = runtime.get_config("public_origin", "")
    if isinstance(cfg, str) and cfg.strip():
        return cfg.strip().rstrip("/")
    return ""


def _path_within(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def _confined_model_file_path(raw_path: Any) -> Path:
    """Resolve a model-supplied read path inside the session workspace or plugin data.

    Tool arguments are prompt-injectable. They must never become ambient authority to
    read arbitrary user files (``.env``, shell rc files, browser state) into an app.
    """
    text = str(raw_path or "").strip()
    if not text:
        raise ValueError("file_path is required")
    workspace = runtime.session_workspace()
    plugin_root = runtime.data_dir().resolve()
    candidate = Path(text).expanduser()
    if not candidate.is_absolute():
        if workspace is None:
            raise ValueError("Relative file_path requires an active session workspace")
        candidate = workspace / candidate
    try:
        resolved = candidate.resolve()
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"Invalid file_path: {exc}") from exc
    roots = [plugin_root]
    if workspace is not None and workspace != plugin_root:
        roots.insert(0, workspace)
    if not any(_path_within(resolved, root) for root in roots):
        raise PermissionError(
            "file_path must stay inside the session workspace or the Hermifacts plugin data folder"
        )
    return resolved


def _read_confined_model_file(raw_path: Any, *, max_bytes: int, label: str) -> str:
    path = _confined_model_file_path(raw_path)
    if not path.is_file():
        raise ValueError(f"{label} file not found: {path}")
    size = path.stat().st_size
    if size > max_bytes:
        raise ValueError(f"{label} file exceeds the {max_bytes // 1024} KB limit")
    return path.read_text(encoding="utf-8")


def _export_output_path(store_root: Path, app_id: str, raw_name: Any) -> Path:
    """Return the confined export target for an optional basename-only output name."""
    filename = str(raw_name or "").strip() or f"{app_id}.hermifact.json"
    if (
        not filename
        or filename in {".", ".."}
        or "/" in filename
        or "\\" in filename
        or Path(filename).name != filename
    ):
        raise ValueError("output_path must be a plain filename, not a path")
    if not filename.endswith(".hermifact.json"):
        raise ValueError("output_path must end with .hermifact.json")
    if len(filename.encode("utf-8")) > 160:
        raise ValueError("output_path filename is too long")
    exports_dir = store_root / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    exports_root = exports_dir.resolve()
    target = (exports_dir / filename).resolve()
    if target.parent != exports_root:
        raise ValueError("output_path must stay inside the Hermifacts exports folder")
    return target


def share_link_meta(share_token: str) -> dict[str, Any]:
    """Size facts about a token, so callers stop handing people links that truncate."""
    from .store import MAX_SHARE_MESSAGE_CHARS

    chars = len(share_token)
    fits = chars <= MAX_SHARE_MESSAGE_CHARS
    return {
        "token_chars": chars,
        "fits_in_chat_message": fits,
        "share_hint": (
            "Send the hf1 token or the .hermifact.json file — they work on any machine."
            if fits
            else (
                f"This token is {chars:,} characters, too long for a chat message or email "
                f"(limit ~{MAX_SHARE_MESSAGE_CHARS:,}). Send the .hermifact.json bundle instead."
            )
        ),
    }


def handle_create(args: dict[str, Any], **_: Any) -> str:
    try:
        html = args.get("html") or ""
        if not html and args.get("file_path"):
            html = _read_confined_model_file(args["file_path"], max_bytes=MAX_HTML_BYTES, label="HTML")
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
        # Tool arguments are model-controlled, so the launcher origin never comes
        # from the call itself; use operator config or the local dashboard default.
        origin = _default_origin()
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
        store = get_store()
        info = store.delete_app(app_id)
        removed_launcher = launcher.remove_os_launcher(
            info.get("os_launcher_path", ""), data_root=store.root
        )
        return _ok(deleted=app_id, removed_launcher=removed_launcher)
    except Exception as exc:
        return _err(str(exc))


def handle_export(args: dict[str, Any], **_: Any) -> str:
    try:
        app_id = str(args.get("app_id") or "").strip()
        store = get_store()
        bundle = store.export_bundle(app_id)
        share_token = encode_share_token(bundle)
        meta = share_link_meta(share_token)
        # A link only makes sense if the recipient can open the host that serves it.
        # Without a configured public_origin we hand over the token/path, never a
        # loopback URL that would point the recipient at their own machine.
        origin = _public_origin()
        share_path = f"/hermifacts?import={share_token}"
        share_url = f"{origin}{share_path}" if origin else ""
        out_path = str(args.get("output_path") or "").strip()
        if out_path:
            p = _export_output_path(store.root, app_id, out_path)
            p.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")
            return _ok(
                path=str(p), app_id=app_id, code_hash=bundle["code_hash"],
                share_token=share_token, share_path=share_path, share_url=share_url,
                link_reachable_by_recipient=bool(origin), **meta,
            )
        return _ok(
            bundle=bundle, share_token=share_token, share_path=share_path,
            share_url=share_url, link_reachable_by_recipient=bool(origin), **meta,
        )
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
            raw = _read_confined_model_file(
                args["file_path"], max_bytes=MAX_HTML_BYTES + 1024 * 1024, label="bundle"
            )
            bundle = json.loads(raw)
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
