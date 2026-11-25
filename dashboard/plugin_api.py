"""Hermifacts FastAPI backend — mounted by Hermes at /api/plugins/hermifacts/.

Provides three surfaces:
1. Studio CRUD, hash-pinned 3-tier permission management, OS launcher install, and
   portable share-bundle export/import.
2. Runtime Bridge (/bridge/{app_id}/*) called by sandboxed Hermifact hosts to run
   zero-API-key LLM calls, isolated KV storage, allowlisted tools, notifications, and
   scoped workspace file ops — every privileged call strictly enforces code_hash match.
3. Standalone Installable PWA (/pwa/{app_id}/*) serving the host shell, dynamic
   manifest.webmanifest, service worker, and SVG/PNG app icons.
"""

from __future__ import annotations

import importlib
import importlib.util
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response

PLUGIN_DIR = Path(__file__).resolve().parent.parent
PRIVATE_PKG = "_hermifacts_pkg"


def _load_pkg():
    init_file = PLUGIN_DIR / "__init__.py"
    for name, mod in list(sys.modules.items()):
        if name == PRIVATE_PKG or mod is None:
            continue
        p = getattr(mod, "__file__", None)
        if isinstance(p, str) and p.endswith("__init__.py") and "hermifacts" in p:
            try:
                if Path(p).resolve() == init_file:
                    return mod
            except OSError:
                pass
    if PRIVATE_PKG in sys.modules:
        return sys.modules[PRIVATE_PKG]
    spec = importlib.util.spec_from_file_location(
        PRIVATE_PKG, init_file, submodule_search_locations=[str(PLUGIN_DIR)]
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load hermifacts package from {PLUGIN_DIR}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[PRIVATE_PKG] = mod
    spec.loader.exec_module(mod)
    return mod


def _mod(sub: str):
    pkg = _load_pkg()
    return importlib.import_module(f"{pkg.__name__}.hermifacts.{sub}")


router = APIRouter()


def _fail(msg: str, status: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status, content={"ok": False, "error": msg})


def _request_origin(request: Request, override: str = "") -> str:
    if override and override.strip():
        return override.strip().rstrip("/")
    rt = _mod("runtime")
    cfg = rt.get_config("public_origin", "")
    if isinstance(cfg, str) and cfg.strip():
        return cfg.strip().rstrip("/")
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "127.0.0.1:9120"
    return f"{proto}://{host}".rstrip("/")


def _confined_path(root_str: str, rel_path: str) -> Path:
    if not root_str:
        raise PermissionError("No approved filesystem root configured for this app")
    root = Path(root_str).resolve()
    rel = (rel_path or "").strip().lstrip("/\\")
    target = (root / rel).resolve() if rel else root
    if target != root and root not in target.parents:
        raise PermissionError("Path escapes the app's approved directory")
    return target


# ------------------------------------------------------------------ Health & Info

@router.get("/health")
def health() -> dict[str, Any]:
    rt = _mod("runtime")
    st = _mod("store").get_store()
    ln = _mod("launcher")
    apps = st.list_apps()
    return {
        "ok": True,
        "plugin": "hermifacts",
        "version": "0.1.0",
        "model_ready": rt.model_ready(),
        "data_root": str(st.root),
        "platform": platform.system().lower(),
        "browser_bin": ln.detect_chromium_binary(),
        "app_count": len(apps),
        "available_tools": rt.list_available_tools(),
    }


# ------------------------------------------------------------------ Studio CRUD

@router.get("/apps")
def list_apps() -> dict[str, Any]:
    st = _mod("store").get_store()
    rt = _mod("runtime")
    return {
        "ok": True,
        "apps": st.list_apps(),
        "model_ready": rt.model_ready(),
        "available_tools": rt.list_available_tools(),
    }


@router.get("/apps/{app_id}")
def get_app(app_id: str, include_html: bool = Query(True)) -> Any:
    try:
        st = _mod("store").get_store()
        app = st.get_app(app_id, include_html=include_html)
        return {"ok": True, "app": app, "audit": st.list_audit(app_id, limit=20)}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


@router.post("/apps")
def save_app(body: dict[str, Any]) -> Any:
    try:
        st = _mod("store").get_store()
        html = str(body.get("html") or "")
        inputs = body.get("inputs") if isinstance(body.get("inputs"), list) else []
        if body.get("use_starter_template") and not html.strip():
            starters = _mod("starters")
            html = starters.NEW_APP_TEMPLATE_HTML
            if not inputs:
                inputs = list(starters.NEW_APP_TEMPLATE_INPUTS)
        app = st.save_app(
            app_id=body.get("app_id") or body.get("id"),
            name=str(body.get("name") or ""),
            description=str(body.get("description") or ""),
            icon=str(body.get("icon") or "✨"),
            accent=str(body.get("accent") or "#6366f1"),
            category=str(body.get("category") or "utility"),
            html=html,
            inputs=inputs,
            requested_tier=str(body.get("requested_tier") or "sandbox"),
            requested_caps=body.get("requested_caps") if isinstance(body.get("requested_caps"), list) else [],
            requested_tools=body.get("requested_tools") if isinstance(body.get("requested_tools"), list) else [],
            requested_fs_root=str(body.get("requested_fs_root") or ""),
        )
        return {"ok": True, "app": app}
    except ValueError as exc:
        return _fail(str(exc), 400)


@router.delete("/apps/{app_id}")
def delete_app(app_id: str) -> Any:
    try:
        st = _mod("store").get_store()
        ln = _mod("launcher")
        info = st.delete_app(app_id)
        removed_launcher = ln.remove_os_launcher(info.get("os_launcher_path", ""))
        return {"ok": True, "deleted": app_id, "removed_launcher": removed_launcher}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


@router.post("/apps/{app_id}/approve")
def approve_app(app_id: str, body: dict[str, Any]) -> Any:
    try:
        st = _mod("store").get_store()
        app = st.approve_permissions(
            app_id,
            tier=str(body.get("tier") or "sandbox"),
            caps=body.get("caps"),
            tools=body.get("tools"),
            fs_root=str(body.get("fs_root") or ""),
            expected_hash=body.get("expected_hash"),
        )
        return {"ok": True, "app": app}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except ValueError as exc:
        return _fail(str(exc), 409)


@router.post("/apps/{app_id}/revoke")
def revoke_app(app_id: str) -> Any:
    try:
        app = _mod("store").get_store().revoke_permissions(app_id)
        return {"ok": True, "app": app}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


@router.post("/apps/{app_id}/install-os")
def install_os(app_id: str, request: Request, body: dict[str, Any] | None = None) -> Any:
    try:
        st = _mod("store").get_store()
        ln = _mod("launcher")
        app = st.get_app(app_id, include_html=False)
        origin = _request_origin(request, (body or {}).get("origin", ""))
        installed = ln.install_os_launcher(app, origin=origin, data_root=st.root)
        updated = st.set_os_launcher(app_id, installed["launcher_path"])
        return {"ok": True, "installed": installed, "app": updated}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except Exception as exc:
        return _fail(str(exc), 500)


@router.get("/apps/{app_id}/export")
def export_app(app_id: str, request: Request) -> Any:
    try:
        st_mod = _mod("store")
        bundle = st_mod.get_store().export_bundle(app_id)
        share_token = st_mod.encode_share_token(bundle)
        share_path = f"/hermifacts?import={share_token}"
        origin = _request_origin(request)
        public_origin = ""
        cfg = _mod("runtime").get_config("public_origin", "")
        if isinstance(cfg, str) and cfg.strip():
            public_origin = cfg.strip().rstrip("/")
        # 8000 chars is the practical ceiling for a messenger; past that the link is
        # truncated by the client long before it reaches the recipient.
        limit = getattr(st_mod, "MAX_SHARE_MESSAGE_CHARS", 8000)
        fits = len(share_token) <= limit
        return {
            "ok": True,
            "bundle": bundle,
            "share_token": share_token,
            "share_path": share_path,
            "share_url": f"{origin}{share_path}",
            # A link is only usable by someone else when this host is reachable by
            # name, i.e. when public_origin is configured. Otherwise the token/file is
            # the portable artifact and the URL is a local convenience.
            "link_reachable_by_recipient": bool(public_origin),
            "token_chars": len(share_token),
            "fits_in_chat_message": fits,
        }
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


@router.post("/apps/inspect")
def inspect_bundle(body: dict[str, Any]) -> Any:
    """Preview a share bundle without installing it.

    The recipient sees the sender's name, icon, requested tier, payload size and the
    exact code hash before anything lands on their machine — and learns up front that
    a colliding id will be renamed rather than overwrite their own app.
    """
    try:
        st_mod = _mod("store")
        raw_link = body.get("share_token") or body.get("share_url") or body.get("share_link")
        if isinstance(raw_link, str) and raw_link.strip():
            bundle = st_mod.decode_share_token(raw_link)
        else:
            bundle = body.get("bundle") if isinstance(body.get("bundle"), dict) else None
        if not isinstance(bundle, dict):
            return _fail("Provide 'share_link', 'share_token', or 'bundle'", 400)
        preview = st_mod.get_store().preview_bundle(bundle)
        preview["ok"] = True
        preview["token_chars"] = len(raw_link) if isinstance(raw_link, str) else 0
        preview["fits_in_chat_message"] = preview["token_chars"] <= getattr(
            st_mod, "MAX_SHARE_MESSAGE_CHARS", 8000
        )
        return preview
    except ValueError as exc:
        return _fail(str(exc), 400)


@router.post("/apps/import")
def import_app(body: dict[str, Any]) -> Any:
    try:
        st_mod = _mod("store")
        raw_link = body.get("share_token") or body.get("share_url") or body.get("share_link")
        if isinstance(raw_link, str) and raw_link.strip():
            bundle = st_mod.decode_share_token(raw_link)
        else:
            bundle = body.get("bundle") if isinstance(body.get("bundle"), dict) else body
        app = st_mod.get_store().import_bundle(bundle, app_id=body.get("app_id"))
        return {"ok": True, "app": app}
    except ValueError as exc:
        return _fail(str(exc), 400)


@router.get("/apps/{app_id}/audit")
def get_audit(app_id: str, limit: int = Query(30, ge=1, le=200)) -> Any:
    try:
        return {"ok": True, "audit": _mod("store").get_store().list_audit(app_id, limit=limit)}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


@router.get("/apps/{app_id}/render-doc")
def render_doc(app_id: str) -> Any:
    """Return the SDK-injected HTML document for Desktop's SandboxedFrame runner."""
    try:
        st = _mod("store").get_store()
        pwa = _mod("pwa")
        app = st.get_app(app_id, include_html=True)
        return {"ok": True, "html": pwa.inject_guest_sdk(app["html"], app), "code_hash": app["code_hash"]}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


# ------------------------------------------------------------------ Runtime Bridge

@router.post("/bridge/{app_id}/storage/list")
def bridge_storage_list(app_id: str) -> Any:
    try:
        return {"ok": True, "items": _mod("store").get_store().kv_list(app_id)}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


@router.post("/bridge/{app_id}/storage/get")
def bridge_storage_get(app_id: str, body: dict[str, Any]) -> Any:
    try:
        val = _mod("store").get_store().kv_get(app_id, str(body.get("key") or ""))
        return {"ok": True, "value": val}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


@router.post("/bridge/{app_id}/storage/set")
def bridge_storage_set(app_id: str, body: dict[str, Any]) -> Any:
    try:
        out = _mod("store").get_store().kv_set(app_id, str(body.get("key") or ""), body.get("value"))
        return {"ok": True, **out}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except ValueError as exc:
        return _fail(str(exc), 400)


@router.post("/bridge/{app_id}/storage/delete")
def bridge_storage_delete(app_id: str, body: dict[str, Any]) -> Any:
    try:
        deleted = _mod("store").get_store().kv_delete(app_id, str(body.get("key") or ""))
        return {"ok": True, "deleted": deleted}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)


