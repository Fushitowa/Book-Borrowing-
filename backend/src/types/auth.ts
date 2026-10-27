import type { Request } from 'express';

export type RoleCode = 'ADMIN' | 'LIBRARIAN' | 'STUDENT';

export interface SessionUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  roles: RoleCode[];
}

export interface AuthenticatedRequest extends Request {
  auth: SessionUser;
}
