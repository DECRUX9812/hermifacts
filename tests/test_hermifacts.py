"""Comprehensive unit & FastAPI integration tests for Hermifacts."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

def _load_plugin_entry():
    spec = importlib.util.spec_from_file_location(
        "_hermifacts_plugin_entry",
        ROOT / "__init__.py",
        submodule_search_locations=[str(ROOT)],
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["_hermifacts_plugin_entry"] = mod
    spec.loader.exec_module(mod)
    return mod


plugin_entry = _load_plugin_entry()
from hermifacts import launcher, pwa, runtime, store, tools
from hermifacts.store import (
    HermifactsStore,
    compute_code_hash,
    decode_share_token,
    encode_share_token,
)


def _load_api_module():
    spec = importlib.util.spec_from_file_location(
        "hermifacts_plugin_api_test", ROOT / "dashboard" / "plugin_api.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class FakeLLM:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def complete(self, *, messages, max_tokens=600, temperature=0.4, purpose=""):
        self.calls.append({"kind": "complete", "messages": messages, "purpose": purpose})
        return SimpleNamespace(
            text="AI response ok",
            provider="nous",
            model="hermes-test",
            usage={"total_tokens": 42},
        )

    def complete_structured(
        self, *, instructions, input, json_schema, schema_name="", max_tokens=800, temperature=0.1, purpose=""
    ):
        self.calls.append({"kind": "structured", "schema_name": schema_name, "purpose": purpose})
        return SimpleNamespace(
            parsed={"summary": "structured ok", "score": 99},
            text='{"summary":"structured ok","score":99}',
            provider="nous",
            model="hermes-test",
        )


class FakePluginCtx:
    def __init__(self, data_root: Path, *, with_llm: bool = True) -> None:
        self._data_root = data_root
        self.llm = FakeLLM() if with_llm else None
        self.config = {
            "default_tier": "sandbox",
            "public_origin": "https://hermes.example.test",
            "enable_os_notifications": False,
        }
        self.registered_tools: dict[str, dict[str, Any]] = {}
        self.registered_commands: dict[str, Any] = {}

    def data_dir(self) -> Path:
        return self._data_root

    def register_tool(self, *, name, toolset, schema, handler, **kwargs):
        self.registered_tools[name] = {
            "toolset": toolset,
            "schema": schema,
            "handler": handler,
            **kwargs,
        }

    def register_command(self, *, name, handler, description="", args_hint="", **kwargs):
        self.registered_commands[name] = {
            "handler": handler,
            "description": description,
            "args_hint": args_hint,
            **kwargs,
        }


@pytest.fixture()
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data_root = tmp_path / "plugin-data"
    data_root.mkdir(parents=True, exist_ok=True)
    ctx = FakePluginCtx(data_root)
    runtime.bind(ctx)
    # Ensure both direct imports and private package imports share the same isolated data_dir
    monkeypatch.setattr(runtime, "data_dir", lambda: data_root)
    yield SimpleNamespace(tmp_path=tmp_path, data_root=data_root, ctx=ctx)
    runtime.bind(None)


# ------------------------------------------------------------------ Store & Permissions

def test_starters_seeded_and_auto_approved_safely(isolated_env):
    st = HermifactsStore(root=isolated_env.data_root)
    apps = st.list_apps()
    assert len(apps) >= 1
    for a in apps:
        assert a["starter"] is True
        assert a["effective_tier"] != "full"
        if a["requested_tier"] == "app":
            assert a["effective_tier"] == "app"
            assert a["hash_matches"] is True
            assert a["needs_approval"] is False


def test_hash_pinned_permissions_invalidate_on_code_edit(isolated_env):
    st = HermifactsStore(root=isolated_env.data_root)
    app = st.save_app(
        app_id="calc-app",
        name="Calc App",
        html="<h1>v1</h1>",
        requested_tier="app",
        requested_caps=["llm", "notify"],
    )
    assert app["effective_tier"] == "sandbox"
    assert app["needs_approval"] is True
    with pytest.raises(PermissionError):
        st.require_capability("calc-app", "llm")

    # Mismatched hash must fail
    with pytest.raises(ValueError):
        st.approve_permissions("calc-app", tier="app", caps=["llm"], expected_hash="deadbeef")

    # Matching hash succeeds
    approved = st.approve_permissions(
        "calc-app", tier="app", caps=["llm", "notify"], expected_hash=app["code_hash"]
    )
    assert approved["effective_tier"] == "app"
    assert approved["hash_matches"] is True
    assert approved["needs_approval"] is False
    assert st.require_capability("calc-app", "llm")["id"] == "calc-app"

    # Editing HTML changes code_hash and immediately revokes effective elevation
    edited = st.save_app(
        app_id="calc-app",
        name="Calc App",
        html="<h1>v2 — changed</h1>",
        requested_tier="app",
        requested_caps=["llm", "notify"],
    )
    assert edited["version"] == 2
    assert edited["code_hash"] != app["code_hash"]
    assert edited["approval_stale"] is True
    assert edited["effective_tier"] == "sandbox"
    assert edited["effective_caps"] == []
    with pytest.raises(PermissionError, match="changed since permissions were approved"):
        st.require_capability("calc-app", "llm")

    # Revoking clears stale state cleanly
    revoked = st.revoke_permissions("calc-app")
    assert revoked["approved_tier"] == "sandbox"
    assert revoked["approval_stale"] is False


def test_kv_isolation_and_cascade_delete(isolated_env):
    st = HermifactsStore(root=isolated_env.data_root)
    st.save_app(app_id="app-a", name="App A", html="<p>A</p>")
    st.save_app(app_id="app-b", name="App B", html="<p>B</p>")
    st.kv_set("app-a", "theme", {"mode": "dark", "count": 3})
    assert st.kv_get("app-a", "theme") == {"mode": "dark", "count": 3}
    assert st.kv_get("app-b", "theme") is None
    assert st.kv_list("app-a") == {"theme": {"mode": "dark", "count": 3}}
    assert st.kv_delete("app-a", "theme") is True
    assert st.kv_delete("app-a", "theme") is False
    st.delete_app("app-a")
    with pytest.raises(KeyError):
        st.get_app("app-a")


def test_share_token_roundtrip_and_unapproved_import(isolated_env):
    st = HermifactsStore(root=isolated_env.data_root)
    created = st.save_app(
        app_id="chart-flow",
        name="Chart Flow",
        html="<div id='chart'>ok</div>",
        inputs=[{"key": "region", "label": "Region", "type": "select", "options": ["US", "EU"], "default": "US"}],
        requested_tier="app",
        requested_caps=["llm"],
    )
    st.approve_permissions("chart-flow", tier="app", caps=["llm"], expected_hash=created["code_hash"])
    st.kv_set("chart-flow", "secret_note", "private-user-data")

    bundle = st.export_bundle("chart-flow")
    assert "secret_note" not in json.dumps(bundle)
    assert bundle["schema"] == "hermifact.bundle.v1"

    token = encode_share_token(bundle)
    assert token.startswith("hf1.")
    assert decode_share_token(token)["name"] == "Chart Flow"
    assert decode_share_token(f"https://hermes.example.com/hermifacts?import={token}")["id"] == "chart-flow"
    assert decode_share_token(f"https://hermes.example.com/hermifacts#import={token}")["id"] == "chart-flow"

    imported = st.import_bundle(decode_share_token(token), app_id="chart-flow-copy")
    assert imported["id"] == "chart-flow-copy"
    assert imported["effective_tier"] == "sandbox"  # MUST land unapproved!
    assert imported["needs_approval"] is True
    assert imported["requested_tier"] == "app"

    with pytest.raises(ValueError):
        decode_share_token("not-a-valid-token")
    with pytest.raises(ValueError):
        decode_share_token("hf1.!!!corrupted!!!")


# ------------------------------------------------------------------ PWA & Launcher

def test_pwa_shell_sandbox_and_assets(isolated_env):
    st = HermifactsStore(root=isolated_env.data_root)
    app = st.save_app(
        app_id="pwa-demo",
        name="PWA Demo",
        html="<html><body><script>console.log('</script>');</script></body></html>",
        accent="not-a-color;background:red",
        inputs=[{"key": "rate", "label": "Rate", "type": "range", "min": 1, "max": 10, "default": 5}],
    )
    shell = pwa.render_pwa_shell(app)
    assert 'sandbox="allow-scripts allow-forms allow-downloads"' in shell
    assert "allow-same-origin" not in shell
    assert "not-a-color" not in shell
    assert "manifest.webmanifest" in shell

    injected = pwa.inject_guest_sdk(app["html"], app)
    assert "window.hermesApp" in injected
    assert "window.hermifacts" in injected

    manifest = pwa.build_manifest(app)
    assert manifest["display"] == "standalone"
    assert manifest["start_url"] == "/api/plugins/hermifacts/pwa/pwa-demo/"
    assert len(manifest["icons"]) >= 2

    sw = pwa.build_service_worker(app)
    assert "self.addEventListener" in sw

    svg = pwa.render_icon_svg("PWA Demo", "🚀", "#10b981")
    assert svg.startswith("<svg") and "rgb(16,185,129)" in svg
    png = pwa.render_icon_png("PWA Demo", "🚀", "#10b981", size=64)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")


@pytest.mark.parametrize("sys_name", ["linux", "darwin", "windows"])
def test_os_launcher_install_and_remove(isolated_env, sys_name: str):
    st = HermifactsStore(root=isolated_env.data_root)
    app = st.save_app(app_id=f"os-{sys_name}", name=f"OS {sys_name}", html="<p>hi</p>")
    fake_home = isolated_env.tmp_path / f"home-{sys_name}"
    fake_home.mkdir(parents=True, exist_ok=True)
    res = launcher.install_os_launcher(
        app,
        origin="http://127.0.0.1:9120",
        data_root=isolated_env.data_root,
        system_override=sys_name,
        home_override=fake_home,
    )
    lp = Path(res["launcher_path"])
    assert lp.exists()
    assert Path(res["icon_path"]).exists()
    assert res["pwa_url"].endswith(f"/pwa/os-{sys_name}/")
    assert launcher.remove_os_launcher(str(lp)) is True
    assert not lp.exists()


# ------------------------------------------------------------------ Agent Tools & Registration

def test_plugin_register_and_tool_handlers(isolated_env):
    plugin_entry.register(isolated_env.ctx)
    expected_tools = {
        "hermifact_create",
        "hermifact_list",
        "hermifact_get",
        "hermifact_install",
        "hermifact_delete",
        "hermifact_export",
        "hermifact_import",
    }
    assert expected_tools.issubset(set(isolated_env.ctx.registered_tools.keys()))
    assert "hermifacts" in isolated_env.ctx.registered_commands

    created = json.loads(tools.handle_create({
        "app_id": "agent-made",
        "name": "Agent Made",
        "html": "<h1>Hello</h1>",
        "requested_tier": "app",
        "requested_caps": ["llm"],
    }))
    assert created["ok"] is True
    assert created["directive"] == '::hermifact{id="agent-made"}'

    listed = json.loads(tools.handle_list({}))
    assert listed["ok"] is True
    assert any(a["id"] == "agent-made" for a in listed["apps"])

    exported = json.loads(tools.handle_export({"app_id": "agent-made"}))
    assert exported["ok"] is True
    assert exported["share_token"].startswith("hf1.")
    assert "?import=hf1." in exported["share_url"]

    imported = json.loads(tools.handle_import({"share_link": exported["share_url"], "app_id": "agent-clone"}))
    assert imported["ok"] is True
    assert imported["app"]["id"] == "agent-clone"
    assert imported["app"]["effective_tier"] == "sandbox"

    slash = tools.handle_slash_command("list")
    assert "Agent Made" in slash

    deleted = json.loads(tools.handle_delete({"app_id": "agent-clone"}))
    assert deleted["ok"] is True


# ------------------------------------------------------------------ FastAPI Integration

def test_fastapi_crud_bridge_and_pwa_routes(isolated_env, monkeypatch: pytest.MonkeyPatch):
    api_mod = _load_api_module()
    # Align private package runtime data_dir and tool dispatcher with test fixture
    priv_rt = api_mod._mod("runtime")
    monkeypatch.setattr(priv_rt, "data_dir", lambda: isolated_env.data_root)
    monkeypatch.setattr(
        priv_rt,
        "dispatch_tool",
        lambda name, args: {"echo_tool": name, "args": args},
    )

    app = FastAPI()
    app.include_router(api_mod.router, prefix="/api/plugins/hermifacts")
    client = TestClient(app)

    # Health & list
    h = client.get("/api/plugins/hermifacts/health")
    assert h.status_code == 200
    hdata = h.json()
    assert hdata["ok"] is True
    assert hdata["model_ready"] is True
    assert hdata["app_count"] >= 1

    # Create app requesting llm + tools + fs
    work_dir = isolated_env.tmp_path / "sandbox-fs"
    work_dir.mkdir()
    r = client.post(
        "/api/plugins/hermifacts/apps",
        json={
            "app_id": "full-demo",
            "name": "Full Demo",
            "html": "<h1>Demo</h1>",
            "requested_tier": "full",
            "requested_caps": ["llm", "notify", "tools", "fs"],
            "requested_tools": ["web_search"],
            "requested_fs_root": str(work_dir),
        },
    )
    assert r.status_code == 200
    created = r.json()["app"]
    code_hash = created["code_hash"]

    # KV storage works in sandbox tier
    assert client.post("/api/plugins/hermifacts/bridge/full-demo/storage/set", json={"key": "k1", "value": [1, 2]}).json()["ok"] is True
    assert client.post("/api/plugins/hermifacts/bridge/full-demo/storage/get", json={"key": "k1"}).json()["value"] == [1, 2]

    # Privileged endpoints MUST be denied before approval
    assert client.post("/api/plugins/hermifacts/bridge/full-demo/llm/complete", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 403
    assert client.post("/api/plugins/hermifacts/bridge/full-demo/notify", json={"title": "t", "body": "b"}).status_code == 403
    assert client.post("/api/plugins/hermifacts/bridge/full-demo/tools/call", json={"name": "web_search", "args": {}}).status_code == 403
    assert client.post("/api/plugins/hermifacts/bridge/full-demo/fs/list", json={"path": ""}).status_code == 403

    # Stale hash approval returns 409
    assert client.post("/api/plugins/hermifacts/apps/full-demo/approve", json={"tier": "full", "expected_hash": "wrong"}).status_code == 409

    # Approve exact code hash
    ap = client.post(
        "/api/plugins/hermifacts/apps/full-demo/approve",
        json={
            "tier": "full",
            "caps": ["llm", "notify", "tools", "fs"],
            "tools": ["web_search"],
            "fs_root": str(work_dir),
            "expected_hash": code_hash,
        },
    )
    assert ap.status_code == 200
    assert ap.json()["app"]["effective_tier"] == "full"

    # LLM complete & structured succeed
    lc = client.post("/api/plugins/hermifacts/bridge/full-demo/llm/complete", json={"messages": [{"role": "user", "content": "hi"}]})
    assert lc.status_code == 200
    assert lc.json()["text"] == "AI response ok"

    ls = client.post(
        "/api/plugins/hermifacts/bridge/full-demo/llm/structured",
        json={"instructions": "summarize", "input": "hello", "json_schema": {"type": "object"}},
    )
    assert ls.status_code == 200
    assert ls.json()["parsed"]["score"] == 99

    # Allowlisted tool succeeds, non-allowlisted tool denied
    t_ok = client.post("/api/plugins/hermifacts/bridge/full-demo/tools/call", json={"name": "web_search", "args": {"q": "hermes"}})
    assert t_ok.status_code == 200
    assert t_ok.json()["result"]["echo_tool"] == "web_search"
    t_no = client.post("/api/plugins/hermifacts/bridge/full-demo/tools/call", json={"name": "terminal", "args": {}})
    assert t_no.status_code == 403

    # Notify succeeds
    nf = client.post("/api/plugins/hermifacts/bridge/full-demo/notify", json={"title": "Done", "body": "All good"})
    assert nf.status_code == 200
    assert nf.json()["ok"] is True

    # Scoped FS works inside root and blocks path traversal
    fw = client.post("/api/plugins/hermifacts/bridge/full-demo/fs/write", json={"path": "notes/a.txt", "content": "hello fs"})
    assert fw.status_code == 200
    fr = client.post("/api/plugins/hermifacts/bridge/full-demo/fs/read", json={"path": "notes/a.txt"})
    assert fr.status_code == 200 and fr.json()["content"] == "hello fs"
    fl = client.post("/api/plugins/hermifacts/bridge/full-demo/fs/list", json={"path": "notes"})
    assert fl.status_code == 200 and fl.json()["entries"][0]["name"] == "a.txt"
    fe = client.post("/api/plugins/hermifacts/bridge/full-demo/fs/read", json={"path": "../../etc/passwd"})
    assert fe.status_code == 403

    # Export -> Import via share_url
    ex = client.get("/api/plugins/hermifacts/apps/full-demo/export")
    assert ex.status_code == 200
    ex_data = ex.json()
    assert ex_data["share_token"].startswith("hf1.")
    im = client.post("/api/plugins/hermifacts/apps/import", json={"share_url": ex_data["share_url"], "app_id": "imported-demo"})
    assert im.status_code == 200
    assert im.json()["app"]["effective_tier"] == "sandbox"

    # Standalone PWA endpoints
    assert client.get("/api/plugins/hermifacts/pwa/full-demo/").status_code == 200
    mf = client.get("/api/plugins/hermifacts/pwa/full-demo/manifest.webmanifest")
    assert mf.status_code == 200 and "manifest+json" in mf.headers["content-type"]
    sw = client.get("/api/plugins/hermifacts/pwa/full-demo/sw.js")
    assert sw.status_code == 200 and "javascript" in sw.headers["content-type"]
    svg = client.get("/api/plugins/hermifacts/pwa/full-demo/icon.svg")
    assert svg.status_code == 200 and "svg+xml" in svg.headers["content-type"]
    png = client.get("/api/plugins/hermifacts/pwa/full-demo/icon-192.png")
    assert png.status_code == 200 and png.content.startswith(b"\x89PNG\r\n\x1a\n")

    # Render-doc endpoint
    rd = client.get("/api/plugins/hermifacts/apps/full-demo/render-doc")
    assert rd.status_code == 200 and "window.hermesApp" in rd.json()["html"]

    # Creating an app via use_starter_template populates backend starter HTML & inputs
    tpl = client.post(
        "/api/plugins/hermifacts/apps",
        json={
            "name": "Starter Template Check",
            "use_starter_template": True,
            "requested_tier": "app",
            "requested_caps": ["llm"],
        },
    )
    assert tpl.status_code == 200
    tpl_app = tpl.json()["app"]
    assert "window.hermesApp.llm.complete" in tpl_app["html"]
    assert len(tpl_app["inputs"]) >= 2