@router.post("/bridge/{app_id}/llm/complete")
def bridge_llm_complete(app_id: str, body: dict[str, Any]) -> Any:
    st = _mod("store").get_store()
    rt = _mod("runtime")
    try:
        st.require_capability(app_id, "llm")
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except PermissionError as exc:
        return _fail(str(exc), 403)
    try:
        llm_client = rt.llm()
    except RuntimeError as exc:
        return _fail(str(exc), 503)

    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        return _fail("messages must be a non-empty list", 400)
    max_tokens = min(int(body.get("max_tokens", 600) or 600), 4096)
    temperature = float(body.get("temperature", 0.4) if body.get("temperature") is not None else 0.4)
    try:
        res = llm_client.complete(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            purpose=f"hermifact:{app_id}",
        )
        st.record_audit(app_id, "llm.complete", "ok", f"{getattr(res, 'provider', '')}/{getattr(res, 'model', '')}")
        return {
            "ok": True,
            "text": getattr(res, "text", ""),
            "provider": getattr(res, "provider", ""),
            "model": getattr(res, "model", ""),
            "usage": getattr(res, "usage", None),
        }
    except Exception as exc:
        st.record_audit(app_id, "llm.complete", "error", str(exc))
        return _fail(f"LLM call failed: {exc}", 502)


