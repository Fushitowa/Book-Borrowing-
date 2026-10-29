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

function ReportsActivityChart({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const dates = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - 6 + index);
    return day.toISOString().slice(0, 10);
  });
  const activityByDate = new Map((data?.dailyActivity ?? []).map((entry) => [entry.day, entry] as const));
  const activity = dates.map((day) => ({
    day,
    issued: Number(activityByDate.get(day)?.issued ?? 0),
    returned: Number(activityByDate.get(day)?.returned ?? 0),
  }));
  const maxValue = Math.max(1, ...activity.flatMap((entry) => [entry.issued, entry.returned]));
  const issuedTotal = activity.reduce((total, entry) => total + entry.issued, 0);
  const returnedTotal = activity.reduce((total, entry) => total + entry.returned, 0);
  const labelForDay = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' });
  };

  return <section className="surface report-activity-panel">
    <div className="report-panel-heading"><div><span className="report-panel-kicker">WEEKLY TREND</span><h2>Circulation activity</h2><p>Checkouts and returns over the last seven days.</p></div><span className="report-period-pill">Last 7 days</span></div>
    <div className="report-chart-legend">
      <span><i className="report-legend-issued" /> Checked out <strong>{loading ? '—' : issuedTotal}</strong></span>
      <span><i className="report-legend-returned" /> Returned <strong>{loading ? '—' : returnedTotal}</strong></span>
    </div>
    <div className="report-chart-plot" role="img" aria-label="Daily books checked out and returned over the last seven days">
      <div className="report-bars-row">
        {activity.map((entry) => <div className="report-day-column" key={entry.day}>
          <div className="report-bar-pair">
            <span className="report-bar report-bar-issued" title={`${entry.issued} checked out`} style={{ height: `${entry.issued ? Math.max(5, entry.issued / maxValue * 100) : 0}%` }} />
            <span className="report-bar report-bar-returned" title={`${entry.returned} returned`} style={{ height: `${entry.returned ? Math.max(5, entry.returned / maxValue * 100) : 0}%` }} />
          </div>
          <span className="report-day-label">{labelForDay(entry.day)}</span>
        </div>)}
      </div>
    </div>
    {!loading && issuedTotal + returnedTotal === 0 && <p className="report-chart-empty">No circulation activity has been recorded this week.</p>}
  </section>;
}

