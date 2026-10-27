import { Router } from 'express';
import { databasePool } from '../config/database.js';
import { requireRoles } from '../middleware/auth.middleware.js';
import { writeAudit } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../types/auth.js';

export const adminRouter = Router();

adminRouter.get('/audit-logs', requireRoles('ADMIN'), async (_request, response, next) => {
  try {
    const [items] = await databasePool.query<any[]>(
      `SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId,
          a.old_values AS oldValues, a.new_values AS newValues, a.created_at AS createdAt,
          COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'System') AS actor
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC, a.id DESC LIMIT 200`);
    response.json({ items });
  } catch (error) { next(error); }
});

adminRouter.get('/settings/student-policy', requireRoles('ADMIN'), async (_request, response, next) => {
  try {
    const [rows] = await databasePool.query<any[]>(
      `SELECT lp.id, lp.loan_period_days AS loanPeriodDays, lp.max_active_loans AS maxActiveLoans,
          lp.max_renewals AS maxRenewals, lp.renewal_extension_days AS renewalExtensionDays,
          lp.max_active_reservations AS maxActiveReservations
         FROM loan_policies lp JOIN roles r ON r.id = lp.borrower_role_id
        WHERE r.code = 'STUDENT' AND lp.is_active = 1 LIMIT 1`);
    if (!rows.length) { response.status(404).json({ error: 'No active student borrowing policy was found.' }); return; }
    response.json({ policy: rows[0] });
  } catch (error) { next(error); }
});

adminRouter.put('/settings/student-policy', requireRoles('ADMIN'), async (request, response, next) => {
  const values = {
    loanPeriodDays: request.body?.loanPeriodDays,
    maxActiveLoans: request.body?.maxActiveLoans,
    maxRenewals: request.body?.maxRenewals,
    renewalExtensionDays: request.body?.renewalExtensionDays,
    maxActiveReservations: request.body?.maxActiveReservations,
  };
  const valid = Number.isInteger(values.loanPeriodDays) && values.loanPeriodDays >= 1 && values.loanPeriodDays <= 365
    && Number.isInteger(values.maxActiveLoans) && values.maxActiveLoans >= 1 && values.maxActiveLoans <= 50
    && Number.isInteger(values.maxRenewals) && values.maxRenewals >= 0 && values.maxRenewals <= 10
    && Number.isInteger(values.renewalExtensionDays) && values.renewalExtensionDays >= 0 && values.renewalExtensionDays <= 365
    && Number.isInteger(values.maxActiveReservations) && values.maxActiveReservations >= 0 && values.maxActiveReservations <= 50;
  if (!valid) { response.status(400).json({ error: 'Enter valid policy limits within the displayed ranges.' }); return; }

  const connection = await databasePool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<any[]>(
      `SELECT lp.id, lp.loan_period_days AS loanPeriodDays, lp.max_active_loans AS maxActiveLoans,
          lp.max_renewals AS maxRenewals, lp.renewal_extension_days AS renewalExtensionDays,
          lp.max_active_reservations AS maxActiveReservations
         FROM loan_policies lp JOIN roles r ON r.id = lp.borrower_role_id
        WHERE r.code = 'STUDENT' AND lp.is_active = 1 LIMIT 1 FOR UPDATE`);
    if (!rows.length) { await connection.rollback(); response.status(404).json({ error: 'No active student borrowing policy was found.' }); return; }
    const previous = rows[0];
    await connection.execute(
      `UPDATE loan_policies SET loan_period_days = ?, max_active_loans = ?, max_renewals = ?,
          renewal_extension_days = ?, max_active_reservations = ? WHERE id = ?`,
      [values.loanPeriodDays, values.maxActiveLoans, values.maxRenewals, values.renewalExtensionDays, values.maxActiveReservations, previous.id]);
    await writeAudit(connection, (request as AuthenticatedRequest).auth.id, 'STUDENT_LOAN_POLICY_UPDATED', 'loan_policies', Number(previous.id), { oldValues: previous, newValues: values });
    await connection.commit();
    response.json({ policy: values, message: 'Student borrowing policy updated.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});
