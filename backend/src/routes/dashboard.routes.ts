import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireRoles } from '../middleware/auth.middleware.js';

export const dashboardRouter = Router();
dashboardRouter.get('/stats', requireRoles('ADMIN', 'LIBRARIAN'), async (_request, response, next) => {
  try {
    const [[bookRows], [copyRows], [loanRows], [overdueRows], [studentRows], [recentRows]] = await Promise.all([
      databasePool.query<any[]>('SELECT COUNT(*) AS total FROM books'),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM book_copies WHERE copy_status = 'IN_SERVICE' AND NOT EXISTS (SELECT 1 FROM loans WHERE loans.copy_id = book_copies.id AND loans.status = 'ACTIVE') AND NOT EXISTS (SELECT 1 FROM reservations WHERE reservations.allocated_copy_id = book_copies.id AND reservations.status = 'READY')"),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM loans WHERE status = 'ACTIVE'"),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM loans WHERE status = 'ACTIVE' AND due_at < UTC_TIMESTAMP()"),
      databasePool.query<any[]>("SELECT COUNT(DISTINCT ur.user_id) AS total FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'STUDENT'"),
      databasePool.query<any[]>(`SELECT l.id, l.checked_out_at AS checkedOutAt, l.due_at AS dueAt,
          CONCAT(u.first_name, ' ', u.last_name) AS borrower,
          b.title, bc.barcode, l.status
        FROM loans l JOIN users u ON u.id = l.borrower_user_id
        JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
        ORDER BY l.checked_out_at DESC LIMIT 8`),
    ]);
    response.json({
      stats: { titles: bookRows[0].total, availableCopies: copyRows[0].total, activeLoans: loanRows[0].total, overdueLoans: overdueRows[0].total, students: studentRows[0].total },
      recentLoans: recentRows,
    });
  } catch (error) { next(error); }
});
