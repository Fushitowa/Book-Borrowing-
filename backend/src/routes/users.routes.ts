import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireRoles } from '../middleware/auth.middleware.js';
import { writeAudit } from '../services/audit.service.js';
import { hashPassword } from '../services/password.service.js';
import type { AuthenticatedRequest } from '../types/auth.js';

export const usersRouter = Router();

usersRouter.get('/me', requireRoles('STUDENT'), async (request, response, next) => {
  const userId = (request as AuthenticatedRequest).auth.id;
  try {
    const [rows] = await databasePool.execute<any[]>(
      `SELECT u.id, u.username, u.email, u.first_name AS firstName, u.last_name AS lastName,
          sp.student_number AS studentNumber, sp.program, sp.year_level AS yearLevel, sp.section
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = ?`, [userId]);
    if (!rows.length) { response.status(404).json({ error: 'Student profile not found.' }); return; }
    response.json({ profile: rows[0] });
  } catch (error) { next(error); }
});

usersRouter.patch('/me', requireRoles('STUDENT'), async (request, response, next) => {
  const userId = (request as AuthenticatedRequest).auth.id;
  const rawEmail = request.body?.email;
  if (rawEmail !== null && typeof rawEmail !== 'string') { response.status(400).json({ error: 'Enter a valid email address.' }); return; }
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) { response.status(400).json({ error: 'Enter a valid email address (254 characters or fewer).' }); return; }
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [beforeRows] = await connection.execute<any[]>("SELECT email FROM users WHERE id = ? AND account_status = 'ACTIVE' FOR UPDATE", [userId]);
    if (!beforeRows.length) { await connection.rollback(); response.status(404).json({ error: 'Active student account not found.' }); return; }
    await connection.execute('UPDATE users SET email = ? WHERE id = ?', [email || null, userId]);
    await writeAudit(connection, userId, 'STUDENT_PROFILE_EMAIL_UPDATED', 'users', userId, { from: beforeRows[0].email, to: email || null });
    await connection.commit();
    response.json({ message: 'Profile email updated.', email: email || null });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

usersRouter.get('/', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const auth = (request as AuthenticatedRequest).auth;
  const role = typeof request.query.role === 'string' ? request.query.role.toUpperCase() : 'STUDENT';
  if (!['STUDENT', 'LIBRARIAN'].includes(role)) { response.status(400).json({ error: 'Choose Student or Librarian accounts.' }); return; }
  if (role === 'LIBRARIAN' && !auth.roles.includes('ADMIN')) { response.status(403).json({ error: 'Only administrators can manage librarian accounts.' }); return; }
  try {
    const q = typeof request.query.q === 'string' ? request.query.q.trim().slice(0, 100) : '';
    const search = `%${q}%`;
    const [rows] = await databasePool.execute<any[]>(
      `SELECT u.id, u.username, u.email, u.first_name AS firstName, u.last_name AS lastName,
          u.account_status AS accountStatus, r.code AS roleCode, sp.student_number AS studentNumber,
          sp.program, sp.year_level AS yearLevel, sp.section,
          (SELECT COUNT(*) FROM loans l WHERE l.borrower_user_id = u.id AND l.status = 'ACTIVE') AS activeLoans,
          (SELECT lp.max_active_loans FROM loan_policies lp JOIN roles sr ON sr.id = lp.borrower_role_id
            JOIN user_roles sur ON sur.role_id = sr.id AND sur.user_id = u.id
           WHERE sr.code = 'STUDENT' AND lp.is_active = 1 LIMIT 1) AS maxActiveLoans
         FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
        WHERE r.code = ? AND (? = '' OR u.username LIKE ? OR u.email LIKE ? OR
          u.first_name LIKE ? OR u.last_name LIKE ? OR sp.student_number LIKE ? OR sp.program LIKE ?)
        ORDER BY u.last_name, u.first_name LIMIT 500`, [role, q, search, search, search, search, search, search]);
    response.json({ items: rows });
  } catch (error) { next(error); }
});

