import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { date } from '../utils/format';
import type { DashboardData, NotificationItem } from '../types';
import type { Notice } from '../types/app';

type AuditItem = { id: number; action: string; entityType: string; entityId: number | null; oldValues: unknown; newValues: unknown; createdAt: string; actor: string };
type StudentPolicy = { loanPeriodDays: number; maxActiveLoans: number; maxRenewals: number; renewalExtensionDays: number; maxActiveReservations: number };

function PageHeading({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>;
}

export function AdminReports({ notify, isLibrarian = false }: { notify: (notice: Notice) => void; isLibrarian?: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<DashboardData>('/dashboard/stats').then(setData).catch((error) => notify({ kind: 'error', message: error.message })).finally(() => setLoading(false)); }, [notify]);
  const stats = data?.stats;
  const exportSummary = () => {
    if (!stats) return;
    const rows = [['Metric', 'Count'], ['Total book copies', stats.totalCopies], ['Registered students', stats.students], ['Currently borrowed', stats.activeLoans], ['Overdue loans', stats.overdueLoans], ['Catalog titles', stats.titles], ['Available copies', stats.availableCopies]];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `carbonell-library-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  };
  const cards = [
    ['Total book copies', stats?.totalCopies, 'Physical items in the catalog', '▤', 'sage'],
    ['Registered students', stats?.students, 'Active student accounts', '♙', 'blue'],
    ['Currently borrowed', stats?.activeLoans, 'Active loans', '↗', 'gold'],
    ['Overdue loans', stats?.overdueLoans, 'Past their due date', '◷', 'rose'],
  ] as const;
  return <><PageHeading eyebrow={isLibrarian ? 'LIBRARY OPERATIONS · REPORTS' : 'ADMINISTRATION · REPORTS'} title={isLibrarian ? 'Reports' : 'Reports & analytics'} subtitle="Current collection and circulation totals from the live library database."><button className="primary-button" onClick={exportSummary} disabled={!stats}>Export summary CSV</button></PageHeading><div className="stat-grid">{cards.map(([label, value, note, glyph, tint]) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tint}`}>{glyph}</span></div><div className="stat-value">{loading ? <span className="skeleton" /> : value ?? 0}</div><div className="stat-note">{note}</div></div>)}</div><section className="surface catalog-surface admin-report-details"><div className="section-heading"><div><h2>Collection snapshot</h2><p>Availability is calculated from copies, active loans, and ready reservations.</p></div></div><div className="admin-report-list"><div><span>Catalog titles</span><strong>{loading ? '—' : stats?.titles ?? 0}</strong></div><div><span>Copies available now</span><strong>{loading ? '—' : stats?.availableCopies ?? 0}</strong></div><div><span>Report generated</span><strong>{new Date().toLocaleString()}</strong></div></div></section></>;
}

export function AdminNotifications({ notify, isStudent = false }: { notify: (notice: Notice) => void; isStudent?: boolean }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => { setLoading(true); api<{ items: NotificationItem[] }>('/notifications').then((result) => setItems(result.items)).catch((error) => notify({ kind: 'error', message: error.message })).finally(() => setLoading(false)); }, [notify]);
  useEffect(load, [load]);
  const markRead = async (item: NotificationItem) => {
    try { await api(`/notifications/${item.id}/read`, { method: 'POST' }); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not update notification.' }); }
  };
  return <><PageHeading eyebrow={isStudent ? 'MY LIBRARY · UPDATES' : 'ADMINISTRATION · UPDATES'} title="Notifications" subtitle={isStudent ? 'Due-date reminders and updates about your borrowing requests and reservations.' : 'Library updates for your administrator account.'}/><section className="surface admin-list-surface">{loading ? <div className="empty-state">Loading notifications…</div> : items.length ? items.map((item) => <button key={item.id} className={`admin-notification-row ${item.readAt ? 'read' : ''}`} onClick={() => !item.readAt && markRead(item)}><span className="notification-dot"/><span><strong>{item.title}</strong><small>{item.body}</small></span><time>{date(item.createdAt)}</time><StatusPill label={item.readAt ? 'Read' : 'New'} tone={item.readAt ? 'neutral' : 'success'} /></button>) : <div className="empty-state">No notifications for this account.</div>}</section></>;
}

