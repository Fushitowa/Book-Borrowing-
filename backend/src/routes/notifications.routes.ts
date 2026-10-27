import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../types/auth.js';

export const notificationsRouter = Router();
notificationsRouter.get('/', requireAuth, async (request, response, next) => {
  try {
    const userId = (request as AuthenticatedRequest).auth.id;
    const [rows] = await databasePool.execute<any[]>(
      `SELECT id, notification_type AS type, title, body, created_at AS createdAt, read_at AS readAt
         FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [userId]);
    response.json({ items: rows, unread: rows.filter((row) => !row.readAt).length });
  } catch (error) { next(error); }
});

notificationsRouter.post('/:notificationId/read', requireAuth, async (request, response, next) => {
  const userId = (request as AuthenticatedRequest).auth.id;
  const id = Number(request.params.notificationId);
  if (!Number.isSafeInteger(id) || id < 1) { response.status(400).json({ error: 'Invalid notification.' }); return; }
  try {
    await databasePool.execute('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND read_at IS NULL', [id, userId]);
    response.json({ message: 'Notification marked as read.' });
  } catch (error) { next(error); }
});
