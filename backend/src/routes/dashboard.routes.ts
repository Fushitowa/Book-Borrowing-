import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireRoles } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../types/auth.js';

export const dashboardRouter = Router();
dashboardRouter.get('/student', requireRoles('STUDENT'), async (request, response, next) => {
  const userId = (request as AuthenticatedRequest).auth.id;
  try {
    const [[stats]] = await databasePool.execute<any[]>(
      `SELECT
        (SELECT COUNT(*) FROM loans WHERE borrower_user_id = ? AND status = 'ACTIVE') AS currentlyBorrowed,
        (SELECT COUNT(*) FROM loans WHERE borrower_user_id = ? AND status = 'ACTIVE' AND due_at >= UTC_TIMESTAMP() AND due_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS dueSoon,
        (SELECT COUNT(*) FROM reservations WHERE student_user_id = ? AND status IN ('PENDING','READY')) AS activeReservations,
        (SELECT COUNT(*) FROM loans WHERE borrower_user_id = ?) AS totalBorrowed`,
      [userId, userId, userId, userId]);
    const [recentLoans] = await databasePool.execute<any[]>(
      `SELECT l.id, l.status, l.checked_out_at AS checkedOutAt, l.due_at AS dueAt,
          l.returned_at AS returnedAt, l.return_condition AS returnCondition,
          b.title, bc.barcode, u.id AS borrowerId,
          CASE WHEN l.status = 'ACTIVE' AND l.due_at < UTC_TIMESTAMP() THEN 1 ELSE 0 END AS isOverdue
         FROM loans l JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
         JOIN users u ON u.id = l.borrower_user_id
        WHERE l.borrower_user_id = ? ORDER BY CASE WHEN l.status = 'ACTIVE' THEN 0 ELSE 1 END, l.due_at ASC, l.checked_out_at DESC LIMIT 5`, [userId]);
    response.json({ stats, recentLoans });
  } catch (error) { next(error); }
});

dashboardRouter.get('/stats', requireRoles('ADMIN', 'LIBRARIAN'), async (_request, response, next) => {
  try {
    const [[bookRows], [totalCopyRows], [copyRows], [loanRows], [overdueRows], [studentRows], [recentRows], [requestRows], [issuedRows], [returnedRows], [activityRows]] = await Promise.all([
      databasePool.query<any[]>('SELECT COUNT(*) AS total FROM books'),
      databasePool.query<any[]>('SELECT COUNT(*) AS total FROM book_copies'),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM book_copies bc WHERE bc.copy_status = 'IN_SERVICE' AND NOT EXISTS (SELECT 1 FROM loans WHERE loans.copy_id = bc.id AND loans.status = 'ACTIVE') AND NOT EXISTS (SELECT 1 FROM reservations WHERE reservations.allocated_copy_id = bc.id AND reservations.status = 'READY')"),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM loans WHERE status = 'ACTIVE'"),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM loans WHERE status = 'ACTIVE' AND due_at < UTC_TIMESTAMP()"),
      databasePool.query<any[]>("SELECT COUNT(DISTINCT ur.user_id) AS total FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'STUDENT'"),
      databasePool.query<any[]>(`SELECT l.id, l.checked_out_at AS checkedOutAt, l.due_at AS dueAt,
          CONCAT(u.first_name, ' ', u.last_name) AS borrower,
          b.title, bc.barcode, l.status
        FROM loans l JOIN users u ON u.id = l.borrower_user_id
        JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
        ORDER BY l.checked_out_at DESC LIMIT 8`),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM borrowing_requests WHERE status = 'PENDING'"),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM loans WHERE checked_out_at >= UTC_DATE() AND checked_out_at < UTC_DATE() + INTERVAL 1 DAY"),
      databasePool.query<any[]>("SELECT COUNT(*) AS total FROM loans WHERE status = 'RETURNED' AND returned_at >= UTC_DATE() AND returned_at < UTC_DATE() + INTERVAL 1 DAY"),
      databasePool.query<any[]>(`SELECT DATE_FORMAT(activity_date, '%Y-%m-%d') AS day,
          SUM(issued_count) AS issued, SUM(returned_count) AS returned
        FROM (
          SELECT DATE(checked_out_at) AS activity_date, COUNT(*) AS issued_count, 0 AS returned_count
          FROM loans
          WHERE checked_out_at >= UTC_DATE() - INTERVAL 6 DAY
            AND checked_out_at < UTC_DATE() + INTERVAL 1 DAY
          GROUP BY DATE(checked_out_at)
          UNION ALL
          SELECT DATE(returned_at) AS activity_date, 0 AS issued_count, COUNT(*) AS returned_count
          FROM loans
          WHERE returned_at IS NOT NULL
            AND returned_at >= UTC_DATE() - INTERVAL 6 DAY
            AND returned_at < UTC_DATE() + INTERVAL 1 DAY
          GROUP BY DATE(returned_at)
        ) AS activity
        GROUP BY activity_date
        ORDER BY activity_date`),
    ]);
    response.json({
      stats: {
        titles: bookRows[0].total, totalCopies: totalCopyRows[0].total, availableCopies: copyRows[0].total,
        activeLoans: loanRows[0].total, overdueLoans: overdueRows[0].total, students: studentRows[0].total,
        pendingRequests: requestRows[0].total, issuedToday: issuedRows[0].total, returnedToday: returnedRows[0].total,
      },
      recentLoans: recentRows,
      dailyActivity: activityRows,
    });
  } catch (error) { next(error); }
});
