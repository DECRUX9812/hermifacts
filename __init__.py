"""Hermifacts plugin entrypoint — registers tools and /hermifacts slash command."""

from __future__ import annotations

from typing import Any

from .hermifacts import runtime, tools


def register(ctx: Any) -> None:
    runtime.bind(ctx)

    ctx.register_tool(
        name="hermifact_create",
        toolset=runtime.TOOLSET,
        schema={
            "name": "hermifact_create",
            "description": (
                "Create or update an installable Hermifact (standalone AI app / reactive workflow artifact). "
                "Apps can call window.hermesApp.llm, window.hermesApp.storage, window.hermesApp.notify, "
                "window.hermesApp.tools, and react to typed inputs via window.hermesApp.onParamsChange."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Display name of the app"},
                    "app_id": {"type": "string", "description": "Optional URL slug (auto-generated from name if omitted)"},
                    "description": {"type": "string", "description": "Short description of what the app does"},
                    "icon": {"type": "string", "description": "Emoji or 1-2 char glyph for the app icon"},
                    "accent": {"type": "string", "description": "Hex accent color (e.g. #6366f1)"},
                    "category": {"type": "string", "description": "Category (workflow, ai-tool, productivity, utility, dashboard)"},
                    "html": {"type": "string", "description": "Full self-contained HTML/CSS/JS of the app"},
                    "file_path": {"type": "string", "description": "Alternative to html: path to an existing local HTML file to promote into an app"},
                    "inputs": {
                        "type": "array",
                        "description": "Optional reactive workflow input controls rendered in the app header (each: {id, label, type: select|range|number|toggle|text, default, options?, min?, max?, step?})",
                        "items": {"type": "object"},
                    },
                    "requested_tier": {"type": "string", "enum": ["sandbox", "app", "full"], "description": "Permission tier requested by the app"},
                    "requested_caps": {"type": "array", "items": {"type": "string"}, "description": "Capabilities requested: llm, notify, tools, window, fs"},
                    "requested_tools": {"type": "array", "items": {"type": "string"}, "description": "Hermes tool names requested if 'tools' capability is needed"},
                    "requested_fs_root": {"type": "string", "description": "Directory path requested if Tier 3 'fs' capability is needed"},
                },
                "required": ["name"],
            },
        },
        handler=tools.handle_create,
    )

    ctx.register_tool(
        name="hermifact_list",
        toolset=runtime.TOOLSET,
        schema={
            "name": "hermifact_list",
            "description": "List all Hermifacts with their permission tier, hash-approval status, and PWA URLs.",
            "parameters": {"type": "object", "properties": {}},
        },
        handler=tools.handle_list,
    )

    ctx.register_tool(
        name="hermifact_get",
        toolset=runtime.TOOLSET,
        schema={
            "name": "hermifact_get",
            "description": "Get metadata (and optionally HTML source) for one Hermifact.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_id": {"type": "string"},
                    "include_html": {"type": "boolean", "default": False},
                },
                "required": ["app_id"],
            },
        },
        handler=tools.handle_get,
    )

    ctx.register_tool(
        name="hermifact_install",
        toolset=runtime.TOOLSET,
        schema={
            "name": "hermifact_install",
            "description": "Generate and install a native OS desktop launcher (.desktop on Linux, .app on macOS, .cmd on Windows) for a Hermifact.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_id": {"type": "string"},
                    "origin": {"type": "string", "description": "Optional Hermes gateway/webapp origin URL (defaults to config public_origin or http://127.0.0.1:9120)"},
                },
                "required": ["app_id"],
            },
        },
        handler=tools.handle_install,
    )

    ctx.register_tool(
        name="hermifact_delete",
        toolset=runtime.TOOLSET,
        schema={
            "name": "hermifact_delete",
            "description": "Delete a Hermifact and remove its OS desktop launcher if installed.",
            "parameters": {
                "type": "object",
                "properties": {"app_id": {"type": "string"}},
                "required": ["app_id"],
            },
        },
        handler=tools.handle_delete,
    )

    ctx.register_tool(
        name="hermifact_export",
        toolset=runtime.TOOLSET,
        schema={
            "name": "hermifact_export",
            "description": "Export a portable, zero-secret .hermifact.json bundle and compressed hf1. shareable link for another Hermes user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_id": {"type": "string"},
                    "output_path": {"type": "string", "description": "Optional path to save the .hermifact.json file"},
                },
                "required": ["app_id"],
            },
        },
        handler=tools.handle_export,
    )

    ctx.register_tool(
        name="hermifact_import",
        toolset=runtime.TOOLSET,
        schema={
            "name": "hermifact_import",
            "description": "Import a portable .hermifact.json bundle or hf1. shareable link (always lands in sandbox until user reviews & approves requested permissions).",
            "parameters": {
                "type": "object",
                "properties": {
                    "share_link": {"type": "string", "description": "Shareable hf1.<token> string or /hermifacts?import=hf1.<token> URL"},
                    "bundle": {"type": "object", "description": "Parsed bundle JSON object"},
                    "file_path": {"type": "string", "description": "Path to a .hermifact.json file"},
                    "app_id": {"type": "string", "description": "Optional custom slug override"},
                },
            },
        },
        handler=tools.handle_import,
    )

    if hasattr(ctx, "register_command"):
        ctx.register_command(
            name="hermifacts",
            handler=tools.handle_slash_command,
            description="List and manage installed Hermifacts AI apps.",
            args_hint="[list]",
        )
