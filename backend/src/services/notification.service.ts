import type { DatabaseConnection } from '../config/database.js';

export async function createNotification(
  connection: DatabaseConnection,
  userId: number,
  type: string,
  title: string,
  body: string,
): Promise<void> {
  await connection.execute(
    'INSERT INTO notifications (user_id, notification_type, title, body) VALUES (?, ?, ?, ?)',
    [userId, type, title, body],
  );
}
