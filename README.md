# Carbonell School Library

![Carbonell Library emblem](frontend/public/carbonell-library-mark.png)

The original full logo artwork is available at [`frontend/public/carbonell-library-logo.jpg`](frontend/public/carbonell-library-logo.jpg).

A school library borrowing system built with React, TypeScript, Vite, Tailwind CSS, Express, and Supabase PostgreSQL. The catalog stores title records separately from individually barcoded copies. Circulation history is retained in PostgreSQL.

## Requirements

- Node.js 20 or newer and npm
- Python 3.10 or newer with Tkinter/Tcl-Tk for the desktop control panel
- A Supabase project with the schema from [`database/schema/school_library.sql`](database/schema/school_library.sql) applied
- The Supabase PostgreSQL connection string and local settings in `backend/.env`

The Express backend connects directly to Supabase PostgreSQL. Use the connection string shown by **Connect** in the Supabase dashboard. The session pooler is a suitable option when your network cannot reach the direct database endpoint over IPv6.

## First-time setup

From the repository root in PowerShell:

```powershell
npm install
```

The local `backend/.env` should contain `DATABASE_URL` with your Supabase PostgreSQL connection string, `DATABASE_SSL=enable`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, and `AUTH_TOKEN_SECRET` (a random value of at least 32 characters). Copy `backend/.env.example` only if `.env` does not exist. Never commit `.env` or expose database credentials in frontend code.

Before starting the app, open the Supabase dashboard's SQL Editor and run [`database/schema/school_library.sql`](database/schema/school_library.sql). It creates the library tables, indexes, constraints, default roles, and student borrowing policy. The Express database role needs access to the `public` schema.

### Account creation

The sign-in page's **Create account** link is for student accounts. Staff cannot self-register: an administrator creates librarian accounts under **User Management → Librarians**. The first administrator is provisioned locally with the secure setup command below.

Create the first administrator. The password prompt is hidden and the password is stored as a scrypt hash:

```powershell
npm run create-admin
```

Additional librarian accounts can also be created from the terminal with the same secure prompt:

```powershell
npm run create-librarian
```

## Run the application

For one-click local startup, double-click **Start Library Control Panel.bat** in the project root. The Python control panel starts the API, verifies its Supabase connection through the health check, starts the frontend, and can open the app automatically. See [`control_panel/README.md`](control_panel/README.md) for controls.

To start services manually, open two PowerShell windows in the project root. Start the API in the first:

```powershell
npm run dev:backend
```

Start Vite in the second:

```powershell
npm run dev:frontend
```

Open the Vite URL printed in the second terminal (normally `http://localhost:5174`). The API is available at `http://localhost:3000`; `/api/health` reports whether its Supabase database check passed. Vite proxies `/api` requests to Express.

## Deploy to Vercel

Import the repository root as the Vercel project. The Vercel configuration builds the frontend into `frontend/dist` and routes `/api` requests to the Express function in `api/index.ts`.

Before deploying, run [`database/schema/school_library.sql`](database/schema/school_library.sql) in the Supabase SQL Editor. In the Vercel project settings, add these server-side environment variables for the environments you deploy:

- `DATABASE_URL`: the Supabase PostgreSQL connection string
- `AUTH_TOKEN_SECRET`: a random secret with at least 32 characters
- `DATABASE_SSL_CA_PATH`: `backend/supabase-ca.crt`

The Supabase CA certificate at `backend/supabase-ca.crt` must be included in the repository so the Vercel function can verify the database certificate chain. Vercel sets `NODE_ENV` to production, and the database connection uses TLS by default. Keep `DATABASE_SSL_REJECT_UNAUTHORIZED` enabled (or unset); do not disable certificate verification. Never add database credentials or the session secret to frontend variables or commit them to the repository. Redeploy after changing environment variables. Once deployed, check `/api/health`; it should report `"database":"connected"` before testing student account creation.

## Current workflows

- HttpOnly signed-cookie sign-in and sign-out, with administrator, librarian, and student roles
- Public student account creation; only administrators can create librarian accounts, and administrator accounts are provisioned locally
- Staff can provision students and admins can deactivate/reactivate student accounts
- Catalog title search, normalized author/publisher/category links, and separate physical copy/barcode management
- Optional JPG, PNG, and WebP cover images on catalog titles, with upload previews and server-side type and size checks
- Staff dashboard metrics and recent circulation activity
- Student checkout with active-loan limits and database-backed duplicate-copy protection
- Return processing with good or damaged condition, loss handling, and staff copy repair/withdrawal controls
- Student book browsing by title, author, category, or ISBN with available/borrowed/reserved copy counts
- Student dashboard, active loans, borrowing history, reservation tracking, decision updates, notifications, and editable contact email
- Student borrowing requests with librarian approval separated from the later physical-copy issue; eligibility is checked again at issue
- Student reservations, FIFO ready-copy allocation, two-day hold expiration, and in-app notifications
- Policy-based renewals with limits and reservation queue checks
- Students can view their own loans; staff can view and return circulation records
- Audit entries for account creation, catalog additions, checkouts, and returns

Password reset and broad catalog editing workflows are not yet included. The database schema remains the source of truth for student loan policy.

## Project layout

```text
control_panel/             Python/Tkinter local service control panel
Start Library Control Panel.bat
frontend/src/App.tsx      Authenticated application shell and navigation
frontend/src/pages/       Overview, catalog, students, circulation, loans, reservations
frontend/src/components/  Shared form, modal, notification, and status components
frontend/src/services/    Typed fetch client with cookie credentials
backend/src/routes/       Auth, users, books, loans, reservations, notifications, dashboard
backend/src/services/     Password hashing, signed sessions, audit, notification, reservations
backend/src/config/       PostgreSQL connection pool and startup check
database/schema/          Supabase PostgreSQL schema
database/                 Schema notes, migrations, and seeds
```

## Build checks

```powershell
npm run typecheck
npm run build
```

See [`database/README.md`](database/README.md) for the schema, constraints, relationship diagram, and circulation design notes.

## Role workspaces

Administrators and librarians have separate menus and permissions. Librarians can review student records and eligibility, search the catalog, issue copies, process returns, review and decide student borrowing requests, manage reservations, inspect inventory, monitor overdue loans, and export a circulation summary. Students can browse availability, request a title with an available copy, or join the reservation queue when copies are unavailable. Librarians decide requests separately from handing over and recording a specific physical copy.

For an existing MySQL installation, this code change does not transfer existing records automatically. Create the Supabase schema first, then migrate and verify the MySQL data before using the new backend with existing records. The old MySQL migration files are retained as historical references and must not be applied to Supabase.
