import type { RequestHandler } from 'express';
import { databasePool } from '../config/database.js';
import type { RoleCode, SessionUser } from '../types/auth.js';
import { sessionFromCookie } from '../services/session.service.js';

async function resolveActiveUser(request: Parameters<RequestHandler>[0]): Promise<SessionUser | null> {
  const user = sessionFromCookie(request.headers.cookie);
  if (!user) return null;
  const [rows] = await databasePool.execute<any[]>(
    `SELECT u.id, u.username, u.first_name AS firstName, u.last_name AS lastName, r.code
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ? AND u.account_status = 'ACTIVE'`, [user.id]);
  if (!rows.length) return null;
  return {
    id: rows[0].id,
    username: rows[0].username,
    firstName: rows[0].firstName,
    lastName: rows[0].lastName,
    roles: rows.map((row) => row.code).filter(Boolean) as RoleCode[],
  };
}

export const requireAuth: RequestHandler = (request, response, next) => {
  void resolveActiveUser(request).then((user) => {
    if (!user) { response.status(401).json({ error: 'Please sign in to continue.' }); return; }
    Object.assign(request, { auth: user });
    next();
  }).catch(next);
};

export function requireRoles(...allowedRoles: RoleCode[]): RequestHandler {
  return (request, response, next) => {
    void resolveActiveUser(request).then((user) => {
      if (!user) { response.status(401).json({ error: 'Please sign in to continue.' }); return; }
      if (!user.roles.some((role) => allowedRoles.includes(role))) { response.status(403).json({ error: 'You do not have access to this action.' }); return; }
      Object.assign(request, { auth: user });
      next();
    }).catch(next);
  };
}
