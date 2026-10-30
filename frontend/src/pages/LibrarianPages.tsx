import { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { date } from '../utils/format';
import type { Notice } from '../types/app';

type RequestItem = { id: number; bookId: number; studentId: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ISSUED'; studentNote: string | null; responseReason: string | null; loanId: number | null; requestedAt: string; resolvedAt: string | null; issuedAt: string | null; title: string; authors: string | null; student: string; studentNumber: string | null; availableCopies: number };
type CopyItem = { id: number; bookId: number; barcode: string; status: 'IN_SERVICE' | 'DAMAGED' | 'LOST' | 'WITHDRAWN'; shelfLocation: string | null; title: string; borrower: string | null; activeLoanId: number | null };

/* ------------------------------------------------------------------ */
/*  Decline Modal                                                      */
/* ------------------------------------------------------------------ */
function DeclineModal({ item, busy, onConfirm, onCancel }: { item: RequestItem; busy: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-card decline-modal-card" role="dialog" aria-modal="true" aria-labelledby="decline-title">
        <div className="decline-modal-header">
          <div className="decline-modal-icon"><span>✕</span></div>
          <div>
            <h2 id="decline-title">Decline request</h2>
            <p>Let <strong>{item.student}</strong> know why their request for <strong>"{item.title}"</strong> was not approved.</p>
          </div>
        </div>
        <div className="decline-modal-body">
          <label className="decline-label">Reason for declining <span className="required"> *</span></label>
          <textarea ref={inputRef} className="decline-textarea" rows={3} placeholder="e.g. All copies are currently reserved, insufficient eligibility…" value={reason} onChange={(e) => setReason(e.target.value)} />
          <small className="decline-hint">This reason will be visible to the student in their notifications.</small>
        </div>
        <div className="decline-modal-actions">
          <button className="outline-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="danger-button decline-confirm-button" disabled={busy || !reason.trim()} onClick={() => onConfirm(reason.trim())}>{busy ? 'Declining…' : 'Decline request'}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Borrowing Requests — main page                                     */
/* ------------------------------------------------------------------ */
export function BorrowingRequests({ notify }: { notify: (notice: Notice) => void }) {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [copies, setCopies] = useState<{ id: number; bookId: number; barcode: string; title: string; shelfLocation: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [tab, setTab] = useState<'PENDING' | 'APPROVED' | 'ALL'>('PENDING');
  const [declining, setDeclining] = useState<RequestItem | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api<{ items: RequestItem[] }>('/borrowing-requests?status=ALL'), api<{ items: typeof copies }>('/books/available-copies')])
      .then(([requests, available]) => { setItems(requests.items); setCopies(available.items); })
      .catch((error) => notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load borrowing requests.' }))
      .finally(() => setLoading(false));
  }, [notify]);
  useEffect(load, [load]);

  const approve = async (item: RequestItem) => {
    if (!window.confirm(`Approve ${item.student}'s request for "${item.title}"? This records approval only; the book is not borrowed until a copy is issued.`)) return;
    setBusy(item.id);
    try { await api(`/borrowing-requests/${item.id}/approve`, { method: 'POST' }); notify({ kind: 'success', message: `Approved ${item.student}'s request. Issue the copy when they collect it.` }); load(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not approve request.' }); }
    finally { setBusy(null); }
  };

  const issue = async (item: RequestItem) => {
    const copyId = Number(selected[item.id]);
    if (!copyId) { notify({ kind: 'error', message: 'Choose an available physical copy to issue.' }); return; }
    if (!window.confirm(`Confirm you are handing "${item.title}" to ${item.student}? The checkout and due date will be recorded now.`)) return;
    setBusy(item.id);
    try { await api(`/borrowing-requests/${item.id}/issue`, { method: 'POST', body: JSON.stringify({ copyId }) }); notify({ kind: 'success', message: `Issued "${item.title}" to ${item.student}.` }); load(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not issue this copy.' }); }
    finally { setBusy(null); }
  };

  const reject = async (item: RequestItem, reason: string) => {
    setBusy(item.id);
    try { await api(`/borrowing-requests/${item.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); notify({ kind: 'success', message: 'Request declined and student notified.' }); setDeclining(null); load(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not decline request.' }); }
    finally { setBusy(null); }
  };

  const pending = items.filter((r) => r.status === 'PENDING');
  const approved = items.filter((r) => r.status === 'APPROVED');
  const resolved = items.filter((r) => r.status === 'ISSUED' || r.status === 'REJECTED');

  const visible = tab === 'PENDING' ? pending : tab === 'APPROVED' ? approved : items;

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return <>
    {/* ---- Header ---- */}
    <div className="page-title-row">
      <div>
        <div className="eyebrow">LIBRARY SERVICE DESK</div>
        <h1>Borrowing requests</h1>
        <p>Review student requests, approve or decline, then issue a physical copy when the student arrives.</p>
      </div>
    </div>

    {/* ---- Stat cards ---- */}
    <div className="stat-grid br-stat-grid">
      <div className="stat-card br-stat-pending">
        <div className="stat-top"><span>Pending review</span><span className="stat-icon gold">▤</span></div>
        <div className="stat-value">{loading ? <span className="skeleton" /> : pending.length}</div>
        <div className="stat-note">Awaiting librarian decision</div>
      </div>
      <div className="stat-card br-stat-approved">
        <div className="stat-top"><span>Approved to issue</span><span className="stat-icon sage">⇧</span></div>
        <div className="stat-value">{loading ? <span className="skeleton" /> : approved.length}</div>
        <div className="stat-note">Ready for physical copy handover</div>
      </div>
      <div className="stat-card br-stat-issued">
        <div className="stat-top"><span>Issued today</span><span className="stat-icon blue">✓</span></div>
        <div className="stat-value">{loading ? <span className="skeleton" /> : resolved.filter((r) => r.status === 'ISSUED' && r.issuedAt && new Date(r.issuedAt).toDateString() === new Date().toDateString()).length}</div>
        <div className="stat-note">Books handed over today</div>
      </div>
      <div className="stat-card br-stat-total">
        <div className="stat-top"><span>Total requests</span><span className="stat-icon rose">☰</span></div>
        <div className="stat-value">{loading ? <span className="skeleton" /> : items.length}</div>
        <div className="stat-note">All time across all statuses</div>
      </div>
    </div>

    {/* ---- Main section ---- */}
    <section className="surface catalog-surface br-surface">
      <div className="section-heading br-section-heading">
        <div>
          <h2>Student requests</h2>
          <p>Approval does not check out a book. Declines require a reason so students understand the decision.</p>
        </div>
        <div className="br-tab-bar">
          <button className={`br-tab ${tab === 'PENDING' ? 'active' : ''}`} onClick={() => setTab('PENDING')}>
            Pending{pending.length > 0 && <span className="br-tab-badge br-badge-warn">{pending.length}</span>}
          </button>
          <button className={`br-tab ${tab === 'APPROVED' ? 'active' : ''}`} onClick={() => setTab('APPROVED')}>
            Approved{approved.length > 0 && <span className="br-tab-badge br-badge-success">{approved.length}</span>}
          </button>
          <button className={`br-tab ${tab === 'ALL' ? 'active' : ''}`} onClick={() => setTab('ALL')}>
            All requests
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading requests…</div>
      ) : visible.length ? (
        <div className="table-scroll">
          <table className="br-table">
            <thead>
              <tr>
                <th>STUDENT</th>
                <th>REQUESTED BOOK</th>
                <th>REQUESTED</th>
                <th>AVAILABLE COPIES</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className={`br-row br-row-${item.status.toLowerCase()}`}>
                  <td>
                    <div className="book-cell">
                      <span className="student-avatar br-avatar">{item.student.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                      <span>
                        <strong>{item.student}</strong>
                        <small>{item.studentNumber || 'No student number'}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="br-book-info">
                      <strong>{item.title}</strong>
                      <small className="cell-sub">{item.authors || 'Author not listed'}</small>
                      {item.studentNote && <small className="br-student-note">💬 {item.studentNote}</small>}
                      {item.responseReason && <small className="br-decline-reason">Reason: {item.responseReason}</small>}
                    </div>
                  </td>
                  <td>
                    <div className="br-date-cell">
                      <span>{date(item.requestedAt)}</span>
                      <small className="br-time-ago">{timeAgo(item.requestedAt)}</small>
                    </div>
                  </td>
                  <td>
                    {item.status === 'APPROVED' ? (
                      <div className="br-copy-selector">
                        <select
                          className="br-copy-select"
                          aria-label={`Copy for ${item.title}`}
                          value={selected[item.id] ?? ''}
                          onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}
                        >
                          <option value="">Select copy ({item.availableCopies})</option>
                          {copies.filter((copy) => copy.bookId === item.bookId).map((copy) => (
                            <option key={copy.id} value={copy.id}>{copy.barcode}{copy.shelfLocation ? ` · ${copy.shelfLocation}` : ''}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className={`br-copies-count ${item.availableCopies === 0 ? 'br-copies-zero' : ''}`}>
                        {item.availableCopies} {item.availableCopies === 1 ? 'copy' : 'copies'}
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusPill
                      label={item.status === 'APPROVED' ? 'approved · awaiting issue' : item.status.toLowerCase()}
                      tone={item.status === 'PENDING' ? 'warning' : item.status === 'APPROVED' || item.status === 'ISSUED' ? 'success' : 'neutral'}
                    />
                  </td>
                  <td>
                    {item.status === 'PENDING' ? (
                      <div className="br-actions">
                        <button className="br-approve-btn" disabled={busy === item.id} onClick={() => approve(item)}>
                          {busy === item.id ? <><span className="spinner" /> Saving…</> : <><span className="br-btn-icon">✓</span> Approve</>}
                        </button>
                        <button className="br-decline-btn" disabled={busy === item.id} onClick={() => setDeclining(item)}>
                          <span className="br-btn-icon">✕</span> Decline
                        </button>
                      </div>
                    ) : item.status === 'APPROVED' ? (
                      <button className="br-issue-btn" disabled={busy === item.id || !selected[item.id]} onClick={() => issue(item)}>
                        {busy === item.id ? <><span className="spinner" /> Issuing…</> : <><span className="br-btn-icon">⇧</span> Issue copy</>}
                      </button>
                    ) : item.loanId ? (
                      <span className="br-loan-ref">Loan #{item.loanId}</span>
                    ) : (
                      <span className="br-resolved-dash">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state br-empty">
          <span className="br-empty-icon">{tab === 'PENDING' ? '✓' : tab === 'APPROVED' ? '⇧' : '▤'}</span>
          <strong>{tab === 'PENDING' ? 'No pending requests' : tab === 'APPROVED' ? 'No approved requests awaiting issue' : 'No borrowing requests yet'}</strong>
          <span>{tab === 'PENDING' ? 'All student requests have been reviewed.' : tab === 'APPROVED' ? 'Approve a pending request to see it here.' : 'Student requests will appear here for review.'}</span>
        </div>
      )}
    </section>

    {/* ---- Decline modal ---- */}
    {declining && (
      <DeclineModal
        item={declining}
        busy={busy === declining.id}
        onConfirm={(reason) => reject(declining, reason)}
        onCancel={() => setDeclining(null)}
      />
    )}
  </>;
}

/* ------------------------------------------------------------------ */
/*  Inventory — unchanged                                              */
/* ------------------------------------------------------------------ */
export function Inventory({ notify }: { notify: (notice: Notice) => void }) {
  const [items, setItems] = useState<CopyItem[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api<{ items: CopyItem[] }>(`/books/copies?q=${encodeURIComponent(query)}&status=${status}`).then((result) => setItems(result.items)).catch((error) => notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load inventory.' })).finally(() => setLoading(false));
  }, [query, status, notify]);
  useEffect(load, [load]);
  const updateStatus = async (copy: CopyItem, nextStatus: 'IN_SERVICE' | 'WITHDRAWN') => {
    try { await api(`/books/copies/${copy.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) }); notify({ kind: 'success', message: `${copy.barcode} marked ${nextStatus === 'IN_SERVICE' ? 'in service' : 'withdrawn'}.` }); load(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not update copy.' }); }
  };
  const counts = items.reduce((total, copy) => ({ ...total, [copy.status]: total[copy.status] + 1 }), { IN_SERVICE: 0, DAMAGED: 0, LOST: 0, WITHDRAWN: 0 });
  return <><div className="page-title-row"><div><div className="eyebrow">COLLECTION OPERATIONS</div><h1>Book inventory</h1><p>Track each physical copy, its circulation state, and shelf location.</p></div></div><div className="stat-grid inventory-stat-grid">{([['In service', counts.IN_SERVICE, 'sage'], ['Damaged', counts.DAMAGED, 'rose'], ['Lost', counts.LOST, 'gold'], ['Withdrawn', counts.WITHDRAWN, 'blue']] as const).map(([label, value, tint]) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tint}`}>▤</span></div><div className="stat-value">{value}</div><div className="stat-note">Copies shown by current filter</div></div>)}</div><section className="surface catalog-surface"><div className="section-heading inventory-tools"><div><h2>Physical copies</h2><p>Damaged copies return to service only after inspection; lost copies require a recovery record.</p></div><div className="inventory-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, barcode, shelf" aria-label="Search copies"/><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter copy status"><option value="ALL">All statuses</option><option value="IN_SERVICE">In service</option><option value="DAMAGED">Damaged</option><option value="LOST">Lost</option><option value="WITHDRAWN">Withdrawn</option></select></div></div>{loading ? <div className="empty-state">Loading inventory…</div> : items.length ? <div className="table-scroll"><table><thead><tr><th>BOOK / COPY</th><th>BARCODE</th><th>SHELF</th><th>BORROWER</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.title}</td><td className="mono">{item.barcode}</td><td>{item.shelfLocation || '—'}</td><td>{item.borrower || '—'}</td><td><StatusPill label={item.status.replace(/_/g, ' ').toLowerCase()} tone={item.status === 'IN_SERVICE' ? 'success' : item.status === 'DAMAGED' || item.status === 'LOST' ? 'danger' : 'neutral'} /></td><td>{item.activeLoanId ? 'On loan' : item.status === 'DAMAGED' || item.status === 'WITHDRAWN' ? <button className="small-outline" onClick={() => updateStatus(item, 'IN_SERVICE')}>Inspect &amp; return to service</button> : item.status === 'IN_SERVICE' ? <button className="small-outline request-decline" onClick={() => updateStatus(item, 'WITHDRAWN')}>Withdraw</button> : item.status === 'LOST' ? 'Recover through lost-loan records' : '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state">No copies match this search.</div>}</section></>;
}
