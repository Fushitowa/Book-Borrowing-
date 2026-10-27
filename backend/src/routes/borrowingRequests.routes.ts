import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import { createNotification } from '../services/notification.service.js';
import { writeAudit } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../types/auth.js';

export const borrowingRequestsRouter = Router();

borrowingRequestsRouter.get('/', requireAuth, async (request, response, next) => {
  const auth = (request as AuthenticatedRequest).auth;
  const staff = auth.roles.includes('ADMIN') || auth.roles.includes('LIBRARIAN');
  const status = typeof request.query.status === 'string' ? request.query.status.toUpperCase() : 'ALL';
  if (!['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'ISSUED'].includes(status)) { response.status(400).json({ error: 'Invalid request status.' }); return; }
  try {
    const [items] = await databasePool.execute<any[]>(
      `SELECT br.id, br.book_id AS bookId, br.student_user_id AS studentId, br.status,
          br.student_note AS studentNote, br.response_reason AS responseReason, br.loan_id AS loanId,
          br.requested_at AS requestedAt, br.resolved_at AS resolvedAt,
          br.issued_at AS issuedAt,
          b.title,
          (SELECT GROUP_CONCAT(a.display_name ORDER BY ba.author_order SEPARATOR ', ')
             FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id) AS authors,
          CONCAT(s.first_name, ' ', s.last_name) AS student,
          sp.student_number AS studentNumber,
          (SELECT COUNT(*) FROM book_copies bc WHERE bc.book_id = b.id AND bc.copy_status = 'IN_SERVICE'
            AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id = bc.id AND l.status = 'ACTIVE')
            AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.allocated_copy_id = bc.id AND r.status = 'READY')
            AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.book_id = b.id AND r.status = 'PENDING')) AS availableCopies
         FROM borrowing_requests br JOIN books b ON b.id = br.book_id
         JOIN users s ON s.id = br.student_user_id LEFT JOIN student_profiles sp ON sp.user_id = s.id
        WHERE (? = 1 OR br.student_user_id = ?) AND (? = 'ALL' OR br.status = ?)
        ORDER BY ${staff ? "FIELD(br.status, 'PENDING', 'APPROVED', 'REJECTED', 'ISSUED'), br.requested_at ASC" : 'br.requested_at DESC'} LIMIT 250`,
      [staff ? 1 : 0, auth.id, status, status]);
    response.json({ items });
  } catch (error) { next(error); }
});

borrowingRequestsRouter.post('/', requireRoles('STUDENT'), async (request, response, next) => {
  const auth = (request as AuthenticatedRequest).auth;
  const bookId = Number(request.body?.bookId);
  const studentNote = typeof request.body?.studentNote === 'string' ? request.body.studentNote.trim() : '';
  if (!Number.isSafeInteger(bookId) || bookId < 1 || studentNote.length > 500) { response.status(400).json({ error: 'Choose a valid book. Notes must be 500 characters or fewer.' }); return; }
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [studentRows] = await connection.execute<any[]>("SELECT id FROM users WHERE id = ? AND account_status = 'ACTIVE' FOR UPDATE", [auth.id]);
    if (!studentRows.length) { await connection.rollback(); response.status(403).json({ error: 'Your student account is not active.' }); return; }
    const [policyRows] = await connection.execute<any[]>(
      `SELECT lp.max_active_loans FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        JOIN loan_policies lp ON lp.borrower_role_id = r.id AND lp.is_active = 1
       WHERE ur.user_id = ? AND r.code = 'STUDENT' LIMIT 1`, [auth.id]);
    if (!policyRows.length) { await connection.rollback(); response.status(409).json({ error: 'No active student borrowing policy is configured.' }); return; }
    const [activeLoans] = await connection.execute<any[]>("SELECT COUNT(*) AS total FROM loans WHERE borrower_user_id = ? AND status = 'ACTIVE'", [auth.id]);
    if (Number(activeLoans[0].total) >= Number(policyRows[0].max_active_loans)) { await connection.rollback(); response.status(409).json({ error: 'You have reached the active-loan limit.' }); return; }
    const [books] = await connection.execute<any[]>(
      `SELECT b.id, b.title, EXISTS (SELECT 1 FROM book_copies bc WHERE bc.book_id = b.id AND bc.copy_status = 'IN_SERVICE'
        AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id = bc.id AND l.status = 'ACTIVE')
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.allocated_copy_id = bc.id AND r.status = 'READY')
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.book_id = b.id AND r.status = 'PENDING')) AS hasAvailableCopy
       FROM books b WHERE b.id = ? FOR UPDATE`, [bookId]);
    if (!books.length) { await connection.rollback(); response.status(404).json({ error: 'Book not found.' }); return; }
    if (!books[0].hasAvailableCopy) { await connection.rollback(); response.status(409).json({ error: 'No copy is available to request right now. Join the reservation queue instead.' }); return; }
    const [insert] = await connection.execute<any>(
      'INSERT INTO borrowing_requests (student_user_id, book_id, student_note) VALUES (?, ?, ?)',
      [auth.id, bookId, studentNote || null]);
    const id = Number(insert.insertId);
    await writeAudit(connection, auth.id, 'BORROWING_REQUEST_SUBMITTED', 'borrowing_requests', id, { bookId });
    await connection.commit();
    response.status(201).json({ id, message: 'Borrowing request sent to the library.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

borrowingRequestsRouter.post('/:requestId/approve', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const id = Number(request.params.requestId);
  if (!Number.isSafeInteger(id) || id < 1) { response.status(400).json({ error: 'Select a valid request.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.execute<any[]>("SELECT id, student_user_id AS studentId, book_id AS bookId, status FROM borrowing_requests WHERE id = ? FOR UPDATE", [id]);
    if (!requests.length || requests[0].status !== 'PENDING') { await connection.rollback(); response.status(409).json({ error: 'This borrowing request is no longer pending.' }); return; }
    const row = requests[0];
    const [studentRows] = await connection.execute<any[]>("SELECT id FROM users WHERE id = ? AND account_status = 'ACTIVE' FOR UPDATE", [row.studentId]);
    if (!studentRows.length) { await connection.rollback(); response.status(409).json({ error: 'Student account is not active.' }); return; }
    const [policyRows] = await connection.execute<any[]>(
      `SELECT lp.max_active_loans FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        JOIN loan_policies lp ON lp.borrower_role_id = r.id AND lp.is_active = 1
       WHERE ur.user_id = ? AND r.code = 'STUDENT' LIMIT 1`, [row.studentId]);
    if (!policyRows.length) { await connection.rollback(); response.status(409).json({ error: 'No active student borrowing policy is configured.' }); return; }
    const [counts] = await connection.execute<any[]>("SELECT COUNT(*) AS total FROM loans WHERE borrower_user_id = ? AND status = 'ACTIVE'", [row.studentId]);
    if (Number(counts[0].total) >= Number(policyRows[0].max_active_loans)) { await connection.rollback(); response.status(409).json({ error: 'This student has reached the active-loan limit.' }); return; }
    await connection.execute("UPDATE borrowing_requests SET status = 'APPROVED', handled_by_user_id = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ?", [auth.id, id]);
    const [[book]] = await connection.execute<any[]>('SELECT title FROM books WHERE id = ?', [row.bookId]);
    await createNotification(connection, Number(row.studentId), 'BORROWING_REQUEST_APPROVED', 'Borrowing request approved', `Your request for “${book.title}” was approved. A librarian will issue a physical copy separately.`);
    await writeAudit(connection, auth.id, 'BORROWING_REQUEST_APPROVED', 'borrowing_requests', id, { studentId: Number(row.studentId) });
    await connection.commit();
    response.json({ message: 'Request approved. Issue the physical copy when the student collects it.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

borrowingRequestsRouter.post('/:requestId/issue', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const id = Number(request.params.requestId);
  const copyId = Number(request.body?.copyId);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(copyId) || copyId < 1) { response.status(400).json({ error: 'Select a valid request and physical copy.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [requests] = await connection.execute<any[]>("SELECT id, student_user_id AS studentId, book_id AS bookId, status FROM borrowing_requests WHERE id = ? FOR UPDATE", [id]);
    if (!requests.length || requests[0].status !== 'APPROVED') { await connection.rollback(); response.status(409).json({ error: 'Only an approved request can be issued.' }); return; }
    const row = requests[0];
    const [studentRows] = await connection.execute<any[]>("SELECT id FROM users WHERE id = ? AND account_status = 'ACTIVE' FOR UPDATE", [row.studentId]);
    if (!studentRows.length) { await connection.rollback(); response.status(409).json({ error: 'Student account is not active.' }); return; }
    const [policyRows] = await connection.execute<any[]>(
      `SELECT lp.loan_period_days AS loanPeriodDays, lp.max_active_loans AS maxActiveLoans
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN loan_policies lp ON lp.borrower_role_id = r.id AND lp.is_active = 1
        WHERE ur.user_id = ? AND r.code = 'STUDENT' LIMIT 1`, [row.studentId]);
    if (!policyRows.length) { await connection.rollback(); response.status(409).json({ error: 'No active student borrowing policy is configured.' }); return; }
    const [counts] = await connection.execute<any[]>("SELECT COUNT(*) AS total FROM loans WHERE borrower_user_id = ? AND status = 'ACTIVE'", [row.studentId]);
    if (Number(counts[0].total) >= Number(policyRows[0].maxActiveLoans)) { await connection.rollback(); response.status(409).json({ error: 'This student has reached the active-loan limit.' }); return; }
    const [copies] = await connection.execute<any[]>("SELECT id, book_id AS bookId, copy_status AS copyStatus FROM book_copies WHERE id = ? FOR UPDATE", [copyId]);
    if (!copies.length || Number(copies[0].bookId) !== Number(row.bookId) || copies[0].copyStatus !== 'IN_SERVICE') { await connection.rollback(); response.status(409).json({ error: 'Select an in-service copy of the requested book.' }); return; }
    const [available] = await connection.execute<any[]>(
      `SELECT NOT EXISTS (SELECT 1 FROM loans WHERE copy_id = ? AND status = 'ACTIVE')
        AND NOT EXISTS (SELECT 1 FROM reservations WHERE allocated_copy_id = ? AND status = 'READY')
        AND NOT EXISTS (SELECT 1 FROM reservations WHERE book_id = ? AND status = 'PENDING') AS available`, [copyId, copyId, row.bookId]);
    if (!available[0].available) { await connection.rollback(); response.status(409).json({ error: 'That copy is no longer available.' }); return; }
    const [loanInsert] = await connection.execute<any>(
      `INSERT INTO loans (copy_id, borrower_user_id, checked_out_by_user_id, checked_out_at, due_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))`,
      [copyId, row.studentId, auth.id, policyRows[0].loanPeriodDays]);
    const loanId = Number(loanInsert.insertId);
    await connection.execute("UPDATE borrowing_requests SET status = 'ISSUED', loan_id = ?, issued_by_user_id = ?, issued_at = UTC_TIMESTAMP() WHERE id = ?", [loanId, auth.id, id]);
    const [[book]] = await connection.execute<any[]>('SELECT title FROM books WHERE id = ?', [row.bookId]);
    await createNotification(connection, Number(row.studentId), 'BORROWING_REQUEST_ISSUED', 'Book checked out', `You have checked out “${book.title}”. It is due in ${policyRows[0].loanPeriodDays} days.`);
    await writeAudit(connection, auth.id, 'BORROWING_REQUEST_ISSUED', 'borrowing_requests', id, { loanId, copyId, studentId: Number(row.studentId) });
    await connection.commit();
    response.json({ message: 'Physical copy issued and loan recorded.', loanId });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

borrowingRequestsRouter.post('/:requestId/reject', requireRoles('ADMIN', 'LIBRARIAN'), async (request, response, next) => {
  const id = Number(request.params.requestId);
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
  if (!Number.isSafeInteger(id) || id < 1 || !reason || reason.length > 500) { response.status(400).json({ error: 'Provide a rejection reason of 1–500 characters.' }); return; }
  const auth = (request as AuthenticatedRequest).auth;
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>("SELECT id, student_user_id AS studentId, status FROM borrowing_requests WHERE id = ? FOR UPDATE", [id]);
    if (!rows.length || rows[0].status !== 'PENDING') { await connection.rollback(); response.status(409).json({ error: 'This borrowing request is no longer pending.' }); return; }
    await connection.execute("UPDATE borrowing_requests SET status = 'REJECTED', handled_by_user_id = ?, response_reason = ?, resolved_at = UTC_TIMESTAMP() WHERE id = ?", [auth.id, reason, id]);
    await createNotification(connection, Number(rows[0].studentId), 'BORROWING_REQUEST_REJECTED', 'Borrowing request declined', reason);
    await writeAudit(connection, auth.id, 'BORROWING_REQUEST_REJECTED', 'borrowing_requests', id, { reason });
    await connection.commit();
    response.json({ message: 'Request declined and the student was notified.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});