@router.post("/bridge/{app_id}/llm/structured")
def bridge_llm_structured(app_id: str, body: dict[str, Any]) -> Any:
    st = _mod("store").get_store()
    rt = _mod("runtime")
    try:
        st.require_capability(app_id, "llm")
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except PermissionError as exc:
        return _fail(str(exc), 403)
    try:
        llm_client = rt.llm()
    except RuntimeError as exc:
        return _fail(str(exc), 503)

    instructions = str(body.get("instructions") or "").strip()
    json_schema = body.get("json_schema")
    raw_input = body.get("input")
    if not instructions or not isinstance(json_schema, dict):
        return _fail("instructions and json_schema are required", 400)
    if isinstance(raw_input, str):
        inp = [{"type": "text", "text": raw_input}]
    elif isinstance(raw_input, list):
        inp = raw_input
    else:
        inp = [{"type": "text", "text": json.dumps(raw_input or {})}]
    try:
        res = llm_client.complete_structured(
            instructions=instructions,
            input=inp,
            json_schema=json_schema,
            schema_name=str(body.get("schema_name") or f"hermifact.{app_id}"),
            max_tokens=min(int(body.get("max_tokens", 800) or 800), 4096),
            temperature=float(body.get("temperature", 0.1) if body.get("temperature") is not None else 0.1),
            purpose=f"hermifact:{app_id}",
        )
        st.record_audit(app_id, "llm.structured", "ok", f"{getattr(res, 'provider', '')}/{getattr(res, 'model', '')}")
        return {
            "ok": True,
            "parsed": getattr(res, "parsed", None),
            "text": getattr(res, "text", ""),
            "provider": getattr(res, "provider", ""),
            "model": getattr(res, "model", ""),
        }
    except Exception as exc:
        st.record_audit(app_id, "llm.structured", "error", str(exc))
        return _fail(f"Structured LLM call failed: {exc}", 502)


