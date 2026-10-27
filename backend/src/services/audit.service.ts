import type { PoolConnection } from 'mysql2/promise';

export async function writeAudit(
  connection: PoolConnection,
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  newValues: unknown,
): Promise<void> {
  await connection.execute(
    'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_values) VALUES (?, ?, ?, ?, ?)',
    [actorId, action, entityType, entityId, newValues == null ? null : JSON.stringify(newValues)],
  );
}
