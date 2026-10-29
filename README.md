# Carbonell School Library

![Carbonell Library emblem](frontend/public/carbonell-library-mark.png)

The original full logo artwork is available at [`frontend/public/carbonell-library-logo.jpg`](frontend/public/carbonell-library-logo.jpg).

A local school library borrowing system built with React, TypeScript, Vite, Tailwind CSS, Express, and MySQL. The catalog stores title records separately from individually barcoded copies. Circulation history is retained in MySQL.

## Requirements

- Node.js 20 or newer and npm
- Python 3.10 or newer with Tkinter/Tcl-Tk for the desktop control panel
- MySQL 8.0.16+ or MariaDB 10.4+
- The `school_library` schema imported from [`database/schema/school_library.sql`](database/schema/school_library.sql)
- A restricted MySQL application account and local settings in `backend/.env`

Do not run the XAMPP MySQL service alongside the standalone MySQL server on the same port. Start the database service you imported `school_library` into.

## First-time setup

From the repository root in PowerShell:

```powershell
npm install
```

The local `backend/.env` should contain `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME=school_library`. Copy `backend/.env.example` only if `.env` does not exist, then enter the dedicated `library_app` password. Add a random `AUTH_TOKEN_SECRET` of at least 32 characters. Never commit `.env` or use the MySQL root account in the application.

### Librarian invitation code

Librarian self-registration requires a private invitation code. Generate one in PowerShell from the project root:

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Copy the generated value into `backend/.env` like this:

```dotenv
LIBRARIAN_SIGNUP_CODE=paste_the_generated_value_here
```

Restart the backend after changing `.env`, then share the code only with authorized librarians. Student account creation does not require an invitation code. For a librarian account created directly by the administrator, use `npm run create-librarian` instead.

Create the first administrator. The password prompt is hidden and the password is stored as a scrypt hash:

```powershell
npm run create-admin
```

Additional librarian accounts can be created from the terminal with the same secure prompt:

```powershell
npm run create-librarian
```

## Run the application

For one-click local startup, double-click **Start Library Control Panel.bat** in the project root. The Python control panel starts the configured MySQL Windows service, waits for the API health check, starts the frontend, and can open the app automatically. See [`control_panel/README.md`](control_panel/README.md) for service permissions and controls.

To start services manually, open two PowerShell windows in the project root. Start the API in the first:

```powershell
npm run dev:backend
```

Start Vite in the second:

```powershell
npm run dev:frontend
```

Open the Vite URL printed in the second terminal (normally `http://localhost:5174`). The API is available at `http://localhost:3000`; `/api/health` reports whether its database check passed. Vite proxies `/api` requests to Express.

## Current workflows

- HttpOnly signed-cookie sign-in and sign-out, with administrator, librarian, and student roles
- Public student account creation and invitation-protected librarian registration; administrator accounts remain provisioned only from the local command
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
backend/src/config/       MySQL connection pool and startup check
database/schema/          Importable MySQL schema
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

Your current database already has the college profile and borrowing request table. Apply these two new migrations once before starting the updated backend:

```powershell
Get-Content -Raw -LiteralPath "database/migrations/20261029_separate_request_approval_from_issue.sql" | & "C:\Program Files\MySQL\MySQL Server 26.7\bin\mysql.exe" -h 127.0.0.1 -P 3306 -u root -p
Get-Content -Raw -LiteralPath "database/migrations/20261030_student_due_reminder_deduplication.sql" | & "C:\Program Files\MySQL\MySQL Server 26.7\bin\mysql.exe" -h 127.0.0.1 -P 3306 -u root -p
```

The book-cover feature adds one nullable column to the existing `books` table. Apply this additional migration once using the MySQL administrator account (the restricted `library_app` account intentionally cannot change the schema), then restart the backend:

```powershell
Get-Content -Raw -LiteralPath "database/migrations/20261028_book_cover_image.sql" | & "C:\Program Files\MySQL\MySQL Server 26.7\bin\mysql.exe" -h 127.0.0.1 -P 3306 -u root -p
```
