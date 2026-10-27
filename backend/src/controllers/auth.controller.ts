import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { databasePool } from '../config/database.js';
import { hashPassword, verifyPassword } from '../services/password.service.js';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '../services/session.service.js';
import { writeAudit } from '../services/audit.service.js';
import type { AuthenticatedRequest, RoleCode, SessionUser } from '../types/auth.js';

const attempts = new Map<string, { count: number; resetAt: number }>();
const registrations = new Map<string, { count: number; resetAt: number }>();

function isValidLibrarianCode(supplied: string): boolean {
  const expectedCode = process.env.LIBRARIAN_SIGNUP_CODE;
  if (!expectedCode) return false;
  const expected = Buffer.from(expectedCode);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function register(request: Request, response: Response): Promise<void> {
  const ip = request.ip ?? 'unknown';
  const now = Date.now();
  const attempt = registrations.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) {
    response.status(429).json({ error: 'Too many account creation attempts. Try again in 15 minutes.' });
    return;
  }

  const body = request.body ?? {};
  const role = body.role as unknown;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const studentNumber = typeof body.studentNumber === 'string' ? body.studentNumber.trim() : '';
  const program = typeof body.program === 'string' ? body.program.trim() : '';
  const yearLevel = typeof body.yearLevel === 'string' ? body.yearLevel.trim() : '';
  const section = typeof body.section === 'string' ? body.section.trim() : '';
  const librarianCode = typeof body.invitationCode === 'string' ? body.invitationCode : '';

  if (role !== 'STUDENT' && role !== 'LIBRARIAN') {
    response.status(400).json({ error: 'Choose Student or Librarian to create an account.' });
    return;
  }
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username) || !firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    response.status(400).json({ error: 'Enter a valid username, first name, and last name.' });
    return;
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    response.status(400).json({ error: 'Enter a valid email address, or leave the email field empty.' });
    return;
  }
  if (password.length < 12 || password.length > 200) {
    response.status(400).json({ error: 'Password must be between 12 and 200 characters.' });
    return;
  }
  if (role === 'STUDENT' && (!studentNumber || studentNumber.length > 40 || program.length > 120 || yearLevel.length > 20 || section.length > 50)) {
    response.status(400).json({ error: 'Enter a student number. Program, year level, and section have length limits.' });
    return;
  }
  registrations.set(ip, attempt && attempt.resetAt > now
    ? { count: attempt.count + 1, resetAt: attempt.resetAt }
    : { count: 1, resetAt: now + 15 * 60 * 1000 });
  if (role === 'LIBRARIAN' && !isValidLibrarianCode(librarianCode)) {
    response.status(403).json({ error: 'A valid librarian invitation code is required. Ask the library administrator for access.' });
    return;
  }

  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [roleRows] = await connection.execute<any[]>('SELECT id FROM roles WHERE code = ? LIMIT 1', [role]);
    if (!roleRows.length) throw new Error(`The ${role} role is missing from the database.`);
    const [userInsert] = await connection.execute<any>(
      'INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [username, email || null, await hashPassword(password), firstName, lastName],
    );
    const userId = Number(userInsert.insertId);
    await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleRows[0].id]);
    if (role === 'STUDENT') {
      await connection.execute(
        'INSERT INTO student_profiles (user_id, student_number, program, year_level, section) VALUES (?, ?, ?, ?, ?)',
        [userId, studentNumber, program || null, yearLevel || null, section || null],
      );
    }
    await writeAudit(connection, userId, `${role}_SELF_REGISTERED`, 'users', userId, { username, role });
    await connection.commit();

    registrations.delete(ip);
    const user: SessionUser = { id: userId, username, firstName, lastName, roles: [role] };
    setSessionCookie(response, createSessionToken(user));
    response.status(201).json({ user, message: 'Your account has been created.' });
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string } | null)?.code === 'ER_DUP_ENTRY') {
      response.status(409).json({
        error: role === 'STUDENT'
          ? 'That username, email, or student number is already registered.'
          : 'That username or email is already registered.',
      });
      return;
    }
    throw error;
  } finally {
    connection.release();
  }
}

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
  const rememberMe = request.body?.rememberMe === true;
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
  setSessionCookie(response, createSessionToken(user, rememberMe), rememberMe);
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
