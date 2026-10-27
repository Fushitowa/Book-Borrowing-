import type { Request, Response } from 'express';
import { databasePool } from '../config/database.js';
import { verifyPassword } from '../services/password.service.js';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '../services/session.service.js';
import type { AuthenticatedRequest, RoleCode, SessionUser } from '../types/auth.js';

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function login(request: Request, response: Response): Promise<void> {
  const ip = request.ip ?? 'unknown';
  const now = Date.now();
  const attempt = attempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 10) {
    response.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    return;
  }

  const identifier = typeof request.body?.identifier === 'string' ? request.body.identifier.trim() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!identifier || !password || identifier.length > 254 || password.length > 200) {
    response.status(400).json({ error: 'Enter your username or email and password.' });
    return;
  }

  const [rows] = await databasePool.execute<any[]>(
    `SELECT u.id, u.username, u.first_name AS firstName, u.last_name AS lastName,
            u.password_hash AS passwordHash, u.account_status AS accountStatus
       FROM users u WHERE u.username = ? OR u.email = ? LIMIT 1`,
    [identifier, identifier],
  );
  const account = rows[0];
  const valid = account ? await verifyPassword(password, account.passwordHash) : false;
  if (!account || !valid || account.accountStatus !== 'ACTIVE') {
    const current = attempts.get(ip);
    attempts.set(ip, current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + 15 * 60 * 1000 });
    response.status(401).json({ error: 'The username/email or password is incorrect.' });
    return;
  }

  attempts.delete(ip);
  const [roleRows] = await databasePool.execute<any[]>(
    `SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? ORDER BY r.code`,
    [account.id],
  );
  const user: SessionUser = {
    id: account.id,
    username: account.username,
    firstName: account.firstName,
    lastName: account.lastName,
    roles: roleRows.map((row) => row.code as RoleCode),
  };
  if (!user.roles.length) {
    response.status(403).json({ error: 'This account has no assigned library role.' });
    return;
  }
  setSessionCookie(response, createSessionToken(user));
  response.json({ user });
}

export function logout(_request: Request, response: Response): void {
  clearSessionCookie(response);
  response.status(204).end();
}

export function currentUser(request: Request, response: Response): void {
  const user = (request as AuthenticatedRequest).auth;
  response.json({ user });
}
