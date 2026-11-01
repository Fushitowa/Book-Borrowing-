# School library database

The application database is Supabase PostgreSQL. Apply [`schema/school_library.sql`](schema/school_library.sql) to a new Supabase project using its SQL Editor. The script creates the `public` schema tables, constraints, indexes, updated-at triggers, role seed rows, and default student loan policy. It does not create any administrator account.

## Data model

The `books` table represents a title or edition. Each physical copy has its own `book_copies` row and barcode. Availability is computed from copy condition, active loans, and reservation holds rather than stored as a counter.

| Tables | Purpose |
|---|---|
| `roles`, `users`, `user_roles`, `student_profiles` | Accounts, role membership, and student details. Accounts are disabled instead of deleted. |
| `loan_policies` | Checkout length, active loan, renewal, and reservation limits by borrower role. |
| `publishers`, `authors`, `categories`, `books`, `book_authors`, `book_categories`, `book_copies` | Normalized title catalog and separately tracked physical copies. |
| `loans`, `renewals`, `borrowing_requests` | Circulation history, renewal records, and approval separated from physical issue. |
| `reservations` | FIFO title queues with a specific copy held for a student when it becomes available. |
| `notifications`, `audit_logs` | In-app user messages and append-only audit history. |

The SQL uses PostgreSQL identity columns, `TIMESTAMPTZ` values stored and interpreted in UTC, `JSONB` audit values, check constraints, and partial unique indexes for active loans and open requests. Those indexes protect against duplicate active loans per copy and duplicate pending requests per student/title. Transactions in the Express API handle cross-table circulation changes.

## Application connection and access

Set `DATABASE_URL` in the ignored `backend/.env` to the PostgreSQL connection string from the Supabase dashboard's **Connect** dialog. The backend requires TLS by default. Do not use the `service_role` API key in this connection string; this project connects with PostgreSQL's `pg` driver rather than Supabase's REST API.

The Express API retains the app's existing password and signed-cookie authentication. Supabase Auth is not enabled by this migration. Browser requests continue to go through Express, so Supabase credentials remain server-side.

For a deployed environment, create a dedicated PostgreSQL login with only the table privileges required by the API. For example, from the SQL Editor while connected as the database administrator, replace the password placeholder with a strong secret and run:

```sql
CREATE ROLE library_app LOGIN PASSWORD 'replace-with-a-strong-secret';
GRANT CONNECT ON DATABASE postgres TO library_app;
GRANT USAGE ON SCHEMA public TO library_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO library_app;
GRANT DELETE ON public.books, public.book_copies TO library_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO library_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO library_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO library_app;
```

Use that database role in `DATABASE_URL` using the connection details from **Connect**. The SQL Editor connection is an administrator connection; do not copy its credentials into frontend code. The schema revokes direct table and sequence access for Supabase `anon` and `authenticated` roles. Add client-side data access only with suitable Row Level Security policies.

The app uses parameterized SQL and transaction locks. The backend health endpoint runs a database query and only reports healthy when PostgreSQL is reachable. Supabase connection pooling is documented at [Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits); use a session pooler for a long-running Express server if the direct host is not reachable from your network.

## Moving existing MySQL data

Changing the app connection does not copy records from an existing MySQL server. Create the Supabase schema first, export the MySQL tables, convert the data to PostgreSQL-compatible CSV/SQL, then import in foreign-key order and verify counts, users, loans, requests, and reservations before pointing the app at that project. Preserve existing password hashes only if the target `users.password_hash` values use the app's `scrypt:<salt>:<hash>` format.

Files under `migrations/` are historical MySQL migrations from the previous database implementation. Do not run them in Supabase. For future schema changes, add PostgreSQL migration scripts and apply them through the Supabase SQL Editor or your migration tooling.

Back up the Supabase project and test restore before relying on it for school operations. Supabase provides database backups and point-in-time recovery depending on plan; see its [database overview](https://supabase.com/docs/guides/database/overview).
