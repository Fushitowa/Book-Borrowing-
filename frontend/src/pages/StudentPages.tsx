import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { date, isOverdue } from '../utils/format';
import type { Loan, User } from '../types';
import type { Notice, Page } from '../types/app';

type StudentStats = { currentlyBorrowed: number; dueSoon: number; activeReservations: number; totalBorrowed: number };
type Request = { id: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ISSUED'; title: string; responseReason: string | null; requestedAt: string; loanId: number | null };
type StudentProfile = { username: string; email: string | null; firstName: string; lastName: string; studentNumber: string; program: string | null; yearLevel: string | null; section: string | null };

export function StudentDashboard({ user, notify, onGo }: { user: User; notify: (notice: Notice) => void; onGo: (page: Page) => void }) {
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<{ stats: StudentStats; recentLoans: Loan[] }>('/dashboard/student'),
      api<{ items: Request[] }>('/borrowing-requests?status=ALL'),
    ]).then(([dashboard, borrowing]) => { setStats(dashboard.stats); setLoans(dashboard.recentLoans); setRequests(borrowing.items.slice(0, 5)); })
      .catch((error) => notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load your library activity.' }))
      .finally(() => setLoading(false));
  }, [notify]);
  useEffect(load, [load]);
  const metrics = [
    ['Currently borrowed', stats?.currentlyBorrowed, 'Active checkouts', '▤', 'sage'],
    ['Due soon', stats?.dueSoon, 'Due within 7 days', '◷', 'gold'],
    ['Active reservations', stats?.activeReservations, 'Waiting or ready for pickup', '⌑', 'blue'],
    ['Total borrowed', stats?.totalBorrowed, 'Your borrowing history', '↗', 'rose'],
  ] as const;
  const statusLabel = (status: Request['status']) => status === 'APPROVED' ? 'approved · awaiting issue' : status === 'ISSUED' ? 'issued' : status.toLowerCase();
  return <>
    <div className="welcome-row"><div><div className="eyebrow">MY COLLEGE LIBRARY</div><h1>Welcome back, {user.firstName}.</h1><p>Here’s your borrowing activity and the latest on your requests.</p></div><button className="primary-button" onClick={() => onGo('catalog')}>Browse books <span>→</span></button></div>
    <div className="stat-grid">{metrics.map(([label, value, note, glyph, tint]) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tint}`}>{glyph}</span></div><div className="stat-value">{loading ? <span className="skeleton" /> : Number(value ?? 0)}</div><div className="stat-note">{note}</div></div>)}</div>
    <div className="content-grid">
      <section className="surface recent-surface"><div className="section-heading"><div><h2>My borrowed books</h2><p>Recent checkouts and their due dates.</p></div><button className="text-button" onClick={() => onGo('loans')}>View active loans →</button></div>{loading ? <div className="empty-state">Loading your loans…</div> : loans.length ? <div className="table-scroll"><table><thead><tr><th>BOOK</th><th>CHECKED OUT</th><th>DUE DATE</th><th>STATUS</th></tr></thead><tbody>{loans.filter((loan) => loan.status === 'ACTIVE').slice(0, 5).map((loan, index) => <tr key={loan.id}><td><div className="book-cell"><span className={`book-cover cover-${index % 5}`}>{loan.title[0]}</span><span><strong>{loan.title}</strong><small className="mono">{loan.barcode}</small></span></div></td><td>{date(loan.checkedOutAt)}</td><td>{date(loan.dueAt)}</td><td><StatusPill label={isOverdue(loan) ? 'overdue' : 'on loan'} tone={isOverdue(loan) ? 'danger' : 'warning'} /></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No books checked out</strong><span>Books you collect from the library will appear here.</span><button className="text-button" onClick={() => onGo('catalog')}>Browse the catalog →</button></div>}</section>
      <section className="surface quick-surface"><div className="section-heading"><div><h2>Borrowing requests</h2><p>Decision updates from your library staff.</p></div><button className="text-button" onClick={() => onGo('notifications')}>Notifications →</button></div>{requests.length ? <div className="student-request-list">{requests.map((item) => <article className="student-request-row" key={item.id}><div><strong>{item.title}</strong><small>Requested {date(item.requestedAt)}</small>{item.responseReason && <small>{item.responseReason}</small>}</div><StatusPill label={statusLabel(item.status)} tone={item.status === 'PENDING' ? 'warning' : item.status === 'APPROVED' || item.status === 'ISSUED' ? 'success' : 'neutral'} /></article>)}</div> : <div className="empty-state">No borrowing requests yet.</div>}<button className="quick-action" onClick={() => onGo('reservations')}><span className="quick-icon amber">⌑</span><span><strong>My reservations</strong><small>{stats?.activeReservations ?? 0} active reservation(s)</small></span><b>→</b></button></section>
    </div>
  </>;
}

export function StudentProfile({ notify }: { notify: (notice: Notice) => void }) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => { setLoading(true); api<{ profile: StudentProfile }>('/users/me').then((result) => setProfile(result.profile)).catch((error) => notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load your profile.' })).finally(() => setLoading(false)); }, [notify]);
  useEffect(load, [load]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setSaving(true);
    try { const result = await api<{ email: string | null; message: string }>('/users/me', { method: 'PATCH', body: JSON.stringify({ email: data.get('email') }) }); setProfile((current) => current ? { ...current, email: result.email } : current); notify({ kind: 'success', message: result.message }); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not update your profile.' }); }
    finally { setSaving(false); }
  };
  return <><div className="page-title-row"><div><div className="eyebrow">ACCOUNT</div><h1>My profile</h1><p>Review your college library account and update permitted contact details.</p></div></div>{loading ? <section className="surface admin-settings-surface"><div className="empty-state">Loading your profile…</div></section> : profile && <section className="surface admin-settings-surface student-profile-surface"><div className="section-heading"><div><h2>Student information</h2><p>Your student number and academic details are managed by the college.</p></div><span className="results-count">STUDENT</span></div><form className="admin-settings-form" onSubmit={save}><div className="profile-readonly-grid"><div><small>Full name</small><strong>{profile.firstName} {profile.lastName}</strong></div><div><small>Username</small><strong>{profile.username}</strong></div><div><small>Student number</small><strong>{profile.studentNumber || 'Not on file'}</strong></div><div><small>Program</small><strong>{profile.program || 'Not on file'}</strong></div><div><small>Year level</small><strong>{profile.yearLevel || 'Not on file'}</strong></div><div><small>Section</small><strong>{profile.section || 'Not on file'}</strong></div></div><label className="field"><span className="field-label"><span>Email address</span><small>Optional · max 254 characters</small></span><input name="email" type="email" maxLength={254} defaultValue={profile.email ?? ''} placeholder="you@college.edu" /></label><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save email address'}</button></form></section>}</>;
}
