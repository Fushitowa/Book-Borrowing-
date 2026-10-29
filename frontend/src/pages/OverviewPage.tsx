import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { BrandMark } from '../components/BrandMark';
import { date, isOverdue } from '../utils/format';
import type { Page, Notice } from '../types/app';
import type { DashboardData } from '../types';

function AdminActivityChart({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - 6 + index);
    return day.toISOString().slice(0, 10);
  });
  const activityByDay = new Map((data?.dailyActivity ?? []).map((entry) => [entry.day, entry] as const));
  const activity = days.map((day) => ({
    day,
    issued: Number(activityByDay.get(day)?.issued ?? 0),
    returned: Number(activityByDay.get(day)?.returned ?? 0),
  }));
  const maxValue = Math.max(4, ...activity.flatMap((entry) => [entry.issued, entry.returned]));
  const left = 48;
  const right = 738;
  const top = 24;
  const bottom = 204;
  const point = (value: number, index: number) => ({
    x: left + (right - left) * index / (activity.length - 1),
    y: bottom - value / maxValue * (bottom - top),
  });
  const linePath = (key: 'issued' | 'returned') => activity.map((entry, index) => {
    const position = point(entry[key], index);
    return `${index === 0 ? 'M' : 'L'} ${position.x} ${position.y}`;
  }).join(' ');
  const issuedPath = linePath('issued');
  const issuedPoints = activity.map((entry, index) => point(entry.issued, index));
  const areaPath = `${issuedPath} L ${right} ${bottom} L ${left} ${bottom} Z`;
  const issuedTotal = activity.reduce((total, entry) => total + entry.issued, 0);
  const returnedTotal = activity.reduce((total, entry) => total + entry.returned, 0);
  const hasActivity = issuedTotal > 0 || returnedTotal > 0;
  const labelForDay = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' });
  };

  return <section className="surface admin-trend-panel">
    <div className="section-heading">
      <div><h2>Borrowing activity</h2><p>Books checked out and returned over the last seven days.</p></div>
      <span className="results-count">LAST 7 DAYS</span>
    </div>
    <div className="admin-chart-legend">
      <span><i className="legend-issued" /> Books checked out <strong>{loading ? '—' : issuedTotal}</strong></span>
      <span><i className="legend-returned" /> Books returned <strong>{loading ? '—' : returnedTotal}</strong></span>
    </div>
    {!loading && !hasActivity && <p className="admin-chart-empty">No checkouts or returns were recorded in the last seven days.</p>}
    <div className="admin-chart-wrap" aria-busy={loading}>
      <svg className="admin-activity-chart" viewBox="0 0 760 258" preserveAspectRatio="none" role="img" aria-label="Daily books checked out and returned over the last seven days">
        <defs><linearGradient id="issued-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#719b7f" stopOpacity=".3" /><stop offset="100%" stopColor="#719b7f" stopOpacity=".025" /></linearGradient></defs>
        {[0, 1, 2, 3].map((line) => {
          const y = top + (bottom - top) * line / 3;
          const value = Math.round(maxValue * (3 - line) / 3);
          return <g key={line}><line x1={left} x2={right} y1={y} y2={y} className="chart-grid-line" /><text x="36" y={y + 4} textAnchor="end" className="chart-axis-label">{value}</text></g>;
        })}
        <path d={areaPath} fill="url(#issued-area)" />
        <path d={issuedPath} className="chart-issued-line" />
        <path d={linePath('returned')} className="chart-returned-line" />
        {activity.map((entry, index) => {
          const position = point(entry.issued, index);
          const returnedPosition = point(entry.returned, index);
          return <g key={entry.day}>
            <circle cx={position.x} cy={position.y} r="4" className="chart-issued-point" />
            <circle cx={returnedPosition.x} cy={returnedPosition.y} r="3.5" className="chart-returned-point" />
            <text x={issuedPoints[index].x} y="232" textAnchor="middle" className="chart-day-label">{labelForDay(entry.day)}</text>
          </g>;
        })}
      </svg>
    </div>
  </section>;
}

