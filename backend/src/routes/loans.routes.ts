import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import { writeAudit } from '../services/audit.service.js';
import { createNotification } from '../services/notification.service.js';
import { assignNextReservation } from '../services/reservation.service.js';
import type { AuthenticatedRequest } from '../types/auth.js';

export const loansRouter = Router();

loansRouter.get('/', requireAuth, async (request, response, next) => {
  try {
    const auth = (request as AuthenticatedRequest).auth;
    const status = typeof request.query.status === 'string' ? request.query.status.toUpperCase() : 'ACTIVE';
    const allowed = ['ACTIVE', 'RETURNED', 'LOST', 'ALL', 'OVERDUE'];
    if (!allowed.includes(status)) { response.status(400).json({ error: 'Invalid loan status filter.' }); return; }
    const studentOnly = auth.roles.includes('STUDENT') && !auth.roles.some((role) => role === 'ADMIN' || role === 'LIBRARIAN');
    const statusClause = status === 'ALL' ? '1 = 1'
      : status === 'OVERDUE' ? "l.status = 'ACTIVE' AND l.due_at < UTC_TIMESTAMP()"
        : 'l.status = ?';
    const values: (string | number)[] = [];
    if (status !== 'ALL' && status !== 'OVERDUE') values.push(status);
    if (studentOnly) values.push(auth.id);
    const [rows] = await databasePool.execute<any[]>(
      `SELECT l.id, l.status, l.checked_out_at AS checkedOutAt, l.due_at AS dueAt,
          l.returned_at AS returnedAt, l.return_condition AS returnCondition,
          b.title, b.cover_image_url AS coverImageUrl, bc.barcode, CONCAT(u.first_name, ' ', u.last_name) AS borrower, u.email AS borrowerEmail,
          u.id AS borrowerId, l.return_requested_at AS returnRequestedAt, l.return_requested_note AS returnRequestedNote,
           CASE WHEN l.status = 'ACTIVE' AND l.due_at < UTC_TIMESTAMP() THEN 1 ELSE 0 END AS isOverdue
        FROM loans l JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
        JOIN users u ON u.id = l.borrower_user_id
        WHERE ${statusClause}${studentOnly ? ' AND l.borrower_user_id = ?' : ''}
        ORDER BY CASE WHEN l.status = 'ACTIVE' AND l.due_at < UTC_TIMESTAMP() THEN 0 WHEN l.status = 'ACTIVE' THEN 1 ELSE 2 END,
          l.due_at ASC LIMIT 200`,
      values,
    );
    response.json({ items: rows });
  } catch (error) { next(error); }
});

