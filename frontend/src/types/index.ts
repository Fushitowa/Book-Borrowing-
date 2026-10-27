export type Role = 'ADMIN' | 'LIBRARIAN' | 'STUDENT';

export interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  roles: Role[];
}

export interface Book {
  id: number;
  isbn: string | null;
  title: string;
  subtitle: string | null;
  edition: string | null;
  publicationYear: number | null;
  publisher: string | null;
  authors: string | null;
  categories: string | null;
  totalCopies: number;
  availableCopies: number;
}

export interface Loan {
  id: number;
  status: 'ACTIVE' | 'RETURNED' | 'LOST';
  checkedOutAt: string;
  dueAt: string;
  returnedAt: string | null;
  returnCondition: 'GOOD' | 'DAMAGED' | null;
  title: string;
  barcode: string;
  borrower: string;
  borrowerId: number;
  isOverdue: boolean | number;
}

export interface Student {
  id: number;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  accountStatus: 'ACTIVE' | 'DISABLED' | 'LOCKED';
  studentNumber: string;
  gradeLevel: string | null;
  section: string | null;
}

export interface Reservation {
  id: number;
  bookId: number;
  studentId: number;
  copyId: number | null;
  status: 'PENDING' | 'READY' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED';
  requestedAt: string;
  readyAt: string | null;
  expiresAt: string | null;
  title: string;
  barcode: string | null;
  student: string;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface DashboardData {
  stats: { titles: number; availableCopies: number; activeLoans: number; overdueLoans: number; students: number };
  recentLoans: Loan[];
}
