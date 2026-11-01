# School Library Control Panel

A small Windows desktop launcher written in Python 3.10+ and the standard-library `tkinter` package. It starts and monitors the local Express API and Vite frontend. The API connects to the hosted Supabase PostgreSQL database.

## Launch

Double-click **Start Library Control Panel.bat** in the project root, or run:

```powershell
py -3 control_panel\main.py
```

The panel reads only `PORT` from `backend/.env`. It never displays or logs the PostgreSQL connection string, database password, or session signing secret. Configure `DATABASE_URL` and TLS settings in `backend/.env` before starting the API.

## Buttons and status

- **Start All** starts the API, waits for `/api/health` to confirm its Supabase connection, starts the frontend, and opens the site automatically by default.
- **Start API** and **Start Frontend** start each app independently. Starting the frontend also opens the browser when automatic opening is enabled.
- **Stop Apps** stops the API and frontend processes started by this panel, including child processes.
- **Open Web** starts the frontend if it is stopped, waits until it responds, then opens it in the default browser.
- **Automatically open frontend after startup** controls browser opening after Start All or Start Frontend.

The database status card reflects the API health check. The panel does not manage a local database service. Start All reports if `DATABASE_URL` is missing, blank, or contains an HTTPS API URL instead of a PostgreSQL URI.