@router.post("/bridge/{app_id}/tools/call")
def bridge_tools_call(app_id: str, body: dict[str, Any]) -> Any:
    st = _mod("store").get_store()
    rt = _mod("runtime")
    tool_name = str(body.get("name") or "").strip()
    if not tool_name:
        return _fail("tool name is required", 400)
    try:
        st.require_capability(app_id, "tools", tool_name=tool_name)
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except PermissionError as exc:
        return _fail(str(exc), 403)
    try:
        result = rt.dispatch_tool(tool_name, body.get("args") if isinstance(body.get("args"), dict) else {})
        st.record_audit(app_id, f"tool:{tool_name}", "ok", "dispatched")
        return {"ok": True, "tool": tool_name, "result": result}
    except Exception as exc:
        st.record_audit(app_id, f"tool:{tool_name}", "error", str(exc))
        return _fail(f"Tool call failed: {exc}", 502)


@router.post("/bridge/{app_id}/notify")
def bridge_notify(app_id: str, body: dict[str, Any]) -> Any:
    st = _mod("store").get_store()
    rt = _mod("runtime")
    try:
        app = st.require_capability(app_id, "notify")
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except PermissionError as exc:
        return _fail(str(exc), 403)
    title = str(body.get("title") or app["name"])[:120]
    msg = str(body.get("body") or "")[:400]
    os_sent = False
    if rt.get_config("enable_os_notifications", True):
        if shutil.which("notify-send"):
            try:
                subprocess.run(
                    ["notify-send", title, msg],
                    check=False,
                    timeout=2,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                os_sent = True
            except Exception:
                pass
        elif platform.system() == "Darwin" and shutil.which("osascript"):
            try:
                safe_t = title.replace('"', "'")
                safe_m = msg.replace('"', "'")
                subprocess.run(
                    ["osascript", "-e", f'display notification "{safe_m}" with title "{safe_t}"'],
                    check=False,
                    timeout=2,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                os_sent = True
            except Exception:
                pass
    st.record_audit(app_id, "notify", "ok", f"{title}: {msg[:80]}")
    return {"ok": True, "delivered_os": os_sent, "title": title, "body": msg}


@router.post("/bridge/{app_id}/fs/list")
def bridge_fs_list(app_id: str, body: dict[str, Any]) -> Any:
    st = _mod("store").get_store()
    try:
        app = st.require_capability(app_id, "fs")
        target = _confined_path(app["effective_fs_root"], str(body.get("path") or ""))
        if not target.is_dir():
            return _fail("Target is not a directory", 400)
        entries = [
            {"name": e.name, "is_dir": e.is_dir(), "size": e.stat().st_size if e.is_file() else 0}
            for e in sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))[:200]
        ]
        return {"ok": True, "entries": entries}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except PermissionError as exc:
        return _fail(str(exc), 403)


