import type { Role, User } from '../types';
export function isStaff(user: User): boolean { return user.roles.includes('ADMIN') || user.roles.includes('LIBRARIAN'); }
export function roleLabel(roles: Role[]): string { return roles.map((role) => role.charAt(0) + role.slice(1).toLowerCase()).join(' · '); }
export function initials(user: User): string { return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase(); }
export function date(value: string | null): string { return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
export function isOverdue(loan: { isOverdue: boolean | number }): boolean { return Boolean(loan.isOverdue); }
