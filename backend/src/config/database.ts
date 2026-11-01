import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, types, type PoolClient, type QueryResult } from 'pg';

type DbRow = Record<string, unknown>;
type QueryValues = readonly unknown[];
type DbResult = { insertId?: number; affectedRows?: number; rowCount?: number };
type DbResponse<T extends DbRow[]> = Promise<[T, DbResult]>;

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error('Missing required environment variable: DATABASE_URL. Add the Supabase PostgreSQL connection string to backend/.env.');
}
if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection URI beginning with postgresql://. A Supabase https:// project or /rest/v1/ URL is not a database connection string.');
}

// Keep PostgreSQL BIGINT values numeric to match the API's existing response types.
types.setTypeParser(20, (value) => Number(value));

const pool = new Pool({
  connectionString,
  max: 10,
  ssl: process.env.DATABASE_SSL === 'disable' ? undefined : {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
    ...(process.env.DATABASE_SSL_CA_PATH?.trim()
      ? { ca: readFileSync(resolve(process.cwd(), process.env.DATABASE_SSL_CA_PATH.trim()), 'utf8') }
      : {}),
  },
  application_name: 'carbonell-school-library',
});

const idTables = new Set([
  'users', 'loan_policies', 'publishers', 'authors', 'categories', 'books',
  'book_copies', 'reservations', 'loans', 'borrowing_requests', 'renewals',
  'notifications', 'audit_logs',
]);

function translateSql(input: string): { text: string; returnsId: boolean } {
  let sql = input
    .replace(/\bINSERT\s+IGNORE\s+INTO\b/i, 'INSERT INTO')
    .replace(/\bUTC_TIMESTAMP\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bUTC_DATE\s*\(\s*\)/gi, 'CURRENT_DATE')
    .replace(/\bDATE_FORMAT\s*\(\s*([^,]+),\s*'%Y-%m-%d'\s*\)/gi, "TO_CHAR($1, 'YYYY-MM-DD')")
    .replace(/\bDATE_ADD\s*\(\s*([^,]+),\s*INTERVAL\s+\?\s+(DAY|HOUR)\s*\)/gi, "($1 + (? * INTERVAL '1 $2'))")
    .replace(/\bDATE_ADD\s*\(\s*([^,]+),\s*INTERVAL\s+(\d+)\s+(DAY|HOUR)\s*\)/gi, "($1 + INTERVAL '$2 $3')")
    .replace(/\bINTERVAL\s+(\d+)\s+(DAY|HOUR)\b/gi, "INTERVAL '$1 $2'")
    .replace(/\bGROUP_CONCAT\s*\(\s*([^)]*?)\s+ORDER\s+BY\s+([^)]*?)\s+SEPARATOR\s+'([^']*)'\s*\)/gi,
      (_match, expression: string, ordering: string, separator: string) => `STRING_AGG(${expression.trim()}, '${separator}' ORDER BY ${ordering.trim()})`)
    .replace(/\bFIELD\s*\(\s*([\w.]+)\s*,\s*((?:'[^']*'\s*,?\s*)+)\)/gi, (_match, expression: string, choices: string) => {
      const values = choices.match(/'[^']*'/g) ?? [];
      return `CASE ${expression} ${values.map((value, index) => `WHEN ${value} THEN ${index + 1}`).join(' ')} ELSE ${values.length + 1} END`;
    });

  // PostgreSQL folds unquoted aliases to lowercase; quote camelCase aliases to
  // preserve the response field names the frontend already consumes.
  sql = sql.replace(/\bAS\s+([a-z_][a-zA-Z0-9_]*)/g, (_match, alias: string) =>
    /[A-Z]/.test(alias) ? `AS "${alias}"` : `AS ${alias}`);

  const insertMatch = sql.match(/^\s*INSERT\s+INTO\s+([a-z_][a-z0-9_]*)/i);
  const table = insertMatch?.[1]?.toLowerCase();
  const returnsId = Boolean(table && idTables.has(table));
  if (/^\s*INSERT\s+IGNORE\s+INTO\b/i.test(input)) {
    sql = `${sql.trim().replace(/;\s*$/, '')} ON CONFLICT DO NOTHING`;
  }
  if (returnsId && !/\bRETURNING\b/i.test(sql)) {
    sql = `${sql.trim().replace(/;\s*$/, '')} RETURNING id`;
  }

  let position = 0;
  sql = sql.replace(/\?/g, () => `$${++position}`);
  return { text: sql, returnsId };
}

async function run<T extends DbRow[]>(client: Pool | PoolClient, sql: string, values: QueryValues = []): DbResponse<T> {
  const { text, returnsId } = translateSql(sql);
  const result: QueryResult<DbRow> = await client.query(text, [...values]);
  const rows = result.rows as T;
  const firstRow = rows[0];
  const header: DbResult = {
    ...(returnsId && firstRow && firstRow.id !== undefined ? { insertId: Number(firstRow.id) } : {}),
    affectedRows: result.rowCount ?? 0,
    rowCount: result.rowCount ?? 0,
  };
  if (/^\s*INSERT\b/i.test(sql)) {
    // Match mysql2's tuple convention: INSERT returns its header first, while
    // SELECT returns its rows first. Existing controllers read insertId there.
    return [header as unknown as T, rows as unknown as DbResult];
  }
  return [rows, header];
}

export interface DatabaseConnection {
  execute<T extends DbRow[] = DbRow[]>(sql: string, values?: QueryValues): DbResponse<T>;
  query<T extends DbRow[] = DbRow[]>(sql: string, values?: QueryValues): DbResponse<T>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

function wrapClient(client: PoolClient): DatabaseConnection {
  return {
    execute: <T extends DbRow[] = DbRow[]>(sql: string, values?: QueryValues) => run<T>(client, sql, values),
    query: <T extends DbRow[] = DbRow[]>(sql: string, values?: QueryValues) => run<T>(client, sql, values),
    beginTransaction: async () => { await client.query('BEGIN'); },
    commit: async () => { await client.query('COMMIT'); },
    rollback: async () => { await client.query('ROLLBACK'); },
    release: () => client.release(),
  };
}

export const databasePool = {
  execute: <T extends DbRow[] = DbRow[]>(sql: string, values?: QueryValues) => run<T>(pool, sql, values),
  query: <T extends DbRow[] = DbRow[]>(sql: string, values?: QueryValues) => run<T>(pool, sql, values),
  getConnection: async () => wrapClient(await pool.connect()),
  end: () => pool.end(),
};

export async function verifyDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
}
