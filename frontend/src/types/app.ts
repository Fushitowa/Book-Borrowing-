export type Page = 'overview' | 'student-dashboard' | 'catalog' | 'inventory' | 'students' | 'circulation' | 'loans' | 'history' | 'reservations' | 'borrowing-requests' | 'overdue' | 'reports' | 'notifications' | 'audit' | 'settings' | 'profile';
export type Notice = { kind: 'success' | 'error'; message: string } | null;
