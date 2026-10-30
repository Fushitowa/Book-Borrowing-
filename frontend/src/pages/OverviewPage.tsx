import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { BrandMark } from '../components/BrandMark';
import { date, isOverdue } from '../utils/format';
import type { Page, Notice } from '../types/app';
import type { DashboardData } from '../types';

function AdminActivityChart({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
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
  const issuedTotal = activity.reduce((total, entry) => total + entry.issued, 0);
  const returnedTotal = activity.reduce((total, entry) => total + entry.returned, 0);
  const hasActivity = issuedTotal > 0 || returnedTotal > 0;
  const netChange = issuedTotal - returnedTotal;
  const labelForDay = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' });
  };
  const dateForDay = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  /* SVG chart geometry */
  const left = 48, right = 738, top = 28, bottom = 204;
  const point = (value: number, index: number) => ({
    x: left + (right - left) * index / (activity.length - 1),
    y: bottom - value / maxValue * (bottom - top),
  });
  /* Smooth curve path using cubic Bézier */
  const smoothPath = (key: 'issued' | 'returned') => {
    const pts = activity.map((entry, index) => point(entry[key], index));
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const tension = 0.3;
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };
  const issuedPath = smoothPath('issued');
  const returnedPath = smoothPath('returned');
  const issuedPoints = activity.map((entry, index) => point(entry.issued, index));
  const lastIssuedPt = issuedPoints[issuedPoints.length - 1];
  const firstIssuedPt = issuedPoints[0];
  const areaPath = `${issuedPath} L ${lastIssuedPt.x} ${bottom} L ${firstIssuedPt.x} ${bottom} Z`;
  /* Peak day */
  const peakIdx = activity.reduce((best, entry, i, arr) => (entry.issued + entry.returned) > (arr[best].issued + arr[best].returned) ? i : best, 0);
  const peakTotal = activity[peakIdx].issued + activity[peakIdx].returned;

  return <section className="surface ac-panel">
    {/* ---- Header row ---- */}
    <div className="ac-header">
      <div className="ac-header-left">
        <span className="ac-kicker">WEEKLY CIRCULATION TREND</span>
        <h2 className="ac-title">Borrowing activity</h2>
        <p className="ac-subtitle">Books checked out and returned over the last seven days.</p>
      </div>
      <div className="ac-header-right">
        <span className="ac-period-pill">Last 7 days</span>
      </div>
    </div>

    {/* ---- Summary strip ---- */}
    <div className="ac-summary-strip">
      <div className="ac-summary-card ac-summary-issued">
        <span className="ac-summary-dot ac-dot-issued" />
        <div className="ac-summary-copy">
          <span className="ac-summary-label">Checked out</span>
          <strong className="ac-summary-value">{loading ? '—' : issuedTotal}</strong>
        </div>
      </div>
      <div className="ac-summary-card ac-summary-returned">
        <span className="ac-summary-dot ac-dot-returned" />
        <div className="ac-summary-copy">
          <span className="ac-summary-label">Returned</span>
          <strong className="ac-summary-value">{loading ? '—' : returnedTotal}</strong>
        </div>
      </div>
      <div className="ac-summary-card ac-summary-net">
        <span className={`ac-summary-dot ${netChange > 0 ? 'ac-dot-issued' : netChange < 0 ? 'ac-dot-returned' : 'ac-dot-neutral'}`} />
        <div className="ac-summary-copy">
          <span className="ac-summary-label">Net change</span>
          <strong className="ac-summary-value">{loading ? '—' : `${netChange >= 0 ? '+' : ''}${netChange}`}</strong>
        </div>
      </div>
      {hasActivity && <div className="ac-summary-card ac-summary-peak">
        <span className="ac-summary-dot ac-dot-peak" />
        <div className="ac-summary-copy">
          <span className="ac-summary-label">Peak day</span>
          <strong className="ac-summary-value">{dateForDay(activity[peakIdx].day)} · {peakTotal}</strong>
        </div>
      </div>}
    </div>

    {/* ---- Chart ---- */}
    {!loading && !hasActivity && <p className="ac-empty">No checkouts or returns were recorded in the last seven days.</p>}
    <div className="ac-chart-wrap" aria-busy={loading}>
      <svg className="ac-chart" viewBox="0 0 760 258" preserveAspectRatio="none" role="img" aria-label="Daily books checked out and returned over the last seven days">
        <defs>
          <linearGradient id="ac-grad-issued" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a8f5f" stopOpacity=".22" />
            <stop offset="100%" stopColor="#4a8f5f" stopOpacity=".01" />
          </linearGradient>
          <linearGradient id="ac-grad-returned" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c1a15f" stopOpacity=".13" />
            <stop offset="100%" stopColor="#c1a15f" stopOpacity=".01" />
          </linearGradient>
          <filter id="ac-glow-issued"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="ac-glow-returned"><feGaussianBlur stdDeviation="2.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>

        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map((line) => {
          const y = top + (bottom - top) * line / 4;
          const value = Math.round(maxValue * (4 - line) / 4);
          return <g key={line}>
            <line x1={left} x2={right} y1={y} y2={y} className="ac-grid-line" />
            <text x="38" y={y + 4} textAnchor="end" className="ac-axis-label">{value}</text>
          </g>;
        })}

        {/* Hover columns */}
        {activity.map((entry, index) => {
          const px = point(0, index).x;
          const colWidth = (right - left) / (activity.length - 1);
          return <rect key={entry.day + '-hover'}
            x={px - colWidth / 2} y={top} width={colWidth} height={bottom - top}
            fill={hoveredDay === index ? '#3970501a' : 'transparent'}
            onMouseEnter={() => setHoveredDay(index)}
            onMouseLeave={() => setHoveredDay(null)}
            style={{ cursor: 'default' }}
          />;
        })}

        {/* Hover vertical line */}
        {hoveredDay !== null && <line x1={point(0, hoveredDay).x} x2={point(0, hoveredDay).x} y1={top} y2={bottom} stroke="#39705033" strokeWidth="1" strokeDasharray="4 3" />}

        {/* Area fills */}
        <path d={areaPath} fill="url(#ac-grad-issued)" />

        {/* Lines */}
        <path d={issuedPath} className="ac-line-issued" filter="url(#ac-glow-issued)" />
        <path d={returnedPath} className="ac-line-returned" filter="url(#ac-glow-returned)" />

        {/* Data points & day labels */}
        {activity.map((entry, index) => {
          const ip = point(entry.issued, index);
          const rp = point(entry.returned, index);
          const isHovered = hoveredDay === index;
          return <g key={entry.day}>
            {/* Issued point */}
            <circle cx={ip.x} cy={ip.y} r={isHovered ? 6 : 4.5} className="ac-point-issued" />
            <circle cx={ip.x} cy={ip.y} r="2" fill="#fff" />
            {/* Returned point */}
            <circle cx={rp.x} cy={rp.y} r={isHovered ? 5.5 : 4} className="ac-point-returned" />
            <circle cx={rp.x} cy={rp.y} r="1.8" fill="#fff" />
            {/* Day label */}
            <text x={ip.x} y="232" textAnchor="middle" className={`ac-day-label ${isHovered ? 'ac-day-active' : ''}`}>{labelForDay(entry.day)}</text>
            {/* Date below day */}
            <text x={ip.x} y="248" textAnchor="middle" className="ac-date-label">{dateForDay(entry.day)}</text>
          </g>;
        })}

        {/* Hover tooltip */}
        {hoveredDay !== null && (() => {
          const entry = activity[hoveredDay];
          const px = point(0, hoveredDay).x;
          const tooltipW = 105;
          const tooltipH = 48;
          let tx = px - tooltipW / 2;
          if (tx < left) tx = left;
          if (tx + tooltipW > right) tx = right - tooltipW;
          const ty = top - 6;
          return <g>
            <rect x={tx} y={ty - tooltipH} width={tooltipW} height={tooltipH} rx="6" fill="#1f3c30" opacity=".95" />
            <text x={tx + tooltipW / 2} y={ty - tooltipH + 17} textAnchor="middle" fill="#e0d9a8" style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.06em' }}>{dateForDay(entry.day)}</text>
            <text x={tx + 14} y={ty - tooltipH + 34} fill="#9dd4aa" style={{ fontSize: '10px', fontWeight: 600 }}>↑ {entry.issued}</text>
            <text x={tx + tooltipW / 2 + 10} y={ty - tooltipH + 34} fill="#e0c67a" style={{ fontSize: '10px', fontWeight: 600 }}>↓ {entry.returned}</text>
          </g>;
        })()}
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
