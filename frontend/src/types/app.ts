export type Page = 'overview' | 'catalog' | 'students' | 'circulation' | 'loans' | 'reservations';
export type Notice = { kind: 'success' | 'error'; message: string } | null;
