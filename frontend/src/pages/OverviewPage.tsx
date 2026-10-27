import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { date, isOverdue } from '../utils/format';
import type { Page, Notice } from '../types/app';
import type { DashboardData } from '../types';

export function Overview({ onGo, notify, isAdmin = false, isLibrarian = false }: { onGo: (page: Page) => void; notify: (notice: Notice) => void; isAdmin?: boolean; isLibrarian?: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    api<DashboardData>('/dashboard/stats').then(setData).catch((error) => notify({ kind: 'error', message: error.message })).finally(() => setLoading(false));
  }, [notify]);
  useEffect(reload, [reload]);
  const stats = data?.stats;
  const metrics = isLibrarian ? [
    { label: 'Pending requests', value: stats?.pendingRequests, note: 'Waiting for librarian review', glyph: '▤', tint: 'sage' },
    { label: 'Books issued today', value: stats?.issuedToday, note: 'Checkouts recorded today', glyph: '⇧', tint: 'blue' },
    { label: 'Returns today', value: stats?.returnedToday, note: 'Copies checked back in today', glyph: '⇩', tint: 'gold' },
    { label: 'Overdue books', value: stats?.overdueLoans, note: 'Need follow-up', glyph: '◷', tint: 'rose' },
  ] : isAdmin ? [
    { label: 'Total book copies', value: stats?.totalCopies, note: 'Physical copies in the collection', glyph: '▤', tint: 'sage' },
    { label: 'Registered students', value: stats?.students, note: 'Student library accounts', glyph: '♙', tint: 'blue' },
    { label: 'Currently borrowed', value: stats?.activeLoans, note: 'Active loans across the college', glyph: '↗', tint: 'gold' },
    { label: 'Overdue loans', value: stats?.overdueLoans, note: 'Past their due date', glyph: '◷', tint: 'rose' },
  ] : [
    { label: 'Catalog titles', value: stats?.titles, note: 'Unique titles in your collection', glyph: '▤', tint: 'sage' },
    { label: 'Copies available', value: stats?.availableCopies, note: 'Ready to be checked out', glyph: '◉', tint: 'blue' },
    { label: 'Books on loan', value: stats?.activeLoans, note: 'Currently with readers', glyph: '↗', tint: 'gold' },
    { label: 'Overdue returns', value: stats?.overdueLoans, note: 'Need a friendly reminder', glyph: '◷', tint: 'rose' },
  ];
  return <>
    <div className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div><h1>{isAdmin ? 'Dashboard overview' : isLibrarian ? 'Today’s library activity' : 'Good to see you.'}</h1><p>{isAdmin ? 'A live snapshot of Carbonell College Library.' : isLibrarian ? 'A live snapshot of circulation and service desk activity.' : 'Here’s what’s happening in your library today.'}</p></div><button className="outline-button" onClick={() => onGo('circulation')}><span>＋</span> New checkout</button></div>
    <div className="stat-grid">{metrics.map((item) => <div className="stat-card" key={item.label}><div className="stat-top"><span>{item.label}</span><span className={`stat-icon ${item.tint}`}>{item.glyph}</span></div><div className="stat-value">{loading ? <span className="skeleton" /> : item.value ?? 0}</div><div className="stat-note">{item.note}</div></div>)}</div>
    <div className="content-grid">
      <section className="surface recent-surface"><div className="section-heading"><div><h2>{isAdmin ? 'Recent borrowing transactions' : 'Recent activity'}</h2><p>Latest checkouts across your library</p></div><button className="text-button" onClick={() => onGo('loans')}>View all <span>→</span></button></div>
        {loading ? <div className="empty-state">Loading loan activity…</div> : data?.recentLoans.length ? <div className="table-scroll"><table><thead><tr><th>BOOK & BORROWER</th><th>BARCODE</th><th>CHECKED OUT</th><th>DUE DATE</th><th>STATUS</th></tr></thead><tbody>{data.recentLoans.map((loan) => <tr key={loan.id}><td><div className="book-cell"><span className="mini-cover">{loan.title.slice(0, 1)}</span><span><strong>{loan.title}</strong><small>{loan.borrower}</small></span></div></td><td className="mono">{loan.barcode}</td><td>{date(loan.checkedOutAt)}</td><td>{date(loan.dueAt)}</td><td><StatusPill label={isOverdue(loan) ? 'Overdue' : loan.status === 'ACTIVE' ? 'On loan' : loan.status.toLowerCase()} tone={isOverdue(loan) ? 'danger' : loan.status === 'ACTIVE' ? 'warning' : 'neutral'} /></td></tr>)}</tbody></table></div> : <div className="empty-state">No loans yet. Check out a book to see activity here.</div>}
      </section>
      <section className="surface quick-surface"><div className="section-heading"><div><h2>{isAdmin ? 'Administration' : 'Quick actions'}</h2><p>{isAdmin ? 'Common library management tasks' : 'Keep your library moving'}</p></div></div>
        {isLibrarian && <button className="quick-action" onClick={() => onGo('borrowing-requests')}><span className="quick-icon green">▤</span><span><strong>Review borrowing requests</strong><small>{stats?.pendingRequests ?? 0} waiting for review</small></span><b>→</b></button>}
        <button className="quick-action" onClick={() => onGo(isAdmin ? 'students' : isLibrarian ? 'students' : 'catalog')}><span className="quick-icon green">{isAdmin || isLibrarian ? '♙' : '▤'}</span><span><strong>{isAdmin ? 'Manage users' : isLibrarian ? 'Student records' : 'Browse catalog'}</strong><small>{isAdmin ? 'Review student accounts' : isLibrarian ? 'Check borrowing eligibility' : 'Explore the collection'}</small></span><b>→</b></button>
        <button className="quick-action" onClick={() => onGo(isLibrarian ? 'inventory' : 'catalog')}><span className="quick-icon blue">▤</span><span><strong>{isAdmin ? 'Manage books' : isLibrarian ? 'Book inventory' : 'Browse books'}</strong><small>{isAdmin ? 'Titles, categories, and copies' : isLibrarian ? 'Review copy conditions and locations' : 'Find your next read'}</small></span><b>→</b></button>
        <button className="quick-action" onClick={() => onGo('reservations')}><span className="quick-icon amber">⌑</span><span><strong>Reservations</strong><small>Review holds and pickup status</small></span><b>→</b></button>
        {isAdmin && <button className="quick-action" onClick={() => onGo('settings')}><span className="quick-icon rose">⚙</span><span><strong>System settings</strong><small>Update student borrowing policy</small></span><b>→</b></button>}
        {isLibrarian && <button className="quick-action" onClick={() => onGo('overdue')}><span className="quick-icon amber">◷</span><span><strong>Overdue monitoring</strong><small>{stats?.overdueLoans ?? 0} overdue loans</small></span><b>→</b></button>}
        <div className="collection-note"><span>✳</span><p><strong>{stats?.students ?? 0} readers</strong> are part of your college library.</p></div>
      </section>
    </div>
  </>;
}