@router.post("/bridge/{app_id}/fs/read")
def bridge_fs_read(app_id: str, body: dict[str, Any]) -> Any:
    st = _mod("store").get_store()
    try:
        app = st.require_capability(app_id, "fs")
        target = _confined_path(app["effective_fs_root"], str(body.get("path") or ""))
        if not target.is_file():
            return _fail("File not found", 404)
        if target.stat().st_size > 1024 * 1024:
            return _fail("File exceeds 1 MB limit", 400)
        return {"ok": True, "content": target.read_text(encoding="utf-8")}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except PermissionError as exc:
        return _fail(str(exc), 403)


@router.post("/bridge/{app_id}/fs/write")
def bridge_fs_write(app_id: str, body: dict[str, Any]) -> Any:
    st = _mod("store").get_store()
    try:
        app = st.require_capability(app_id, "fs")
        rel = str(body.get("path") or "").strip()
        if not rel:
            return _fail("path is required", 400)
        target = _confined_path(app["effective_fs_root"], rel)
        content = str(body.get("content") or "")
        if len(content.encode("utf-8")) > 1024 * 1024:
            return _fail("Content exceeds 1 MB limit", 400)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        st.record_audit(app_id, "fs.write", "ok", rel)
        return {"ok": True, "path": rel, "bytes": len(content.encode("utf-8"))}
    except KeyError as exc:
        return _fail(str(exc.args[0] if exc.args else exc), 404)
    except PermissionError as exc:
        return _fail(str(exc), 403)


# ------------------------------------------------------------------ Standalone PWA

@router.get("/pwa/{app_id}", response_class=HTMLResponse)
@router.get("/pwa/{app_id}/", response_class=HTMLResponse)
def pwa_shell(app_id: str) -> Any:
    try:
        app = _mod("store").get_store().get_app(app_id, include_html=True)
        return HTMLResponse(_mod("pwa").render_pwa_shell(app))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0] if exc.args else exc))


@router.get("/pwa/{app_id}/manifest.webmanifest")
def pwa_manifest(app_id: str) -> Any:
    try:
        app = _mod("store").get_store().get_app(app_id, include_html=False)
        return Response(
            content=json.dumps(_mod("pwa").build_manifest(app), indent=2),
            media_type="application/manifest+json",
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0] if exc.args else exc))


@router.get("/pwa/{app_id}/sw.js")
def pwa_sw(app_id: str) -> Any:
    try:
        app = _mod("store").get_store().get_app(app_id, include_html=False)
        return Response(
            content=_mod("pwa").build_service_worker(app),
            media_type="application/javascript",
            headers={"Service-Worker-Allowed": app["pwa_path"]},
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0] if exc.args else exc))


@router.get("/pwa/{app_id}/icon.svg")
def pwa_icon_svg(app_id: str) -> Any:
    try:
        app = _mod("store").get_store().get_app(app_id, include_html=False)
        svg = _mod("pwa").render_icon_svg(app["name"], app.get("icon", "✨"), app.get("accent", "#6366f1"))
        return Response(content=svg, media_type="image/svg+xml")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0] if exc.args else exc))


@router.get("/pwa/{app_id}/icon-{size}.png")
def pwa_icon_png(app_id: str, size: int) -> Any:
    try:
        app = _mod("store").get_store().get_app(app_id, include_html=False)
        png = _mod("pwa").render_icon_png(app["name"], app.get("icon", "✨"), app.get("accent", "#6366f1"), size=size)
        return Response(content=png, media_type="image/png")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc.args[0] if exc.args else exc))
