"""Native OS desktop app launcher generator for Linux, macOS, and Windows.

Creates a real OS application entry (own icon + own chromeless app window via
Chrome/Chromium/Edge ``--app=<url>`` or system browser fallback) pointing at the
Hermifact's standalone PWA shell on the user's Hermes gateway.
"""

from __future__ import annotations

import os
import platform
import shlex
import shutil
import stat
from pathlib import Path
from typing import Any

from .pwa import render_icon_svg


def detect_chromium_binary() -> str | None:
    """Find a Chromium-family browser supporting ``--app=<url>`` standalone windows."""
    candidates = (
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "brave-browser",
        "microsoft-edge",
        "microsoft-edge-stable",
    )
    for name in candidates:
        found = shutil.which(name)
        if found:
            return found
    mac_paths = (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Arc.app/Contents/MacOS/Arc",
    )
    for p in mac_paths:
        if Path(p).exists():
            return p
    return None


def _safe_desktop_text(s: str) -> str:
    return " ".join(str(s or "").replace("\n", " ").replace("\r", " ").split())


def install_os_launcher(
    app: dict[str, Any],
    *,
    origin: str,
    data_root: Path,
    system_override: str | None = None,
    home_override: Path | None = None,
) -> dict[str, Any]:
    """Write a native OS desktop launcher + icon for *app* and return its metadata."""
    sys_name = (system_override or platform.system()).lower()
    home = Path(home_override) if home_override else Path.home()
    app_id = app["id"]
    name = _safe_desktop_text(app["name"])
    desc = _safe_desktop_text(app.get("description") or f"{name} — Hermifact AI App")
    pwa_url = f"{origin.rstrip('/')}{app['pwa_path']}"
    browser = detect_chromium_binary()

    icons_dir = data_root / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    svg_bytes = render_icon_svg(app["name"], app.get("icon", "✨"), app.get("accent", "#6366f1")).encode("utf-8")

    if sys_name == "linux":
        xdg_data = Path(os.environ.get("XDG_DATA_HOME") or (home / ".local" / "share"))
        apps_dir = xdg_data / "applications"
        icon_dir = xdg_data / "icons" / "hicolor" / "scalable" / "apps"
        apps_dir.mkdir(parents=True, exist_ok=True)
        icon_dir.mkdir(parents=True, exist_ok=True)

        icon_file = icon_dir / f"hermifact-{app_id}.svg"
        icon_file.write_bytes(svg_bytes)

        wm_class = f"Hermifact-{app_id}"
        if browser:
            exec_cmd = f"{shlex.quote(browser)} --app={shlex.quote(pwa_url)} --class={shlex.quote(wm_class)}"
        else:
            exec_cmd = f"xdg-open {shlex.quote(pwa_url)}"

        desktop_path = apps_dir / f"hermifact-{app_id}.desktop"
        desktop_body = (
            "[Desktop Entry]\n"
            "Version=1.0\n"
            "Type=Application\n"
            f"Name={name}\n"
            f"Comment={desc}\n"
            f"Exec={exec_cmd}\n"
            f"Icon={icon_file}\n"
            "Terminal=false\n"
            "Categories=Utility;Network;\n"
            f"StartupWMClass={wm_class}\n"
            "X-Hermes-Hermifact=true\n"
            f"X-Hermes-App-Id={app_id}\n"
        )
        desktop_path.write_text(desktop_body, encoding="utf-8")
        desktop_path.chmod(desktop_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        return {
            "platform": "linux",
            "launcher_path": str(desktop_path),
            "icon_path": str(icon_file),
            "pwa_url": pwa_url,
            "browser": browser or "xdg-open",
            "command": exec_cmd,
        }

    if sys_name == "darwin":
        apps_dir = home / "Applications" / "Hermifacts"
        bundle = apps_dir / f"{name}.app"
        macos_dir = bundle / "Contents" / "MacOS"
        res_dir = bundle / "Contents" / "Resources"
        macos_dir.mkdir(parents=True, exist_ok=True)
        res_dir.mkdir(parents=True, exist_ok=True)
        icon_file = res_dir / "icon.svg"
        icon_file.write_bytes(svg_bytes)

        launch_bin = macos_dir / "launch"
        if browser:
            cmd = f'exec {shlex.quote(browser)} --app={shlex.quote(pwa_url)}'
        else:
            cmd = f'exec open {shlex.quote(pwa_url)}'
        launch_bin.write_text(f"#!/usr/bin/env bash\nset -euo pipefail\n{cmd}\n", encoding="utf-8")
        launch_bin.chmod(0o755)
        plist = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
            '<plist version="1.0"><dict>\n'
            f'  <key>CFBundleName</key><string>{name}</string>\n'
            f'  <key>CFBundleIdentifier</key><string>ai.hermes.hermifact.{app_id}</string>\n'
            '  <key>CFBundleExecutable</key><string>launch</string>\n'
            '  <key>CFBundlePackageType</key><string>APPL</string>\n'
            '</dict></plist>\n'
        )
        (bundle / "Contents" / "Info.plist").write_text(plist, encoding="utf-8")
        return {
            "platform": "darwin",
            "launcher_path": str(bundle),
            "icon_path": str(icon_file),
            "pwa_url": pwa_url,
            "browser": browser or "open",
            "command": cmd,
        }

    # Windows (or generic fallback)
    win_dir = data_root / "launchers"
    win_dir.mkdir(parents=True, exist_ok=True)
    icon_file = icons_dir / f"hermifact-{app_id}.svg"
    icon_file.write_bytes(svg_bytes)
    cmd_path = win_dir / f"hermifact-{app_id}.cmd"
    cmd_body = (
        "@echo off\r\n"
        f'start "" msedge --app="{pwa_url}" || start "" chrome --app="{pwa_url}" || start "" "{pwa_url}"\r\n'
    )
    cmd_path.write_text(cmd_body, encoding="utf-8")
    return {
        "platform": sys_name,
        "launcher_path": str(cmd_path),
        "icon_path": str(icon_file),
        "pwa_url": pwa_url,
        "browser": browser or "start",
        "command": cmd_body.strip(),
    }


def remove_os_launcher(launcher_path: str) -> bool:
    if not launcher_path:
        return False
    p = Path(launcher_path)
    if not p.exists():
        return False
    try:
        if p.is_dir() and p.suffix == ".app":
            shutil.rmtree(p)
        else:
            p.unlink()
        return True
    except OSError:
        return False
