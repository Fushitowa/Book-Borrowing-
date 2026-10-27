import type { PoolConnection } from 'mysql2/promise';
import { databasePool } from '../config/database.js';
import { createNotification } from './notification.service.js';

export async function assignNextReservation(
  connection: PoolConnection,
  bookId: number,
  copyId: number,
): Promise<number | null> {
  const [rows] = await connection.execute<any[]>(
    `SELECT id, student_user_id AS studentUserId FROM reservations
      WHERE book_id = ? AND status = 'PENDING' ORDER BY requested_at, id LIMIT 1 FOR UPDATE`, [bookId]);
  if (!rows.length) return null;
  const reservationId = Number(rows[0].id);
  const studentId = Number(rows[0].studentUserId);
  await connection.execute(
    `UPDATE reservations SET status = 'READY', allocated_copy_id = ?, ready_at = UTC_TIMESTAMP(),
       expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE id = ?`, [copyId, reservationId]);
  await createNotification(connection, studentId, 'RESERVATION_READY', 'Your reserved book is ready', 'Please collect your reserved book within two days.');
  return reservationId;
}

export async function expireReadyReservations(): Promise<void> {
  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [expired] = await connection.execute<any[]>(
      `SELECT id, book_id AS bookId, allocated_copy_id AS copyId, student_user_id AS studentId
         FROM reservations WHERE status = 'READY' AND expires_at <= UTC_TIMESTAMP() FOR UPDATE`);
    for (const row of expired) {
      await connection.execute("UPDATE reservations SET status = 'EXPIRED', allocated_copy_id = NULL, closed_at = UTC_TIMESTAMP() WHERE id = ?", [row.id]);
      if (row.copyId) await assignNextReservation(connection, Number(row.bookId), Number(row.copyId));
      await createNotification(connection, Number(row.studentId), 'RESERVATION_EXPIRED', 'Reservation expired', 'Your reserved book was not collected in time. You can place a new reservation if needed.');
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