function AdminDashboard({ data, loading, onGo }: { data: DashboardData | null; loading: boolean; onGo: (page: Page) => void }) {
  const stats = data?.stats;
  const availableShare = stats?.totalCopies ? Math.min(100, Math.round(stats.availableCopies / stats.totalCopies * 100)) : 0;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const metrics = [
    { label: 'Physical copies', value: stats?.totalCopies, note: 'In the collection', glyph: '▤', tint: 'sage' },
    { label: 'Student accounts', value: stats?.students, note: 'Registered readers', glyph: '♙', tint: 'blue' },
    { label: 'Books on loan', value: stats?.activeLoans, note: 'Currently borrowed', glyph: '↗', tint: 'gold' },
    { label: 'Overdue books', value: stats?.overdueLoans, note: 'Need follow-up', glyph: '◷', tint: 'rose' },
  ];
  return <>
    <section className="admin-welcome-hero">
      <div className="admin-hero-copy">
        <span className="admin-hero-eyebrow">CARBONELL COLLEGE LIBRARY <i /> ADMIN WORKSPACE</span>
        <h1>Your library,<br />at a glance.</h1>
        <p>Collection, borrowing, and daily activity—all in one place.</p>
        <div className="admin-hero-actions">
          <button className="admin-hero-button" onClick={() => onGo('catalog')}>Manage books <span>↗</span></button>
          <span className="admin-live-label"><i /> Live library data</span>
        </div>
      </div>
      <div className="admin-hero-art" aria-hidden="true">
        <div className="admin-hero-orbit admin-hero-orbit-one" />
        <div className="admin-hero-orbit admin-hero-orbit-two" />
        <div className="admin-hero-logo-shell"><BrandMark className="admin-dashboard-logo" /></div>
      </div>
      <div className="admin-today-card">
        <span className="admin-today-date">Today · {today}</span>
        <div><span>Checked out</span><strong>{loading ? '—' : stats?.issuedToday ?? 0}</strong></div>
        <div><span>Returned</span><strong>{loading ? '—' : stats?.returnedToday ?? 0}</strong></div>
      </div>
    </section>
    <div className="admin-metric-strip">
      {metrics.map((item, index) => <article className={`admin-metric-card metric-${item.tint}`} key={item.label}>
        <div className="admin-metric-top"><span className="admin-metric-index">0{index + 1}</span><span className="admin-metric-icon">{item.glyph}</span></div>
        <div className="admin-metric-value">{loading ? <span className="skeleton" /> : item.value ?? 0}</div>
        <div className="admin-metric-label">{item.label}</div>
        <div className="admin-metric-note">{item.note}</div>
      </article>)}
    </div>
    <AdminActivityChart data={data} loading={loading} />
    <div className="admin-insights-grid">
      <section className="surface admin-insight-panel">
        <div className="section-heading"><div><h2>Collection at a glance</h2><p>A quick look at the books your library can lend.</p></div></div>
        <div className="collection-summary-row"><span>Catalog titles</span><strong>{loading ? '—' : stats?.titles ?? 0}</strong></div>
        <div className="collection-summary-row"><span>Physical copies</span><strong>{loading ? '—' : stats?.totalCopies ?? 0}</strong></div>
        <div className="collection-summary-row"><span>Available to borrow</span><strong>{loading ? '—' : stats?.availableCopies ?? 0}</strong></div>
        <div className="collection-availability"><div><span>Availability</span><strong>{loading ? '—' : `${availableShare}%`}</strong></div><div className="availability-track"><span style={{ width: `${loading ? 0 : availableShare}%` }} /></div></div>
      </section>
      <section className="surface admin-action-center">
        <div className="section-heading"><div><h2>Library follow-up</h2><p>Choose a task to review or manage.</p></div><span className="results-count">ACTION CENTER</span></div>
        <div className="admin-action-cards">
          <button className="admin-action-card overdue-task" onClick={() => onGo('overdue')}>
            <span className="admin-action-card-top"><span className="attention-icon overdue-icon">◷</span><b>{loading ? '—' : stats?.overdueLoans ?? 0}</b></span>
            <span className="admin-action-card-copy"><strong>Overdue books</strong><small>Follow up on items past their due date.</small></span>
            <span className="admin-action-card-link">Open overdue list <i>↗</i></span>
          </button>
          <button className="admin-action-card request-task" onClick={() => onGo('borrowing-requests')}>
            <span className="admin-action-card-top"><span className="attention-icon request-icon">▤</span><b>{loading ? '—' : stats?.pendingRequests ?? 0}</b></span>
            <span className="admin-action-card-copy"><strong>Borrowing requests</strong><small>Review requests waiting for a decision.</small></span>
            <span className="admin-action-card-link">Review requests <i>↗</i></span>
          </button>
        </div>
        <button className="admin-directory-link" onClick={() => onGo('students')}>
          <span className="admin-directory-icon">♙</span>
          <span><strong>Student directory</strong><small>Find a student account or check eligibility.</small></span>
          <b>Open directory <i>→</i></b>
        </button>
      </section>
    </div>
    <section className="surface recent-surface admin-recent-panel">
      <div className="section-heading"><div><h2>Latest borrowing activity</h2><p>Recent checkouts recorded by the library.</p></div><button className="text-button" onClick={() => onGo('loans')}>View all <span>→</span></button></div>
      {loading ? <div className="empty-state">Loading loan activity…</div> : data?.recentLoans.length ? <div className="table-scroll"><table><thead><tr><th>BOOK &amp; BORROWER</th><th>BARCODE</th><th>CHECKED OUT</th><th>DUE DATE</th><th>STATUS</th></tr></thead><tbody>{data.recentLoans.map((loan) => <tr key={loan.id}><td><div className="book-cell"><span className="mini-cover">{loan.title.slice(0, 1)}</span><span><strong>{loan.title}</strong><small>{loan.borrower}</small></span></div></td><td className="mono">{loan.barcode}</td><td>{date(loan.checkedOutAt)}</td><td>{date(loan.dueAt)}</td><td><StatusPill label={isOverdue(loan) ? 'Overdue' : loan.status === 'ACTIVE' ? 'On loan' : loan.status.toLowerCase()} tone={isOverdue(loan) ? 'danger' : loan.status === 'ACTIVE' ? 'warning' : 'neutral'} /></td></tr>)}</tbody></table></div> : <div className="empty-state">No borrowing activity yet. New checkouts will appear here.</div>}
    </section>
  </>;
}

