import type { PoolConnection } from 'mysql2/promise';

export async function createNotification(
  connection: PoolConnection,
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