export function AdminAuditLogs({ notify }: { notify: (notice: Notice) => void }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<{ items: AuditItem[] }>('/admin/audit-logs').then((result) => setItems(result.items)).catch((error) => notify({ kind: 'error', message: error.message })).finally(() => setLoading(false)); }, [notify]);
  return <><PageHeading eyebrow="ADMINISTRATION · SECURITY" title="Audit logs" subtitle="A chronological record of account, catalog, and circulation changes."/><section className="surface catalog-surface"><div className="section-heading"><div><h2>Recent audit events</h2><p>Showing the latest {items.length} events (up to 200).</p></div><span className="results-count">{items.length} events</span></div>{loading ? <div className="empty-state">Loading audit events…</div> : items.length ? <div className="table-scroll"><table><thead><tr><th>WHEN</th><th>ACTOR</th><th>ACTION</th><th>RECORD</th><th>DETAILS</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.actor}</td><td><span className="audit-action">{item.action.replace(/_/g, ' ')}</span></td><td>{item.entityType}{item.entityId ? ` #${item.entityId}` : ''}</td><td><details className="audit-details"><summary>View</summary><pre>{JSON.stringify({ oldValues: item.oldValues, newValues: item.newValues }, null, 2)}</pre></details></td></tr>)}</tbody></table></div> : <div className="empty-state">No audit events have been recorded yet.</div>}</section></>;
}

export function AdminSettings({ notify }: { notify: (notice: Notice) => void }) {
  const [policy, setPolicy] = useState<StudentPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => { api<{ policy: StudentPolicy }>('/admin/settings/student-policy').then((result) => setPolicy(result.policy)).catch((error) => notify({ kind: 'error', message: error.message })).finally(() => setLoading(false)); }, [notify]);
  useEffect(load, [load]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const nextPolicy = Object.fromEntries(['loanPeriodDays', 'maxActiveLoans', 'maxRenewals', 'renewalExtensionDays', 'maxActiveReservations'].map((key) => [key, Number(form.get(key))])) as StudentPolicy;
    setSaving(true);
    try { const result = await api<{ policy: StudentPolicy; message: string }>('/admin/settings/student-policy', { method: 'PUT', body: JSON.stringify(nextPolicy) }); setPolicy(result.policy); notify({ kind: 'success', message: result.message }); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save borrowing policy.' }); }
    finally { setSaving(false); }
  };
  return <><PageHeading eyebrow="ADMINISTRATION · CONFIGURATION" title="System settings" subtitle="Manage the default student borrowing policy."/><section className="surface admin-settings-surface"><div className="section-heading"><div><h2>Student loan policy</h2><p>These limits are applied when staff check out a book or students place a reservation.</p></div><span className="results-count">STUDENT</span></div>{loading ? <div className="empty-state">Loading policy…</div> : policy && <form className="admin-settings-form" onSubmit={save}><label className="field"><span className="field-label"><span>Loan period (days)</span><small>1–365 days</small></span><input name="loanPeriodDays" type="number" min="1" max="365" defaultValue={policy.loanPeriodDays} required /></label><label className="field"><span className="field-label"><span>Maximum active loans</span><small>1–50 loans</small></span><input name="maxActiveLoans" type="number" min="1" max="50" defaultValue={policy.maxActiveLoans} required /></label><label className="field"><span className="field-label"><span>Maximum renewals</span><small>0–10 renewals</small></span><input name="maxRenewals" type="number" min="0" max="10" defaultValue={policy.maxRenewals} required /></label><label className="field"><span className="field-label"><span>Renewal extension (days)</span><small>0–365 days</small></span><input name="renewalExtensionDays" type="number" min="0" max="365" defaultValue={policy.renewalExtensionDays} required /></label><label className="field"><span className="field-label"><span>Maximum active reservations</span><small>0–50 reservations</small></span><input name="maxActiveReservations" type="number" min="0" max="50" defaultValue={policy.maxActiveReservations} required /></label><div className="admin-settings-note">Changes apply to future checkouts and reservation requests. Existing due dates are not changed.</div><button className="primary-button" disabled={saving}>{saving ? 'Saving policy…' : 'Save student policy'}</button></form>}</section></>;
}
