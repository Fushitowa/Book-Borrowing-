import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import { writeAudit } from '../services/audit.service.js';
import { createNotification } from '../services/notification.service.js';
import { assignNextReservation, expireReadyReservations } from '../services/reservation.service.js';
import type { AuthenticatedRequest } from '../types/auth.js';

export const reservationsRouter = Router();

reservationsRouter.get('/', requireAuth, async (request, response, next) => {
  const auth = (request as AuthenticatedRequest).auth;
  const staff = auth.roles.includes('ADMIN') || auth.roles.includes('LIBRARIAN');
  try {
    await expireReadyReservations();
    const [rows] = await databasePool.execute<any[]>(
      `SELECT r.id, r.book_id AS bookId, r.student_user_id AS studentId, r.allocated_copy_id AS copyId,
          r.status, r.requested_at AS requestedAt, r.ready_at AS readyAt, r.expires_at AS expiresAt,
          b.title, bc.barcode, CONCAT(u.first_name, ' ', u.last_name) AS student
         FROM reservations r JOIN books b ON b.id = r.book_id JOIN users u ON u.id = r.student_user_id
         LEFT JOIN book_copies bc ON bc.id = r.allocated_copy_id
        WHERE (? = 1 OR r.student_user_id = ?) ORDER BY FIELD(r.status, 'READY', 'PENDING', 'FULFILLED', 'EXPIRED', 'CANCELLED'), r.requested_at DESC LIMIT 250`,
      [staff ? 1 : 0, auth.id]);
    response.json({ items: rows });
  } catch (error) { next(error); }
});

reservationsRouter.post('/', requireAuth, async (request, response, next) => {
  const auth = (request as AuthenticatedRequest).auth;
  if (!auth.roles.includes('STUDENT')) { response.status(403).json({ error: 'Only student accounts can place reservations.' }); return; }
  const bookId = Number(request.body?.bookId);
  if (!Number.isSafeInteger(bookId) || bookId < 1) { response.status(400).json({ error: 'Choose a valid catalog title.' }); return; }
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [auth.id]);
    await connection.execute('SELECT id FROM books WHERE id = ? FOR UPDATE', [bookId]);
    const [bookRows] = await connection.execute<any[]>(
      `SELECT b.id, b.title,
          EXISTS (SELECT 1 FROM book_copies bc WHERE bc.book_id = b.id AND bc.copy_status = 'IN_SERVICE') AS hasServiceCopies,
          EXISTS (SELECT 1 FROM book_copies bc WHERE bc.book_id = b.id AND bc.copy_status = 'IN_SERVICE'
        AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id = bc.id AND l.status = 'ACTIVE')
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.allocated_copy_id = bc.id AND r.status = 'READY')) AS isAvailable
       FROM books b WHERE b.id = ?`, [bookId]);
    if (!bookRows.length) { await connection.rollback(); response.status(404).json({ error: 'Book title not found.' }); return; }
    if (!bookRows[0].hasServiceCopies) { await connection.rollback(); response.status(409).json({ error: 'This title currently has no copies in service to reserve.' }); return; }
    if (bookRows[0].isAvailable) { await connection.rollback(); response.status(409).json({ error: 'A copy is available now. Ask library staff to check it out instead.' }); return; }
    const [policies] = await connection.execute<any[]>(
      `SELECT lp.max_active_reservations AS maxReservations FROM loan_policies lp
        JOIN user_roles ur ON ur.role_id = lp.borrower_role_id
       WHERE ur.user_id = ? AND lp.is_active = 1 LIMIT 1`, [auth.id]);
    if (!policies.length || Number(policies[0].maxReservations) < 1) { await connection.rollback(); response.status(400).json({ error: 'Your account has no active reservation allowance.' }); return; }
    const [counts] = await connection.execute<any[]>("SELECT COUNT(*) AS total FROM reservations WHERE student_user_id = ? AND status IN ('PENDING','READY')", [auth.id]);
    if (Number(counts[0].total) >= Number(policies[0].maxReservations)) { await connection.rollback(); response.status(409).json({ error: 'You have reached your active reservation limit.' }); return; }
    const [insert] = await connection.execute<any>('INSERT INTO reservations (book_id, student_user_id) VALUES (?, ?)', [bookId, auth.id]);
    const reservationId = Number(insert.insertId);
    await createNotification(connection, auth.id, 'RESERVATION_PLACED', 'Reservation placed', `You are in the reservation queue for “${bookRows[0].title}”.`);
    await writeAudit(connection, auth.id, 'RESERVATION_PLACED', 'reservations', reservationId, { bookId });
    await connection.commit();
    response.status(201).json({ id: reservationId, message: 'Reservation added to the queue.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

reservationsRouter.post('/:reservationId/cancel', requireAuth, async (request, response, next) => {
  const auth = (request as AuthenticatedRequest).auth;
  const staff = auth.roles.includes('ADMIN') || auth.roles.includes('LIBRARIAN');
  const reservationId = Number(request.params.reservationId);
  if (!Number.isSafeInteger(reservationId) || reservationId < 1) { response.status(400).json({ error: 'Invalid reservation.' }); return; }
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<any[]>(
      `SELECT id, book_id AS bookId, student_user_id AS studentId, allocated_copy_id AS copyId, status
         FROM reservations WHERE id = ? FOR UPDATE`, [reservationId]);
    if (!rows.length || (!staff && Number(rows[0].studentId) !== auth.id)) { await connection.rollback(); response.status(404).json({ error: 'Reservation not found.' }); return; }
    if (!['PENDING', 'READY'].includes(rows[0].status)) { await connection.rollback(); response.status(409).json({ error: 'This reservation is already closed.' }); return; }
    await connection.execute("UPDATE reservations SET status = 'CANCELLED', allocated_copy_id = NULL, closed_at = UTC_TIMESTAMP() WHERE id = ?", [reservationId]);
    if (rows[0].copyId) await assignNextReservation(connection, Number(rows[0].bookId), Number(rows[0].copyId));
    await writeAudit(connection, auth.id, 'RESERVATION_CANCELLED', 'reservations', reservationId, { priorStatus: rows[0].status });
    await connection.commit();
    response.json({ message: 'Reservation cancelled.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

reservationsRouter.get('/ready', requireRoles('ADMIN', 'LIBRARIAN'), async (_request, response, next) => {
  try {
    await expireReadyReservations();
    const [rows] = await databasePool.query<any[]>(
      `SELECT r.id AS reservationId, r.student_user_id AS borrowerId, r.allocated_copy_id AS copyId,
          bc.barcode, b.title, CONCAT(u.first_name, ' ', u.last_name) AS borrower,
          r.expires_at AS expiresAt
         FROM reservations r JOIN users u ON u.id = r.student_user_id
         JOIN books b ON b.id = r.book_id JOIN book_copies bc ON bc.id = r.allocated_copy_id
        WHERE r.status = 'READY' AND r.expires_at > UTC_TIMESTAMP() ORDER BY r.ready_at, r.id`);
    response.json({ items: rows });
  } catch (error) { next(error); }
});
