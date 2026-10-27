import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import type { RoleCode, SessionUser } from '../types/auth.js';

const COOKIE_NAME = 'library_session';
const SESSION_SECONDS = 60 * 60 * 8;
const REMEMBERED_SESSION_SECONDS = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.AUTH_TOKEN_SECRET;
  if (!value || value.length < 32) throw new Error('AUTH_TOKEN_SECRET must contain at least 32 characters.');
  return value;
}

function signature(input: string): string {
  return createHmac('sha256', secret()).update(input).digest('base64url');
}

export function createSessionToken(user: SessionUser, rememberMe = false): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: user.roles,
    exp: Math.floor(Date.now() / 1000) + (rememberMe ? REMEMBERED_SESSION_SECONDS : SESSION_SECONDS),
  })).toString('base64url');
  const content = `${header}.${payload}`;
  return `${content}.${signature(content)}`;
}

export function readSessionToken(token: string): SessionUser | null {
  try {
    const [header, payload, suppliedSignature] = token.split('.');
    if (!header || !payload || !suppliedSignature) return null;
    const content = `${header}.${payload}`;
    const expected = Buffer.from(signature(content));
    const actual = Buffer.from(suppliedSignature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub: number; username: string; firstName: string; lastName: string; roles: RoleCode[]; exp: number;
    };
    if (!Number.isSafeInteger(decoded.sub) || decoded.exp <= Math.floor(Date.now() / 1000) || !Array.isArray(decoded.roles)) return null;
    return { id: decoded.sub, username: decoded.username, firstName: decoded.firstName, lastName: decoded.lastName, roles: decoded.roles };
  } catch {
    return null;
  }
}

export function setSessionCookie(response: Response, token: string, rememberMe = false): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = rememberMe ? REMEMBERED_SESSION_SECONDS : SESSION_SECONDS;
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookie(response: Response): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

export function sessionFromCookie(cookieHeader = ''): SessionUser | null {
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;
  return readSessionToken(cookie.slice(COOKIE_NAME.length + 1));
}
