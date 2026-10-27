import { databasePool } from '../config/database.js';

/** Create at most one reminder for each loan due date, even if the hourly job overlaps. */
export async function createDueSoonReminders(): Promise<void> {
  const [rows] = await databasePool.query<any[]>(
    `SELECT l.id AS loanId, l.borrower_user_id AS userId, b.title,
        DATE_FORMAT(l.due_at, '%Y%m%d%H%i%s') AS dueKey,
        DATE_FORMAT(l.due_at, '%b %e, %Y') AS dueDate
       FROM loans l JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
       JOIN users u ON u.id = l.borrower_user_id AND u.account_status = 'ACTIVE'
      WHERE l.status = 'ACTIVE' AND l.due_at >= UTC_TIMESTAMP()
        AND l.due_at < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 48 HOUR)
        AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                     WHERE ur.user_id = u.id AND r.code = 'STUDENT')`);
  for (const row of rows) {
    await databasePool.execute(
      `INSERT IGNORE INTO notifications (user_id, notification_type, title, body, dedupe_key)
       VALUES (?, 'LOAN_DUE_REMINDER', 'Book due soon', ?, ?)`,
      [row.userId, `“${row.title}” is due on ${row.dueDate}. Please return or renew it before the due date.`, `loan-due:${row.loanId}:${row.dueKey}`],
    );
  }
}
