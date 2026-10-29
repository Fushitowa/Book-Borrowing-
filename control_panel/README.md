# School Library Control Panel

A small Windows desktop panel written in Python 3.10+ using only the standard library (`tkinter`). Install Python with **Tcl/Tk** enabled. It starts and monitors the project's local MySQL service, Express API, and Vite frontend.

## Launch

Double-click **Start Library Control Panel.bat** in the project root, or run:

```powershell
py -3 control_panel\main.py
```

The panel reads only `DB_HOST`, `DB_PORT`, and `PORT` from `backend/.env` to determine local health-check addresses. It never displays or logs database passwords or the session signing secret.

## Buttons

- **Start All** starts the detected MySQL Windows service, waits for the configured database port, starts the backend and allows up to 90 seconds for `/api/health` to become ready (including first-run TypeScript compilation), then starts the frontend. It still tries to start the frontend if MySQL or the API fails, and reports each service's result. The browser opens automatically after the frontend is ready by default.
- **Start Database**, **Start API**, and **Start Frontend** start one service at a time. Start Frontend also opens the browser when automatic opening is enabled. The panel verifies the Carbonell page before opening it; if another project occupies port 5174, it reports the conflict instead of opening that project.
- **Stop Apps** stops the frontend and backend processes started by this panel, including their child processes.
- **Stop Database** requests that Windows stop the selected MySQL service.
- **Open Web** starts the frontend if it is stopped, waits until it responds, then opens the site in your default browser.
- **Automatically open frontend after startup** opens the site after Start All or Start Frontend completes. This is enabled by default.

Windows may show a User Account Control prompt when starting or stopping MySQL because Windows services can require administrator permission. Approve it to let the panel manage the service. The API and frontend run as normal user processes.

The panel discovers MySQL services from Windows service metadata and lets you choose the matching service. It checks the port from `backend/.env`, so the service and `DB_PORT` must refer to the same MySQL instance.
