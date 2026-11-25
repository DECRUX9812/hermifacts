"""Shared runtime bridge between the agent plugin registration and FastAPI dashboard routes.

Hermes loads the agent plugin under ``hermes_plugins.<key>`` while ``dashboard/plugin_api.py``
may import ``hermifacts.runtime`` under its own module name. Storing the live PluginContext
in a fixed ``sys.modules`` holder guarantees both sides share the same bound context.
"""

from __future__ import annotations

import json
import logging
import sys
import types
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

PLUGIN_ID = "hermifacts"
TOOLSET = "hermifacts"

_SHARED_MODULE = "_hermifacts_shared_state"
_CTX_KEY = "ctx"
_ctx: Any = None


def _shared() -> dict[str, Any]:
    holder = sys.modules.get(_SHARED_MODULE)
    if holder is None:
        holder = types.ModuleType(_SHARED_MODULE)
        holder.state = {}  # type: ignore[attr-defined]
        sys.modules[_SHARED_MODULE] = holder
    return holder.state  # type: ignore[attr-defined]


def bind(ctx: Any) -> None:
    global _ctx
    _ctx = ctx
    _shared()[_CTX_KEY] = ctx


def ctx_or_none() -> Any:
    bound = _ctx or _shared().get(_CTX_KEY)
    if bound is not None:
        return bound
    for name, module in list(sys.modules.items()):
        if not name.endswith("hermifacts.runtime") or module is None:
            continue
        other = getattr(module, "_ctx", None)
        if other is not None:
            _shared()[_CTX_KEY] = other
            return other
    return None


def ctx() -> Any:
    bound = ctx_or_none()
    if bound is None:
        raise RuntimeError("hermifacts agent plugin is not registered in this process")
    return bound


def get_config(key: str, default: Any = None) -> Any:
    bound = ctx_or_none()
    if bound is None:
        return default
    try:
        val = bound.get_config(key, default=default)
        return default if val in (None, "") else val
    except Exception:
        return default


def data_dir() -> Path:
    """Return the persistent plugin data directory using Hermes' published storage API."""
    try:
        from plugins.plugin_storage import plugin_data_dir
        path = Path(plugin_data_dir(PLUGIN_ID))
        path.mkdir(parents=True, exist_ok=True)
        return path
    except Exception:
        try:
            from hermes_constants import get_hermes_home
            path = Path(get_hermes_home()) / "plugin-data" / PLUGIN_ID
        except Exception:
            path = Path.home() / ".hermes" / "plugin-data" / PLUGIN_ID
        path.mkdir(parents=True, exist_ok=True)
        return path


def llm() -> Any:
    """Return the host-bound PluginLlm handle (zero API keys exposed to apps)."""
    return ctx().llm


def model_ready() -> bool:
    bound = ctx_or_none()
    return bound is not None and getattr(bound, "llm", None) is not None


def dispatch_tool(tool_name: str, args: dict[str, Any]) -> Any:
    """Dispatch an allowlisted Hermes tool through the bound plugin context."""
    bound = ctx()
    if hasattr(bound, "dispatch_tool"):
        raw = bound.dispatch_tool(tool_name, args)
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except Exception:
                return {"text": raw}
        return raw
    from tools.registry import registry
    raw = registry.dispatch(tool_name, args)
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {"text": raw}
    return raw


def list_available_tools() -> list[str]:
    """Return currently registered Hermes tool names (for allowlist picker)."""
    try:
        from tools.registry import registry
        names = []
        if hasattr(registry, "list_tools"):
            names = list(registry.list_tools())
        elif hasattr(registry, "_tools"):
            names = list(registry._tools.keys())
        return sorted(n for n in names if isinstance(n, str) and not n.startswith("hermifact_"))
    except Exception:
        return []
