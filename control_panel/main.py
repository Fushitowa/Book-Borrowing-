"""Windows control panel for the School Library project.

Uses only Python's standard library. It starts the configured MySQL Windows
service, then the Express API, then the Vite frontend, and collects their logs.
"""

from __future__ import annotations

import ctypes
import json
import os
import queue
import shutil
import socket
import subprocess
import threading
import time
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from tkinter import messagebox, ttk
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
BACKEND_ENV = ROOT / "backend" / ".env"
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
APP_BG = "#0d1511"
PANEL = "#17231c"
PANEL_ALT = "#202e25"
BORDER = "#304337"
INK = "#e4ece5"
MUTED = "#9aa99e"
GREEN = "#82c394"
GREEN_DARK = "#28533a"
RED = "#ef8a7b"


def read_local_settings(path: Path) -> dict[str, str]:
    """Read only the simple KEY=value settings needed for local health checks."""
    settings: dict[str, str] = {}
    allowed = {"DB_HOST", "DB_PORT", "PORT"}
    if not path.exists():
        return settings
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in allowed:
            settings[key] = value.strip().strip('"').strip("'")
    return settings


class LibraryControlPanel:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Carbonell Library · Control Panel")
        self.root.geometry("980x700")
        self.root.minsize(820, 590)
        self.root.configure(bg=APP_BG)

        self.settings = read_local_settings(BACKEND_ENV)
        self.db_host = self.settings.get("DB_HOST", "127.0.0.1")
        self.db_port = self._number_setting("DB_PORT", 3306)
        self.api_port = self._number_setting("PORT", 3000)
        self.frontend_port = 5174
        self.local_http = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        self.events: queue.Queue[tuple[str, Any]] = queue.Queue()
        self.lock = threading.Lock()
        self.processes: dict[str, subprocess.Popen[str]] = {}
        self.services: list[dict[str, str]] = []
        self.service_names: dict[str, str] = {}
        self.selected_service = tk.StringVar(value="Detecting MySQL service…")
        self.status_vars = {
            "database": tk.StringVar(value="Checking"),
            "backend": tk.StringVar(value="Stopped"),
            "frontend": tk.StringVar(value="Stopped"),
        }
        self.detail_vars = {
            "database": tk.StringVar(value=f"{self.db_host}:{self.db_port}"),
            "backend": tk.StringVar(value=f"API · localhost:{self.api_port}"),
            "frontend": tk.StringVar(value=f"Web app · localhost:{self.frontend_port}"),
        }
        self.auto_open = tk.BooleanVar(value=True)
        self._build_ui()
        self._write_log("Control panel ready. Start All brings up the database, API, then frontend.")
        self._run_async("discover-services", self._discover_mysql_services)
        self.root.after(150, self._drain_events)
        self.root.after(1000, self._refresh_statuses)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _number_setting(self, name: str, default: int) -> int:
        try:
            return int(self.settings.get(name, default))
        except (TypeError, ValueError):
            return default

    def _build_ui(self) -> None:
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TCombobox", padding=6, fieldbackground=PANEL_ALT, foreground=INK, background=PANEL_ALT, arrowcolor=GREEN)
        style.map("TCombobox", fieldbackground=[("readonly", PANEL_ALT)], foreground=[("readonly", INK)])
        style.configure("Treeview", rowheight=24, font=("Segoe UI", 9), background=PANEL, fieldbackground=PANEL, foreground=INK)

        header = tk.Frame(self.root, bg="#101d16", height=116, highlightbackground=BORDER, highlightthickness=1)
        header.pack(fill="x")
        header.pack_propagate(False)
        brand = tk.Frame(header, bg="#101d16")
        brand.pack(fill="x", padx=28, pady=(22, 16))
        mark_path = ROOT / "frontend" / "public" / "carbonell-library-mark.png"
        try:
            self.brand_image = tk.PhotoImage(file=str(mark_path)).subsample(8, 8)
            tk.Label(brand, image=self.brand_image, bg="#101d16", bd=0, width=42, height=42).pack(side="left")
        except tk.TclError:
            self.brand_image = None
            tk.Label(brand, text="C", bg="#263c2e", fg=GREEN, font=("Georgia", 20, "bold"), width=2, height=1).pack(side="left")
        title_block = tk.Frame(brand, bg="#101d16")
        title_block.pack(side="left", padx=12)
        tk.Label(title_block, text="Carbonell Library", bg="#101d16", fg="#f0f5ef", font=("Segoe UI Semibold", 16)).pack(anchor="w")
        tk.Label(title_block, text="LOCAL DEVELOPMENT CONTROL PANEL", bg="#101d16", fg="#91aa98", font=("Segoe UI", 8, "bold")).pack(anchor="w", pady=(3, 0))
        self.overall_label = tk.Label(brand, text="READY", bg="#253a2b", fg="#c9e8d0", font=("Segoe UI", 8, "bold"), padx=12, pady=7)
        self.overall_label.pack(side="right", pady=6)

        main = tk.Frame(self.root, bg=APP_BG)
        main.pack(fill="both", expand=True, padx=24, pady=19)

        row = tk.Frame(main, bg=APP_BG)
        row.pack(fill="x")
        tk.Label(row, text="Services", bg=APP_BG, fg=INK, font=("Segoe UI Semibold", 14)).pack(side="left")
        tk.Label(row, text="Start and monitor each project service from one place.", bg=APP_BG, fg=MUTED, font=("Segoe UI", 9)).pack(side="left", padx=12, pady=(3, 0))

        cards = tk.Frame(main, bg=APP_BG)
        cards.pack(fill="x", pady=(13, 16))
        self.card_status_labels: dict[str, tk.Label] = {}
        cards_data = [
            ("database", "01  DATABASE", "MySQL / MariaDB"),
            ("backend", "02  BACKEND API", "Express + TypeScript"),
            ("frontend", "03  FRONTEND", "React + Vite"),
        ]
        for key, heading, description in cards_data:
            card = tk.Frame(cards, bg=PANEL, highlightbackground=BORDER, highlightthickness=1, padx=15, pady=14)
            card.pack(side="left", fill="both", expand=True, padx=(0, 10) if key != "frontend" else (0, 0))
            tk.Label(card, text=heading, bg=PANEL, fg="#8fa294", font=("Segoe UI", 8, "bold")).pack(anchor="w")
            tk.Label(card, text=description, bg=PANEL, fg=INK, font=("Segoe UI Semibold", 11)).pack(anchor="w", pady=(8, 3))
            self.card_status_labels[key] = tk.Label(card, textvariable=self.status_vars[key], bg=PANEL, fg=MUTED, font=("Segoe UI Semibold", 10))
            self.card_status_labels[key].pack(anchor="w")
            tk.Label(card, textvariable=self.detail_vars[key], bg=PANEL, fg="#8b9c90", font=("Segoe UI", 8)).pack(anchor="w", pady=(7, 0))

        db_row = tk.Frame(main, bg=PANEL, highlightbackground=BORDER, highlightthickness=1, padx=14, pady=12)
        db_row.pack(fill="x", pady=(0, 13))
        tk.Label(db_row, text="MySQL Windows service", bg=PANEL, fg=INK, font=("Segoe UI Semibold", 9)).pack(side="left")
        self.service_combo = ttk.Combobox(db_row, textvariable=self.selected_service, state="readonly", width=37)
        self.service_combo.pack(side="left", padx=12)
        tk.Label(db_row, text="Windows may ask for administrator approval to start MySQL.", bg=PANEL, fg=MUTED, font=("Segoe UI", 8)).pack(side="left", padx=4)

        controls = tk.Frame(main, bg=APP_BG)
        controls.pack(fill="x", pady=(0, 12))
        self._button(controls, "Start All", self.start_all, primary=True).pack(side="left", padx=(0, 8))
        self._button(controls, "Open Web", self.open_web, accent=True).pack(side="left", padx=(0, 8))
        self._button(controls, "Start Database", self.start_database).pack(side="left", padx=(0, 8))
        self._button(controls, "Start API", lambda: self._run_async("start-backend", self._ensure_backend)).pack(side="left", padx=(0, 8))
        self._button(controls, "Start Frontend", self.start_frontend).pack(side="left", padx=(0, 8))
        self._button(controls, "Stop Apps", self.stop_apps).pack(side="right")
        self._button(controls, "Stop Database", self.stop_database).pack(side="right", padx=(0, 8))

        bottom_row = tk.Frame(main, bg=APP_BG)
        bottom_row.pack(fill="x", pady=(0, 7))
        tk.Label(bottom_row, text="Activity", bg=APP_BG, fg=INK, font=("Segoe UI Semibold", 12)).pack(side="left")
        tk.Checkbutton(bottom_row, text="Automatically open frontend after startup", variable=self.auto_open, bg=APP_BG, fg=MUTED, activebackground=APP_BG, activeforeground=INK, font=("Segoe UI", 8), selectcolor=PANEL_ALT).pack(side="right")

        log_frame = tk.Frame(main, bg=PANEL, highlightbackground=BORDER, highlightthickness=1)
        log_frame.pack(fill="both", expand=True)
        self.log = tk.Text(log_frame, height=12, wrap="word", bg="#111a15", fg="#cbd8cd", insertbackground=INK, relief="flat", padx=12, pady=10, font=("Consolas", 9), state="disabled")
        scrollbar = ttk.Scrollbar(log_frame, orient="vertical", command=self.log.yview)
        self.log.configure(yscrollcommand=scrollbar.set)
        self.log.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.log.tag_configure("error", foreground=RED)
        self.log.tag_configure("success", foreground=GREEN)
        self.log.tag_configure("muted", foreground="#829389")

        footer = tk.Frame(main, bg=APP_BG)
        footer.pack(fill="x", pady=(9, 0))
        tk.Label(footer, text="PROJECT ROOT", bg=APP_BG, fg="#84958a", font=("Segoe UI", 8, "bold")).pack(side="left")
        tk.Label(footer, text=str(ROOT), bg=APP_BG, fg="#a8b6ac", font=("Segoe UI", 8)).pack(side="left", padx=7)

    def _button(self, parent: tk.Widget, label: str, command: Any, primary: bool = False, accent: bool = False, compact: bool = False) -> tk.Button:
        bg = GREEN_DARK if primary else PANEL_ALT if accent else PANEL
        fg = "#f0f7f1" if primary else GREEN if accent else INK
        return tk.Button(
            parent,
            text=label,
            command=command,
            bg=bg,
            fg=fg,
            activebackground="#376b49" if primary else "#2b4032",
            activeforeground="#ffffff" if primary else GREEN,
            relief="flat",
            bd=0,
            padx=13 if not compact else 10,
            pady=8 if not compact else 5,
            font=("Segoe UI Semibold", 9 if not compact else 8),
            cursor="hand2",
            highlightthickness=1,
            highlightbackground=GREEN if primary or accent else BORDER,
        )

    def _write_log(self, message: str, tag: str = "") -> None:
        timestamp = time.strftime("%H:%M:%S")
        self.log.configure(state="normal")
        self.log.insert("end", f"{timestamp}  {message}\n", tag)
        self.log.see("end")
        self.log.configure(state="disabled")

    def _post_log(self, message: str, tag: str = "") -> None:
        self.events.put(("log", (message, tag)))

    def _run_async(self, name: str, target: Any) -> None:
        threading.Thread(target=self._task_wrapper, args=(name, target), daemon=True).start()

    def _task_wrapper(self, name: str, target: Any) -> None:
        self.events.put(("busy", True))
        try:
            target()
        except Exception as exc:  # Surface worker failures in the activity log.
            self._post_log(f"{name}: {exc}", "error")
        finally:
            self.events.put(("busy", False))

    def _drain_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "log":
                    self._write_log(payload[0], payload[1])
                elif kind == "services":
                    self._set_services(payload)
                elif kind == "busy":
                    self.overall_label.configure(text="WORKING" if payload else "READY", bg="#394331" if payload else "#253a2b")
                elif kind == "status":
                    key, value = payload
                    self.status_vars[key].set(value)
                    color = GREEN if value.lower() in ("running", "connected", "ready") else RED if value.lower() in ("error", "stopped", "disconnected") else MUTED
                    self.card_status_labels[key].configure(fg=color)
                elif kind == "open-url":
                    webbrowser.open(payload)
        except queue.Empty:
            pass
        self.root.after(150, self._drain_events)

    def _discover_mysql_services(self) -> None:
        script = (
            "$items = @(Get-CimInstance Win32_Service | Where-Object { "
            "$_.PathName -match 'mysqld[.]exe' -or $_.Name -match 'mysql|maria' -or $_.DisplayName -match 'mysql|maria' "
            "} | Select-Object Name,DisplayName,State); "
            "ConvertTo-Json -InputObject $items -Compress"
        )
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=CREATE_NO_WINDOW,
        )
        if result.returncode != 0:
            raise RuntimeError("Could not inspect Windows services. Select the MySQL service name manually in the control panel output.")
        payload = result.stdout.strip()
        services = json.loads(payload) if payload else []
        if isinstance(services, dict):
            services = [services]
        self.events.put(("services", services))

    def _set_services(self, services: list[dict[str, Any]]) -> None:
        self.services = [{key: str(value) for key, value in service.items()} for service in services if service.get("Name")]
        self.service_names.clear()
        values: list[str] = []
        for service in self.services:
            display = service.get("DisplayName", service["Name"])
            name = service["Name"]
            label = f"{display}  ({name})"
            values.append(label)
            self.service_names[label] = name
        self.service_combo["values"] = values
        if values:
            running = next((service for service in self.services if service.get("State") == "Running"), self.services[0])
            chosen = f"{running.get('DisplayName', running['Name'])}  ({running['Name']})"
            self.selected_service.set(chosen)
            self._post_log(f"Detected MySQL service: {running.get('DisplayName', running['Name'])} ({running['Name']}).", "success")
        else:
            self.selected_service.set("No MySQL Windows service detected")
            self._post_log("No MySQL service was detected. Start it from Windows Services or check the MySQL installation.", "error")

    def _service_state(self, service_name: str) -> str:
        result = subprocess.run(
            ["sc.exe", "query", service_name],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=CREATE_NO_WINDOW,
        )
        output = (result.stdout or "") + (result.stderr or "")
        if "RUNNING" in output:
            return "RUNNING"
        if "STOPPED" in output:
            return "STOPPED"
        if "START_PENDING" in output or "STOP_PENDING" in output:
            return "PENDING"
        return "UNKNOWN"

    def _start_windows_service(self, service_name: str) -> None:
        state = self._service_state(service_name)
        if state == "RUNNING":
            self._post_log(f"Database service {service_name} is already running.", "success")
            return
        self._post_log(f"Starting database service {service_name}…")
        result = subprocess.run(
            ["sc.exe", "start", service_name],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=CREATE_NO_WINDOW,
        )
        output = (result.stdout or "") + (result.stderr or "")
        if result.returncode != 0 and "1056" not in output:
            # Starting a Windows service may need elevation. Ask Windows to show
            # its normal UAC consent dialog rather than requiring an admin panel.
            shell = ctypes.windll.shell32.ShellExecuteW(None, "runas", "sc.exe", f"start {service_name}", None, 0)
            if shell <= 32:
                raise RuntimeError("Windows did not start the database service. Approve the UAC prompt or start the service in Windows Services.")
            self._post_log("Windows requested administrator approval. Approve the UAC prompt to continue.")
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if self._service_state(service_name) == "RUNNING":
                self._post_log("MySQL service is running. Waiting for the database port…", "success")
                return
            time.sleep(1)
        raise RuntimeError(f"MySQL service {service_name} did not reach RUNNING state within 60 seconds. {output.strip()}")

    def _stop_windows_service(self, service_name: str) -> None:
        if self._service_state(service_name) == "STOPPED":
            self._post_log("Database service is already stopped.")
            return
        result = subprocess.run(
            ["sc.exe", "stop", service_name],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=CREATE_NO_WINDOW,
        )
        output = (result.stdout or "") + (result.stderr or "")
        if result.returncode != 0:
            shell = ctypes.windll.shell32.ShellExecuteW(None, "runas", "sc.exe", f"stop {service_name}", None, 0)
            if shell <= 32:
                raise RuntimeError("Windows could not stop the database service. Approve the UAC prompt or stop it in Windows Services.")
        self._post_log(f"Stop requested for database service {service_name}.")

    def _tcp_ready(self, host: str, port: int, timeout: float = 1.0) -> bool:
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except OSError:
            return False

    def _wait_for_database(self, timeout: int = 60) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self._tcp_ready(self.db_host, self.db_port):
                self.events.put(("status", ("database", "Connected")))
                self._post_log(f"Database is accepting connections on {self.db_host}:{self.db_port}.", "success")
                return
            time.sleep(1)
        raise RuntimeError(f"No database accepted a connection on {self.db_host}:{self.db_port}. Check backend/.env and the MySQL service port.")

    def _ensure_database(self, service_name: str | None = None) -> None:
        if self._tcp_ready(self.db_host, self.db_port):
            self.events.put(("status", ("database", "Connected")))
            self._post_log(f"Database already responds on {self.db_host}:{self.db_port}.", "success")
            return
        if not service_name:
            raise RuntimeError("Select a detected MySQL service first.")
        self._start_windows_service(service_name)
        self._wait_for_database()

    def start_database(self) -> None:
        service_name = self.service_names.get(self.selected_service.get())
        if not service_name and not self._tcp_ready(self.db_host, self.db_port):
            messagebox.showerror("MySQL service not selected", "Wait for service detection or start the MySQL service from Windows Services.")
            return
        self._run_async("start-database", lambda: self._ensure_database(service_name))

    def _health_ok(self) -> bool:
        url = f"http://127.0.0.1:{self.api_port}/api/health"
        try:
            with self.local_http.open(url, timeout=2) as response:
                data = json.loads(response.read().decode("utf-8"))
                return response.status == 200 and data.get("status") == "ok" and data.get("database") == "connected"
        except (OSError, urllib.error.URLError, json.JSONDecodeError, TimeoutError):
            return False

    def _url_ready(self, url: str, timeout: int = 35, content_markers: tuple[bytes, ...] = ()) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                with self.local_http.open(url, timeout=1.5) as response:
                    if 200 <= response.status < 400:
                        if not content_markers:
                            return True
                        body = response.read(64 * 1024)
                        if all(marker in body for marker in content_markers):
                            return True
            except (OSError, urllib.error.URLError, TimeoutError):
                pass
            time.sleep(1)
        return False

    def _start_process(self, key: str, command: str, ready_url: str, ready_label: str, startup_timeout: int = 35, content_markers: tuple[bytes, ...] = ()) -> None:
        with self.lock:
            existing = self.processes.get(key)
        if existing and existing.poll() is None:
            self._post_log(f"{ready_label} process is already running; checking its web address…")
            if self._url_ready(ready_url, timeout=startup_timeout, content_markers=content_markers):
                self.events.put(("status", (key, "Running")))
                return
            raise RuntimeError(f"{ready_label} process exists but did not respond at {ready_url}. Check its output, then use Stop Apps and retry.")

        if self._url_ready(ready_url, timeout=2, content_markers=content_markers):
            self._post_log(f"{ready_label} is already responding at {ready_url}.", "success")
            self.events.put(("status", (key, "Running")))
            return

        if not shutil.which("npm.cmd") and not shutil.which("npm"):
            raise RuntimeError("npm was not found. Install Node.js, then reopen the control panel.")
        self._post_log(f"Starting {ready_label}…")
        process = subprocess.Popen(
            ["cmd.exe", "/d", "/s", "/c", command],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=CREATE_NO_WINDOW,
        )
        with self.lock:
            self.processes[key] = process
        threading.Thread(target=self._read_process_output, args=(key, process), daemon=True).start()
        if not self._url_ready(ready_url, timeout=startup_timeout, content_markers=content_markers):
            if process.poll() is not None:
                raise RuntimeError(f"{ready_label} exited before becoming ready. Review the activity log.")
            subprocess.run(
                ["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                text=True,
                timeout=15,
                creationflags=CREATE_NO_WINDOW,
            )
            raise RuntimeError(f"{ready_label} did not respond within {startup_timeout} seconds. Review the activity log.")
        self.events.put(("status", (key, "Running")))
        self._post_log(f"{ready_label} is ready at {ready_url}.", "success")

    def _read_process_output(self, key: str, process: subprocess.Popen[str]) -> None:
        if process.stdout is not None:
            for line in process.stdout:
                clean = line.rstrip()
                if clean:
                    tag = "error" if any(word in clean.lower() for word in ("error", "failed", "cannot")) else "muted"
                    self._post_log(f"[{key}] {clean}", tag)
        code = process.wait()
        self._post_log(f"[{key}] process exited with code {code}.", "error" if code else "muted")
        self.events.put(("status", (key, "Stopped")))

    def _ensure_backend(self) -> None:
        if not self._tcp_ready(self.db_host, self.db_port):
            raise RuntimeError("Start the database first, or use Start All.")
        self._start_process("backend", "npm run dev:backend", f"http://127.0.0.1:{self.api_port}/api/health", "Backend API", startup_timeout=90)

    def _ensure_frontend(self) -> None:
        url = f"http://127.0.0.1:{self.frontend_port}"
        markers = (b"<title>Carbonell Library", b"/src/main.tsx")
        if self._tcp_ready("127.0.0.1", self.frontend_port) and not self._url_ready(url, timeout=2, content_markers=markers):
            raise RuntimeError(f"Port {self.frontend_port} is already serving a different app. Close that app's development server, then start the Carbonell frontend again.")
        self._start_process("frontend", "npm run dev:frontend", url, "Frontend", content_markers=markers)

    def start_frontend(self) -> None:
        open_after_start = self.auto_open.get()

        def start_frontend_sequence() -> None:
            self._ensure_frontend()
            if open_after_start:
                self.events.put(("open-url", f"http://127.0.0.1:{self.frontend_port}"))

        self._run_async("start-frontend", start_frontend_sequence)

    def start_all(self) -> None:
        open_after_start = self.auto_open.get()
        service_name = self.service_names.get(self.selected_service.get())

        def start_sequence() -> None:
            database_ready = False
            backend_ready = False
            frontend_ready = False
            try:
                self._ensure_database(service_name)
                database_ready = True
            except Exception as exc:
                self._post_log(f"Database startup failed: {exc}", "error")
            if database_ready:
                try:
                    self._ensure_backend()
                    backend_ready = True
                except Exception as exc:
                    self._post_log(f"Backend startup failed: {exc}", "error")
            else:
                self._post_log("Skipping API startup until the database is available.", "error")
            try:
                self._ensure_frontend()
                frontend_ready = True
            except Exception as exc:
                self._post_log(f"Frontend startup failed: {exc}", "error")
            if database_ready and backend_ready and frontend_ready:
                self._post_log("All project services are ready.", "success")
            elif frontend_ready:
                self._post_log("Frontend is ready. Review the earlier service errors for API or database status.", "success")
            if open_after_start and frontend_ready:
                self.events.put(("open-url", f"http://127.0.0.1:{self.frontend_port}"))
        self._run_async("start-all", start_sequence)

    def stop_apps(self) -> None:
        def stop_sequence() -> None:
            for key in ("frontend", "backend"):
                with self.lock:
                    process = self.processes.get(key)
                if not process or process.poll() is not None:
                    continue
                self._post_log(f"Stopping {key}…")
                result = subprocess.run(
                    ["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                    capture_output=True,
                    text=True,
                    timeout=15,
                    creationflags=CREATE_NO_WINDOW,
                )
                if result.returncode == 0:
                    self._post_log(f"Stopped {key} and its child processes.", "success")
                else:
                    self._post_log(f"Could not stop {key}: {(result.stderr or result.stdout).strip()}", "error")
                self.events.put(("status", (key, "Stopped")))
        self._run_async("stop-apps", stop_sequence)

    def _stop_database(self, service_name: str) -> None:
        self._stop_windows_service(service_name)
        self.events.put(("status", ("database", "Stopped")))

    def stop_database(self) -> None:
        service_name = self.service_names.get(self.selected_service.get())
        if not service_name:
            messagebox.showerror("MySQL service not selected", "Wait for service detection before stopping MySQL.")
            return
        if messagebox.askyesno("Stop MySQL service?", "This stops the selected Windows database service. Any other apps using it will lose their connection."):
            self._run_async("stop-database", lambda: self._stop_database(service_name))

    def open_web(self) -> None:
        def open_web_sequence() -> None:
            self._ensure_frontend()
            self.events.put(("open-url", f"http://127.0.0.1:{self.frontend_port}"))

        self._run_async("open-web", open_web_sequence)

    def _refresh_statuses(self) -> None:
        threading.Thread(target=self._probe_statuses, daemon=True).start()
        self.root.after(2500, self._refresh_statuses)

    def _probe_statuses(self) -> None:
        if self._tcp_ready(self.db_host, self.db_port):
            self.events.put(("status", ("database", "Connected")))
        else:
            self.events.put(("status", ("database", "Stopped")))
        if self._health_ok():
            self.events.put(("status", ("backend", "Running")))
        else:
            self.events.put(("status", ("backend", "Stopped")))
        if self._url_ready(
            f"http://127.0.0.1:{self.frontend_port}",
            timeout=2,
            content_markers=(b"<title>Carbonell Library", b"/src/main.tsx"),
        ):
            self.events.put(("status", ("frontend", "Running")))
        else:
            self.events.put(("status", ("frontend", "Stopped")))

    def _on_close(self) -> None:
        running = [key for key, process in self.processes.items() if process.poll() is None]
        if running and messagebox.askyesno("Close control panel?", "The API or frontend is still running. Stop those app processes before closing?"):
            self.stop_apps()
            self.root.after(500, self.root.destroy)
            return
        self.root.destroy()


def main() -> None:
    if os.name != "nt":
        raise SystemExit("This control panel manages Windows services and is intended for Windows.")
    if not (ROOT / "package.json").exists() or not (ROOT / "backend" / "package.json").exists() or not (ROOT / "frontend" / "package.json").exists():
        raise SystemExit(f"Could not find the project workspaces next to this script: {ROOT}")
    app_root = tk.Tk()
    LibraryControlPanel(app_root)
    app_root.mainloop()


if __name__ == "__main__":
    main()
