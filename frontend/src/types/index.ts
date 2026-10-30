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
  coverImageUrl: string | null;
  authors: string | null;
  categories: string | null;
  totalCopies: number;
  availableCopies: number;
  borrowedCopies: number;
  reservedCopies: number;
  waitingReservations: number;
}

export interface Loan {
  id: number;
  status: 'ACTIVE' | 'RETURNED' | 'LOST';
  checkedOutAt: string;
  dueAt: string;
  returnedAt: string | null;
  returnCondition: 'GOOD' | 'DAMAGED' | null;
  title: string;
  coverImageUrl: string | null;
  barcode: string;
  borrower: string;
  borrowerEmail?: string | null;
  borrowerId: number;
  returnRequestedAt: string | null;
  returnRequestedNote: string | null;
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
  program: string | null;
  yearLevel: string | null;
  section: string | null;
  activeLoans: number;
  maxActiveLoans: number | null;
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
  stats: { titles: number; totalCopies: number; availableCopies: number; activeLoans: number; overdueLoans: number; students: number; pendingRequests: number; issuedToday: number; returnedToday: number };
  recentLoans: Loan[];
  dailyActivity: { day: string; issued: number; returned: number }[];
}
