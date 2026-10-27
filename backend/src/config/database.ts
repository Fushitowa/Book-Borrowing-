import 'dotenv/config';
import mysql from 'mysql2/promise';

function requiredEnv(name: string): string {
  const raw = process.env[name];
  if (!raw?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return name === 'DB_PASSWORD' ? raw : raw.trim();
}

const port = Number(process.env.DB_PORT ?? 3306);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DB_PORT must be a valid TCP port number.');
}

export const databasePool = mysql.createPool({
  host: requiredEnv('DB_HOST'),
  port,
  user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnv('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
});

export async function verifyDatabaseConnection(): Promise<void> {
  await databasePool.query('SELECT 1');
}