export function AdminReports({ notify, isLibrarian = false }: { notify: (notice: Notice) => void; isLibrarian?: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<DashboardData>('/dashboard/stats').then(setData).catch((error) => notify({ kind: 'error', message: error.message })).finally(() => setLoading(false)); }, [notify]);
  const stats = data?.stats;
  const reportDate = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const exportSummary = () => {
    if (!stats) return;
    const weeklyIssued = data?.dailyActivity.reduce((total, day) => total + Number(day.issued), 0) ?? 0;
    const weeklyReturned = data?.dailyActivity.reduce((total, day) => total + Number(day.returned), 0) ?? 0;
    const rows = [['Metric', 'Count'], ['Catalog titles', stats.titles], ['Total book copies', stats.totalCopies], ['Available copies', stats.availableCopies], ['Registered students', stats.students], ['Currently borrowed', stats.activeLoans], ['Overdue loans', stats.overdueLoans], ['Checked out today', stats.issuedToday], ['Returned today', stats.returnedToday], ['Checked out in the last 7 days', weeklyIssued], ['Returned in the last 7 days', weeklyReturned]];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `carbonell-library-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  };
  const availablePercent = stats?.totalCopies ? Math.min(100, Math.round(stats.availableCopies / stats.totalCopies * 100)) : 0;
  const borrowedPercent = stats?.totalCopies ? Math.min(100, Math.round(stats.activeLoans / stats.totalCopies * 100)) : 0;
  return <>
    <header className="reports-page-header">
      <div><span className="report-page-kicker">{isLibrarian ? 'LIBRARY OPERATIONS' : 'CARBONELL COLLEGE LIBRARY'} · REPORTING</span><h1>{isLibrarian ? 'Library reports' : 'Reports & analytics'}</h1><p>Understand circulation and collection activity with live library data.</p></div>
      <div className="reports-header-actions"><span>Updated {reportDate}</span><button className="primary-button" onClick={exportSummary} disabled={!stats}>↓ <span>Export report</span></button></div>
    </header>
    <div className="reports-workspace">
      <div className="reports-main-column">
        <ReportsActivityChart data={data} loading={loading} />
        <section className="surface report-collection-panel">
          <div className="report-panel-heading"><div><span className="report-panel-kicker">COLLECTION</span><h2>Availability overview</h2><p>See how your physical copies are being used.</p></div><span className="report-total-pill">{loading ? '—' : stats?.totalCopies ?? 0} total copies</span></div>
          <div className="report-status-list">
            <div className="report-status-item"><div className="report-status-heading"><span><i className="status-dot available-dot" /> Available to borrow</span><strong>{loading ? '—' : stats?.availableCopies ?? 0}<small> copies</small></strong></div><div className="report-status-track"><span className="available-track" style={{ width: `${loading ? 0 : availablePercent}%` }} /></div></div>
            <div className="report-status-item"><div className="report-status-heading"><span><i className="status-dot borrowed-dot" /> Currently on loan</span><strong>{loading ? '—' : stats?.activeLoans ?? 0}<small> books</small></strong></div><div className="report-status-track"><span className="borrowed-track" style={{ width: `${loading ? 0 : borrowedPercent}%` }} /></div></div>
          </div>
        </section>
      </div>
      <aside className="reports-side-column">
        <section className="report-circulation-card">
          <span className="report-panel-kicker">CIRCULATION SNAPSHOT</span><h2>At a glance</h2><p>Today’s activity and current loans.</p>
          <div className="report-circulation-row"><span>Checked out today</span><strong>{loading ? '—' : stats?.issuedToday ?? 0}</strong></div>
          <div className="report-circulation-row"><span>Returned today</span><strong>{loading ? '—' : stats?.returnedToday ?? 0}</strong></div>
          <div className="report-circulation-row"><span>Currently on loan</span><strong>{loading ? '—' : stats?.activeLoans ?? 0}</strong></div>
          <div className="report-overdue-row"><span><i /> Overdue books</span><strong>{loading ? '—' : stats?.overdueLoans ?? 0}</strong></div>
        </section>
        <section className="surface report-library-card">
          <div className="report-panel-heading"><div><span className="report-panel-kicker">YOUR LIBRARY</span><h2>Collection totals</h2></div></div>
          <div className="report-total-row"><span>Catalog titles</span><strong>{loading ? '—' : stats?.titles ?? 0}</strong></div>
          <div className="report-total-row"><span>Physical copies</span><strong>{loading ? '—' : stats?.totalCopies ?? 0}</strong></div>
          <div className="report-total-row"><span>Student accounts</span><strong>{loading ? '—' : stats?.students ?? 0}</strong></div>
        </section>
      </aside>
    </div>
  </>;
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
  return <>
    <PageHeading eyebrow="YOUR LIBRARY" title="Borrowing settings" subtitle="Set simple borrowing rules for your students." />
    <section className="surface admin-settings-surface">
      <div className="section-heading">
        <div><h2>Student borrowing rules</h2><p>These settings guide new checkouts, renewals, and reservations.</p></div>
        <span className="results-count">FOR STUDENTS</span>
      </div>
      {loading ? <div className="empty-state">Loading your library’s settings…</div> : policy && <form className="admin-settings-form" onSubmit={save}>
        <label className="field">
          <span className="field-label"><span>How long can a student keep a book?</span><small>1 to 365 days</small></span>
          <input name="loanPeriodDays" type="number" min="1" max="365" defaultValue={policy.loanPeriodDays} required />
        </label>
        <label className="field">
          <span className="field-label"><span>How many books can a student borrow at once?</span><small>1 to 50 books</small></span>
          <input name="maxActiveLoans" type="number" min="1" max="50" defaultValue={policy.maxActiveLoans} required />
        </label>
        <label className="field">
          <span className="field-label"><span>How many times can a student renew a book?</span><small>Enter 0 to turn renewals off</small></span>
          <input name="maxRenewals" type="number" min="0" max="10" defaultValue={policy.maxRenewals} required />
        </label>
        <label className="field">
          <span className="field-label"><span>How many extra days does a renewal add?</span><small>0 to 365 days</small></span>
          <input name="renewalExtensionDays" type="number" min="0" max="365" defaultValue={policy.renewalExtensionDays} required />
        </label>
        <label className="field">
          <span className="field-label"><span>How many books can a student reserve at once?</span><small>Enter 0 to turn reservations off</small></span>
          <input name="maxActiveReservations" type="number" min="0" max="50" defaultValue={policy.maxActiveReservations} required />
        </label>
        <div className="admin-settings-note">Your changes apply to new checkouts and reservations. Books students already borrowed keep their current due dates.</div>
        <button className="primary-button" disabled={saving}>{saving ? 'Saving your rules…' : 'Save borrowing rules'}</button>
      </form>}
    </section>
  </>;
}