usersRouter.post('/', requireRoles('ADMIN'), async (request, response, next) => {
  const body = request.body ?? {};
  const role = body.role === undefined ? 'STUDENT' : typeof body.role === 'string' ? body.role.toUpperCase() : '';
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const studentNumber = typeof body.studentNumber === 'string' ? body.studentNumber.trim() : '';
  const program = typeof body.program === 'string' ? body.program.trim() : '';
  const yearLevel = typeof body.yearLevel === 'string' ? body.yearLevel.trim() : '';
  const section = typeof body.section === 'string' ? body.section.trim() : '';
  if (!['STUDENT', 'LIBRARIAN'].includes(role)) { response.status(400).json({ error: 'Admins can create student or librarian accounts.' }); return; }
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username) || !firstName || firstName.length > 100 || !lastName || lastName.length > 100) {
    response.status(400).json({ error: 'Enter a valid username, first name, and last name.' }); return;
  }
  if (body.email !== undefined && body.email !== null && typeof body.email !== 'string') { response.status(400).json({ error: 'Enter a valid email address.' }); return; }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) { response.status(400).json({ error: 'Enter a valid email address.' }); return; }
  if (password.length < 12 || password.length > 200) { response.status(400).json({ error: 'Password must be between 12 and 200 characters.' }); return; }
  if (role === 'STUDENT' && (!studentNumber || studentNumber.length > 40 || program.length > 120 || yearLevel.length > 20 || section.length > 50)) { response.status(400).json({ error: 'Enter a student number. Program, year level, and section have length limits.' }); return; }

  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [roleRows] = await connection.execute<any[]>('SELECT id FROM roles WHERE code = ? LIMIT 1', [role]);
    if (!roleRows.length) throw new Error(`The ${role} role is missing from the database.`);
    const [userInsert] = await connection.execute<any>(
      'INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
      [username, email || null, await hashPassword(password), firstName, lastName]);
    const userId = Number(userInsert.insertId);
    await connection.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleRows[0].id]);
    if (role === 'STUDENT') {
      await connection.execute(
        'INSERT INTO student_profiles (user_id, student_number, program, year_level, section) VALUES (?, ?, ?, ?, ?)',
        [userId, studentNumber, program || null, yearLevel || null, section || null]);
    }
    await writeAudit(connection, (request as AuthenticatedRequest).auth.id, `${role}_CREATED`, 'users', userId, { username, studentNumber: role === 'STUDENT' ? studentNumber : null });
    await connection.commit();
    response.status(201).json({ id: userId, role, message: `${role === 'STUDENT' ? 'Student' : 'Librarian'} account created.` });
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string } | null)?.code === 'ER_DUP_ENTRY') {
      response.status(409).json({ error: role === 'STUDENT' ? 'That username, email, or student number is already registered.' : 'That username or email is already registered.' });
      return;
    }
    next(error);
  }
  finally { connection.release(); }
});

usersRouter.patch('/:userId/status', requireRoles('ADMIN'), async (request, response, next) => {
  const userId = Number(request.params.userId);
  const status = request.body?.status;
  const actorId = (request as AuthenticatedRequest).auth.id;
  if (!Number.isSafeInteger(userId) || userId < 1 || !['ACTIVE', 'DISABLED'].includes(status)) {
    response.status(400).json({ error: 'Choose a valid account and status.' }); return;
  }
  if (userId === actorId) { response.status(409).json({ error: 'You cannot disable your own administrator account.' }); return; }
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>(
      `SELECT u.account_status AS accountStatus,
          EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'ADMIN') AS isAdmin,
          EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'STUDENT') AS isStudent,
          EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'LIBRARIAN') AS isLibrarian
         FROM users u WHERE u.id = ? FOR UPDATE`, [userId]);
    if (!rows.length || rows[0].isAdmin || (!rows[0].isStudent && !rows[0].isLibrarian)) { await connection.rollback(); response.status(404).json({ error: 'Student or librarian account not found.' }); return; }
    const previous = rows[0].accountStatus;
    await connection.execute('UPDATE users SET account_status = ? WHERE id = ?', [status, userId]);
    const role = rows[0].isStudent ? 'STUDENT' : 'LIBRARIAN';
    await writeAudit(connection, actorId, `${role}_${status === 'ACTIVE' ? 'REACTIVATED' : 'DISABLED'}`, 'users', userId, { from: previous, to: status });
    await connection.commit();
    const roleLabel = role === 'STUDENT' ? 'Student' : 'Librarian';
    response.json({ message: status === 'ACTIVE' ? `${roleLabel} account reactivated.` : `${roleLabel} account disabled.` });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});