loansRouter.post('/', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const copyId = Number(request.body?.copyId);
  const borrowerId = Number(request.body?.borrowerId);
  const reservationId = request.body?.reservationId == null ? null : Number(request.body.reservationId);
  if (!Number.isSafeInteger(copyId) || copyId < 1 || !Number.isSafeInteger(borrowerId) || borrowerId < 1) {
    response.status(400).json({ error: 'Select a valid book copy and student.' }); return;
  }
  if (reservationId !== null && (!Number.isSafeInteger(reservationId) || reservationId < 1)) { response.status(400).json({ error: 'Invalid reservation.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [borrowerRows] = await connection.execute<any[]>("SELECT id FROM users WHERE id = ? AND account_status = 'ACTIVE' FOR UPDATE", [borrowerId]);
    if (!borrowerRows.length) { await connection.rollback(); response.status(404).json({ error: 'Active borrower not found.' }); return; }
    const [roleRows] = await connection.execute<any[]>(
      `SELECT lp.loan_period_days AS loanPeriodDays, lp.max_active_loans AS maxActiveLoans
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         JOIN loan_policies lp ON lp.borrower_role_id = r.id AND lp.is_active = 1
        WHERE ur.user_id = ? AND r.code = 'STUDENT' LIMIT 1`, [borrowerId]);
    if (!roleRows.length) { await connection.rollback(); response.status(400).json({ error: 'This borrower has no active student borrowing policy.' }); return; }
    const [countRows] = await connection.execute<any[]>("SELECT COUNT(*) AS total FROM loans WHERE borrower_user_id = ? AND status = 'ACTIVE'", [borrowerId]);
    if (Number(countRows[0].total) >= Number(roleRows[0].maxActiveLoans)) { await connection.rollback(); response.status(409).json({ error: 'The student has reached the active-loan limit.' }); return; }
    const [copyRows] = await connection.execute<any[]>("SELECT id, book_id, copy_status AS copyStatus FROM book_copies WHERE id = ? FOR UPDATE", [copyId]);
    if (!copyRows.length || copyRows[0].copyStatus !== 'IN_SERVICE') { await connection.rollback(); response.status(409).json({ error: 'That book copy is unavailable.' }); return; }
    await connection.execute('SELECT id FROM books WHERE id = ? FOR UPDATE', [copyRows[0].book_id]);
    if (reservationId !== null) {
      const [reservationRows] = await connection.execute<any[]>(
        `SELECT id FROM reservations WHERE id = ? AND book_id = ? AND student_user_id = ?
          AND allocated_copy_id = ? AND status = 'READY' AND expires_at > UTC_TIMESTAMP() FOR UPDATE`,
        [reservationId, copyRows[0].book_id, borrowerId, copyId]);
      if (!reservationRows.length) { await connection.rollback(); response.status(409).json({ error: 'That reservation is not ready for this student and copy.' }); return; }
    } else {
      const [availabilityRows] = await connection.execute<any[]>(
        `SELECT NOT EXISTS (SELECT 1 FROM loans WHERE copy_id = ? AND status = 'ACTIVE')
          AND NOT EXISTS (SELECT 1 FROM reservations WHERE allocated_copy_id = ? AND status = 'READY')
          AND NOT EXISTS (SELECT 1 FROM reservations WHERE book_id = ? AND status = 'PENDING') AS available`, [copyId, copyId, copyRows[0].book_id]);
      if (!availabilityRows[0].available) { await connection.rollback(); response.status(409).json({ error: 'That copy is on loan, held, or queued for a reservation.' }); return; }
    }
    const [insert] = await connection.execute<any>(
      `INSERT INTO loans (copy_id, borrower_user_id, reservation_id, checked_out_by_user_id, checked_out_at, due_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))`,
      [copyId, borrowerId, reservationId, auth.id, Number(roleRows[0].loanPeriodDays)],
    );
    const loanId = Number(insert.insertId);
    if (reservationId !== null) {
      await connection.execute("UPDATE reservations SET status = 'FULFILLED', allocated_copy_id = NULL, closed_at = UTC_TIMESTAMP() WHERE id = ?", [reservationId]);
    }
    const [titleRows] = await connection.execute<any[]>('SELECT title FROM books WHERE id = ?', [copyRows[0].book_id]);
    await createNotification(connection, borrowerId, 'LOAN_CHECKED_OUT', 'Book checked out', `“${titleRows[0].title}” is checked out. It is due in ${roleRows[0].loanPeriodDays} days.`);
    await writeAudit(connection, auth.id, 'LOAN_CHECKED_OUT', 'loans', loanId, { copyId, borrowerId });
    await connection.commit();
    response.status(201).json({ id: loanId, message: 'Book checked out successfully.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

loansRouter.post('/:loanId/return', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const loanId = Number(request.params.loanId);
  const condition = request.body?.condition === 'DAMAGED' ? 'DAMAGED' : request.body?.condition === 'GOOD' ? 'GOOD' : null;
  const notes = typeof request.body?.notes === 'string' ? request.body.notes.trim().slice(0, 1000) : null;
  if (!Number.isSafeInteger(loanId) || loanId < 1 || !condition) { response.status(400).json({ error: 'Choose a valid loan and return condition.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [loanRows] = await connection.execute<any[]>("SELECT id, copy_id AS copyId, status FROM loans WHERE id = ? FOR UPDATE", [loanId]);
    if (!loanRows.length) { await connection.rollback(); response.status(404).json({ error: 'Loan not found.' }); return; }
    if (loanRows[0].status !== 'ACTIVE') { await connection.rollback(); response.status(409).json({ error: 'This loan has already been closed.' }); return; }
    await connection.execute(
      `UPDATE loans SET status = 'RETURNED', returned_at = UTC_TIMESTAMP(), returned_by_user_id = ?,
         return_condition = ?, return_notes = ? WHERE id = ?`, [auth.id, condition, notes || null, loanId]);
    await connection.execute('UPDATE book_copies SET copy_status = ? WHERE id = ?', [condition === 'DAMAGED' ? 'DAMAGED' : 'IN_SERVICE', loanRows[0].copyId]);
    const [borrowerRows] = await connection.execute<any[]>(
      `SELECT l.borrower_user_id AS borrowerId, b.title, bc.book_id AS bookId FROM loans l
        JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id WHERE l.id = ?`, [loanId]);
    await createNotification(connection, Number(borrowerRows[0].borrowerId), 'LOAN_RETURNED', 'Book return recorded', `The return of “${borrowerRows[0].title}” has been recorded.`);
    if (condition === 'GOOD') await assignNextReservation(connection, Number(borrowerRows[0].bookId), Number(loanRows[0].copyId));
    await writeAudit(connection, auth.id, 'LOAN_RETURNED', 'loans', loanId, { condition, notes: notes || null });
    await connection.commit();
    response.json({ message: condition === 'DAMAGED' ? 'Return recorded; copy marked damaged.' : 'Return recorded successfully.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

loansRouter.post('/:loanId/renew', requireAuth, async (request, response, next) => {
  const loanId = Number(request.params.loanId);
  if (!Number.isSafeInteger(loanId) || loanId < 1) { response.status(400).json({ error: 'Invalid loan.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const staff = auth.roles.includes('ADMIN') || auth.roles.includes('LIBRARIAN');
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [loanRows] = await connection.execute<any[]>(
      `SELECT l.id, l.borrower_user_id AS borrowerId, l.copy_id AS copyId, l.due_at AS dueAt,
          l.status, bc.book_id AS bookId, b.title
         FROM loans l JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
        WHERE l.id = ? FOR UPDATE`, [loanId]);
    if (!loanRows.length || (!staff && Number(loanRows[0].borrowerId) !== auth.id)) { await connection.rollback(); response.status(404).json({ error: 'Loan not found.' }); return; }
    const loan = loanRows[0];
    if (loan.status !== 'ACTIVE') { await connection.rollback(); response.status(409).json({ error: 'Only an active loan can be renewed.' }); return; }
    const [policyRows] = await connection.execute<any[]>(
      `SELECT lp.max_renewals AS maxRenewals, lp.renewal_extension_days AS extensionDays
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         JOIN loan_policies lp ON lp.borrower_role_id = r.id
        WHERE ur.user_id = ? AND r.code = 'STUDENT' AND lp.is_active = 1 LIMIT 1`, [loan.borrowerId]);
    if (!policyRows.length || Number(policyRows[0].maxRenewals) < 1) { await connection.rollback(); response.status(409).json({ error: 'Your borrowing policy does not allow renewals.' }); return; }
    const [renewalRows] = await connection.execute<any[]>("SELECT COUNT(*) AS total FROM renewals WHERE loan_id = ?", [loanId]);
    if (Number(renewalRows[0].total) >= Number(policyRows[0].maxRenewals)) { await connection.rollback(); response.status(409).json({ error: 'This loan has reached its renewal limit.' }); return; }
    const [overdueRows] = await connection.execute<any[]>("SELECT due_at < UTC_TIMESTAMP() AS overdue FROM loans WHERE id = ?", [loanId]);
    if (overdueRows[0].overdue) { await connection.rollback(); response.status(409).json({ error: 'Overdue loans cannot be renewed.' }); return; }
    const [queueRows] = await connection.execute<any[]>("SELECT id FROM reservations WHERE book_id = ? AND status IN ('PENDING','READY') LIMIT 1", [loan.bookId]);
    if (queueRows.length) { await connection.rollback(); response.status(409).json({ error: 'This title has a reservation queue, so the loan cannot be renewed.' }); return; }
    const renewalNumber = Number(renewalRows[0].total) + 1;
    await connection.execute(
      `INSERT INTO renewals (loan_id, renewal_number, renewed_by_user_id, old_due_at, new_due_at)
       VALUES (?, ?, ?, ?, DATE_ADD(?, INTERVAL ? DAY))`,
      [loanId, renewalNumber, auth.id, loan.dueAt, loan.dueAt, Number(policyRows[0].extensionDays)]);
    await connection.execute('UPDATE loans SET due_at = DATE_ADD(due_at, INTERVAL ? DAY) WHERE id = ?', [Number(policyRows[0].extensionDays), loanId]);
    const [dueRows] = await connection.execute<any[]>('SELECT due_at AS dueAt FROM loans WHERE id = ?', [loanId]);
    await createNotification(connection, Number(loan.borrowerId), 'LOAN_RENEWED', 'Loan renewed', `“${loan.title}” is now due ${new Date(dueRows[0].dueAt).toLocaleDateString()}.`);
    await writeAudit(connection, auth.id, 'LOAN_RENEWED', 'loans', loanId, { renewalNumber });
    await connection.commit();
    response.json({ message: 'Loan renewed.', dueAt: dueRows[0].dueAt });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

/* ---- Student-initiated return request ---- */
loansRouter.post('/:loanId/request-return', requireAuth, async (request, response, next) => {
  const loanId = Number(request.params.loanId);
  if (!Number.isSafeInteger(loanId) || loanId < 1) { response.status(400).json({ error: 'Invalid loan.' }); return; }
  const note = typeof request.body?.note === 'string' ? request.body.note.trim().slice(0, 500) : null;
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>(
      `SELECT l.id, l.borrower_user_id AS borrowerId, l.return_requested_at AS returnRequestedAt, b.title
         FROM loans l JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
        WHERE l.id = ? AND l.status = 'ACTIVE' FOR UPDATE`, [loanId]);
    if (!rows.length) { await connection.rollback(); response.status(404).json({ error: 'Active loan not found.' }); return; }
    if (Number(rows[0].borrowerId) !== auth.id) { await connection.rollback(); response.status(403).json({ error: 'You can only request returns for your own loans.' }); return; }
    if (rows[0].returnRequestedAt) { await connection.rollback(); response.status(409).json({ error: 'You have already requested a return for this book.' }); return; }
    await connection.execute(
      'UPDATE loans SET return_requested_at = UTC_TIMESTAMP(), return_requested_note = ? WHERE id = ?',
      [note || null, loanId]);
    /* Notify all staff about the incoming return */
    const [staffRows] = await connection.execute<any[]>(
      `SELECT DISTINCT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE r.code IN ('ADMIN','LIBRARIAN') AND u.account_status = 'ACTIVE'`);
    for (const staff of staffRows) {
      await createNotification(connection, Number(staff.id), 'RETURN_REQUESTED',
        'Student return request',
        `${auth.firstName} ${auth.lastName} wants to return "${rows[0].title}".${note ? ' Note: ' + note : ''}`);
    }
    await writeAudit(connection, auth.id, 'RETURN_REQUESTED', 'loans', loanId, { note: note || null });
    await connection.commit();
    response.json({ message: `Return requested for "${rows[0].title}". Please bring the book to the library desk.` });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

/* ---- Student cancels their return request ---- */
loansRouter.post('/:loanId/cancel-return', requireAuth, async (request, response, next) => {
  const loanId = Number(request.params.loanId);
  if (!Number.isSafeInteger(loanId) || loanId < 1) { response.status(400).json({ error: 'Invalid loan.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>(
      `SELECT l.id, l.borrower_user_id AS borrowerId, l.return_requested_at AS returnRequestedAt, b.title
         FROM loans l JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
        WHERE l.id = ? AND l.status = 'ACTIVE' FOR UPDATE`, [loanId]);
    if (!rows.length) { await connection.rollback(); response.status(404).json({ error: 'Active loan not found.' }); return; }
    if (Number(rows[0].borrowerId) !== auth.id) { await connection.rollback(); response.status(403).json({ error: 'You can only manage your own loans.' }); return; }
    if (!rows[0].returnRequestedAt) { await connection.rollback(); response.status(409).json({ error: 'No return request to cancel.' }); return; }
    await connection.execute(
      'UPDATE loans SET return_requested_at = NULL, return_requested_note = NULL WHERE id = ?', [loanId]);
    await writeAudit(connection, auth.id, 'RETURN_REQUEST_CANCELLED', 'loans', loanId, {});
    await connection.commit();
    response.json({ message: `Return request cancelled for "${rows[0].title}".` });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

loansRouter.post('/:loanId/lost', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const loanId = Number(request.params.loanId);
  if (!Number.isSafeInteger(loanId) || loanId < 1) { response.status(400).json({ error: 'Invalid loan.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>(
      `SELECT l.id, l.copy_id AS copyId, l.borrower_user_id AS borrowerId, b.title
         FROM loans l JOIN book_copies bc ON bc.id = l.copy_id JOIN books b ON b.id = bc.book_id
        WHERE l.id = ? AND l.status = 'ACTIVE' FOR UPDATE`, [loanId]);
    if (!rows.length) { await connection.rollback(); response.status(404).json({ error: 'Active loan not found.' }); return; }
    await connection.execute("UPDATE loans SET status = 'LOST', lost_at = UTC_TIMESTAMP() WHERE id = ?", [loanId]);
    await connection.execute("UPDATE book_copies SET copy_status = 'LOST' WHERE id = ?", [rows[0].copyId]);
    await createNotification(connection, Number(rows[0].borrowerId), 'LOAN_MARKED_LOST', 'Loan marked as lost', `The loan for “${rows[0].title}” was marked lost. Please contact the library.`);
    await writeAudit(connection, auth.id, 'LOAN_MARKED_LOST', 'loans', loanId, { copyId: Number(rows[0].copyId) });
    await connection.commit();
    response.json({ message: 'Loan and copy marked as lost.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

loansRouter.post('/:loanId/recover', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const loanId = Number(request.params.loanId);
  const condition = request.body?.condition === 'DAMAGED' ? 'DAMAGED' : request.body?.condition === 'GOOD' ? 'GOOD' : null;
  if (!Number.isSafeInteger(loanId) || loanId < 1 || !condition) { response.status(400).json({ error: 'Choose a valid lost loan and recovery condition.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>(
      `SELECT l.id, l.copy_id AS copyId, l.borrower_user_id AS borrowerId,
          b.id AS bookId, b.title FROM loans l JOIN book_copies bc ON bc.id = l.copy_id
          JOIN books b ON b.id = bc.book_id WHERE l.id = ? AND l.status = 'LOST' FOR UPDATE`, [loanId]);
    if (!rows.length) { await connection.rollback(); response.status(404).json({ error: 'Lost loan not found.' }); return; }
    await connection.execute(
      `UPDATE loans SET status = 'RETURNED', returned_at = UTC_TIMESTAMP(), returned_by_user_id = ?,
         return_condition = ?, return_notes = 'Recovered after being marked lost', lost_at = NULL WHERE id = ?`,
      [auth.id, condition, loanId]);
    await connection.execute('UPDATE book_copies SET copy_status = ? WHERE id = ?', [condition === 'GOOD' ? 'IN_SERVICE' : 'DAMAGED', rows[0].copyId]);
    await createNotification(connection, Number(rows[0].borrowerId), 'LOAN_RECOVERED', 'Lost book recovered', `The lost copy of “${rows[0].title}” has been recovered and its loan record updated.`);
    if (condition === 'GOOD') await assignNextReservation(connection, Number(rows[0].bookId), Number(rows[0].copyId));
    await writeAudit(connection, auth.id, 'LOAN_RECOVERED', 'loans', loanId, { condition });
    await connection.commit();
    response.json({ message: 'Recovery recorded and loan history updated.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

loansRouter.get('/borrowers', requireRoles('ADMIN', 'LIBRARIAN'), async (_request, response, next) => {
  try {
    const [rows] = await databasePool.query<any[]>(
      `SELECT u.id, u.username, CONCAT(u.first_name, ' ', u.last_name) AS name,
          sp.student_number AS studentNumber,
          (SELECT COUNT(*) FROM loans l WHERE l.borrower_user_id = u.id AND l.status = 'ACTIVE') AS activeLoans,
          (SELECT lp.max_active_loans FROM loan_policies lp JOIN roles sr ON sr.id = lp.borrower_role_id
            JOIN user_roles sur ON sur.role_id = sr.id AND sur.user_id = u.id
           WHERE sr.code = 'STUDENT' AND lp.is_active = 1 LIMIT 1) AS maxActiveLoans
       FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE r.code = 'STUDENT' AND u.account_status = 'ACTIVE'
       ORDER BY u.last_name, u.first_name LIMIT 500`);
    response.json({ items: rows });
  } catch (error) { next(error); }
});