function LibrarianDashboard({ data, loading, onGo }: { data: DashboardData | null; loading: boolean; onGo: (page: Page) => void }) {
  const stats = data?.stats;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const metrics = [
    { label: 'Requests to review', value: stats?.pendingRequests, note: 'Waiting for your decision', glyph: '▤', tint: 'sage' },
    { label: 'Books issued today', value: stats?.issuedToday, note: 'Checkouts recorded today', glyph: '⇧', tint: 'blue' },
    { label: 'Returns today', value: stats?.returnedToday, note: 'Copies checked back in', glyph: '⇩', tint: 'gold' },
    { label: 'Overdue books', value: stats?.overdueLoans, note: 'Need a follow-up', glyph: '◷', tint: 'rose' },
  ];
  return <>
    <section className="admin-welcome-hero">
      <div className="admin-hero-copy">
        <span className="admin-hero-eyebrow">CARBONELL COLLEGE LIBRARY <i /> LIBRARIAN DESK</span>
        <h1>Your service desk,<br />in one view.</h1>
        <p>Keep requests, checkouts, and returns moving smoothly.</p>
        <div className="admin-hero-actions"><button className="admin-hero-button" onClick={() => onGo('circulation')}>Issue or return a book <span>↗</span></button><span className="admin-live-label"><i /> Live library data</span></div>
      </div>
      <div className="admin-hero-art" aria-hidden="true"><div className="admin-hero-orbit admin-hero-orbit-one" /><div className="admin-hero-orbit admin-hero-orbit-two" /><div className="admin-hero-logo-shell"><BrandMark className="admin-dashboard-logo" /></div></div>
      <div className="admin-today-card"><span className="admin-today-date">Today · {today}</span><div><span>Checked out</span><strong>{loading ? '—' : stats?.issuedToday ?? 0}</strong></div><div><span>Returned</span><strong>{loading ? '—' : stats?.returnedToday ?? 0}</strong></div></div>
    </section>
    <div className="admin-metric-strip">{metrics.map((item, index) => <article className={`admin-metric-card metric-${item.tint}`} key={item.label}><div className="admin-metric-top"><span className="admin-metric-index">0{index + 1}</span><span className="admin-metric-icon">{item.glyph}</span></div><div className="admin-metric-value">{loading ? <span className="skeleton" /> : item.value ?? 0}</div><div className="admin-metric-label">{item.label}</div><div className="admin-metric-note">{item.note}</div></article>)}</div>
    <AdminActivityChart data={data} loading={loading} />
    <div className="admin-insights-grid">
      <section className="surface admin-insight-panel"><div className="section-heading"><div><h2>Service desk</h2><p>Go straight to a common library task.</p></div></div>
        <div className="librarian-shortcut-grid">
          <button className="librarian-shortcut" onClick={() => onGo('circulation')}><span className="quick-icon green">⇧</span><span><strong>Issue or return</strong><small>Record a checkout or check a book in.</small></span><b>↗</b></button>
          <button className="librarian-shortcut" onClick={() => onGo('inventory')}><span className="quick-icon blue">▤</span><span><strong>Book inventory</strong><small>Find a title or review its copies.</small></span><b>↗</b></button>
          <button className="librarian-shortcut" onClick={() => onGo('students')}><span className="quick-icon amber">♙</span><span><strong>Student records</strong><small>Look up a student and check eligibility.</small></span><b>↗</b></button>
        </div>
      </section>
      <section className="surface admin-action-center"><div className="section-heading"><div><h2>Needs a review</h2><p>Requests and books that need follow-up.</p></div><span className="results-count">LIBRARY DESK</span></div>
        <div className="admin-action-cards">
          <button className="admin-action-card request-task" onClick={() => onGo('borrowing-requests')}><span className="admin-action-card-top"><span className="attention-icon request-icon">▤</span><b>{loading ? '—' : stats?.pendingRequests ?? 0}</b></span><span className="admin-action-card-copy"><strong>Borrowing requests</strong><small>Review requests from students.</small></span><span className="admin-action-card-link">Review queue <i>↗</i></span></button>
          <button className="admin-action-card overdue-task" onClick={() => onGo('overdue')}><span className="admin-action-card-top"><span className="attention-icon overdue-icon">◷</span><b>{loading ? '—' : stats?.overdueLoans ?? 0}</b></span><span className="admin-action-card-copy"><strong>Overdue books</strong><small>Follow up on past-due loans.</small></span><span className="admin-action-card-link">Open overdue list <i>↗</i></span></button>
        </div>
        <button className="admin-directory-link" onClick={() => onGo('reservations')}><span className="admin-directory-icon">⌑</span><span><strong>Reservations</strong><small>Check the hold queue and pickup status.</small></span><b>Open queue <i>→</i></b></button>
      </section>
    </div>
    <section className="surface recent-surface admin-recent-panel"><div className="section-heading"><div><h2>Recent checkouts</h2><p>Latest borrowing transactions across the library.</p></div><button className="text-button" onClick={() => onGo('loans')}>View all <span>→</span></button></div>
      {loading ? <div className="empty-state">Loading loan activity…</div> : data?.recentLoans.length ? <div className="table-scroll"><table><thead><tr><th>BOOK &amp; BORROWER</th><th>BARCODE</th><th>CHECKED OUT</th><th>DUE DATE</th><th>STATUS</th></tr></thead><tbody>{data.recentLoans.map((loan) => <tr key={loan.id}><td><div className="book-cell"><span className="mini-cover">{loan.title.slice(0, 1)}</span><span><strong>{loan.title}</strong><small>{loan.borrower}</small></span></div></td><td className="mono">{loan.barcode}</td><td>{date(loan.checkedOutAt)}</td><td>{date(loan.dueAt)}</td><td><StatusPill label={isOverdue(loan) ? 'Overdue' : loan.status === 'ACTIVE' ? 'On loan' : loan.status.toLowerCase()} tone={isOverdue(loan) ? 'danger' : loan.status === 'ACTIVE' ? 'warning' : 'neutral'} /></td></tr>)}</tbody></table></div> : <div className="empty-state">No checkouts yet. New transactions will appear here.</div>}
    </section>
  </>;
}

export function Overview({ onGo, notify, isAdmin = false, isLibrarian = false }: { onGo: (page: Page) => void; notify: (notice: Notice) => void; isAdmin?: boolean; isLibrarian?: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    api<DashboardData>('/dashboard/stats').then(setData).catch((error) => notify({ kind: 'error', message: error.message })).finally(() => setLoading(false));
  }, [notify]);
  useEffect(reload, [reload]);
  if (isAdmin) return <AdminDashboard data={data} loading={loading} onGo={onGo} />;
  if (isLibrarian) return <LibrarianDashboard data={data} loading={loading} onGo={onGo} />;
  return null;
}
