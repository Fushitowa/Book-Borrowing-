import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { date } from '../utils/format';
import type { Notice } from '../types/app';

type RequestItem = { id: number; bookId: number; studentId: number; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ISSUED'; studentNote: string | null; responseReason: string | null; loanId: number | null; requestedAt: string; resolvedAt: string | null; issuedAt: string | null; title: string; authors: string | null; student: string; studentNumber: string | null; availableCopies: number };
type CopyItem = { id: number; bookId: number; barcode: string; status: 'IN_SERVICE' | 'DAMAGED' | 'LOST' | 'WITHDRAWN'; shelfLocation: string | null; title: string; borrower: string | null; activeLoanId: number | null };

export function BorrowingRequests({ notify }: { notify: (notice: Notice) => void }) {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [copies, setCopies] = useState<{ id: number; bookId: number; barcode: string; title: string; shelfLocation: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api<{ items: RequestItem[] }>('/borrowing-requests?status=ALL'), api<{ items: typeof copies }>('/books/available-copies')])
      .then(([requests, available]) => { setItems(requests.items); setCopies(available.items); })
      .catch((error) => notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load borrowing requests.' }))
      .finally(() => setLoading(false));
  }, [notify]);
  useEffect(load, [load]);
  const approve = async (item: RequestItem) => {
    setBusy(item.id);
    try { await api(`/borrowing-requests/${item.id}/approve`, { method: 'POST' }); notify({ kind: 'success', message: `Approved ${item.student}’s request. Issue the copy when they collect it.` }); load(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not approve request.' }); }
    finally { setBusy(null); }
  };
  const issue = async (item: RequestItem) => {
    const copyId = Number(selected[item.id]);
    if (!copyId) { notify({ kind: 'error', message: 'Choose an available physical copy to issue.' }); return; }
    setBusy(item.id);
    try { await api(`/borrowing-requests/${item.id}/issue`, { method: 'POST', body: JSON.stringify({ copyId }) }); notify({ kind: 'success', message: `Issued “${item.title}” to ${item.student}.` }); load(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not issue this copy.' }); }
    finally { setBusy(null); }
  };
  const reject = async (item: RequestItem) => {
    const reason = window.prompt(`Reason for declining ${item.student}'s request for “${item.title}”:`);
    if (reason == null) return;
    if (!reason.trim()) { notify({ kind: 'error', message: 'Enter a reason so the student knows why the request was declined.' }); return; }
    setBusy(item.id);
    try { await api(`/borrowing-requests/${item.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); notify({ kind: 'success', message: 'Request declined and student notified.' }); load(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not decline request.' }); }
    finally { setBusy(null); }
  };
  const pending = items.filter((item) => item.status === 'PENDING').length;
  const approved = items.filter((item) => item.status === 'APPROVED').length;
  return <><div className="page-title-row"><div><div className="eyebrow">LIBRARY SERVICE DESK</div><h1>Borrowing requests</h1><p>Review requests first; record checkout only when handing over a physical copy.</p></div><span className="results-count">{pending} pending · {approved} approved to issue</span></div><section className="surface catalog-surface"><div className="section-heading"><div><h2>Student requests</h2><p>Approval does not check out a book. Declines require a reason.</p></div><span className="results-count">{items.length} requests</span></div>{loading ? <div className="empty-state">Loading requests…</div> : items.length ? <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>REQUESTED BOOK</th><th>REQUESTED</th><th>AVAILABLE COPIES</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><div className="book-cell"><span className="student-avatar">{item.student.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{item.student}</strong><small>{item.studentNumber || 'No student number'}</small></span></div></td><td><strong>{item.title}</strong><small className="cell-sub">{item.authors || 'Author not listed'}{item.studentNote ? ` · Note: ${item.studentNote}` : ''}</small>{item.responseReason && <small className="cell-sub">Reason: {item.responseReason}</small>}</td><td>{date(item.requestedAt)}</td><td>{item.status === 'APPROVED' ? <select aria-label={`Copy for ${item.title}`} value={selected[item.id] ?? ''} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Select copy ({item.availableCopies})</option>{copies.filter((copy) => copy.bookId === item.bookId).map((copy) => <option key={copy.id} value={copy.id}>{copy.barcode}{copy.shelfLocation ? ` · ${copy.shelfLocation}` : ''}</option>)}</select> : item.availableCopies}</td><td><StatusPill label={item.status === 'APPROVED' ? 'approved · awaiting issue' : item.status.toLowerCase()} tone={item.status === 'PENDING' ? 'warning' : item.status === 'APPROVED' || item.status === 'ISSUED' ? 'success' : 'neutral'} /></td><td>{item.status === 'PENDING' ? <div className="row-actions"><button className="small-outline" disabled={busy === item.id} onClick={() => approve(item)}>{busy === item.id ? 'Saving…' : 'Approve'}</button><button className="small-outline request-decline" disabled={busy === item.id} onClick={() => reject(item)}>Decline</button></div> : item.status === 'APPROVED' ? <button className="small-outline" disabled={busy === item.id || !selected[item.id]} onClick={() => issue(item)}>{busy === item.id ? 'Issuing…' : 'Issue copy'}</button> : item.loanId ? <span>Loan #{item.loanId}</span> : '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon">▤</span><strong>No borrowing requests</strong><span>Student requests will appear here for review.</span></div>}</section></>;
}
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
  return <><div className="page-title-row"><div><div className="eyebrow">COLLECTION OPERATIONS</div><h1>Book inventory</h1><p>Track each physical copy, its circulation state, and shelf location.</p></div></div><div className="stat-grid inventory-stat-grid">{([['In service', counts.IN_SERVICE, 'sage'], ['Damaged', counts.DAMAGED, 'rose'], ['Lost', counts.LOST, 'gold'], ['Withdrawn', counts.WITHDRAWN, 'blue']] as const).map(([label, value, tint]) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tint}`}>▤</span></div><div className="stat-value">{value}</div><div className="stat-note">Copies shown by current filter</div></div>)}</div><section className="surface catalog-surface"><div className="section-heading inventory-tools"><div><h2>Physical copies</h2><p>Damaged copies return to service only after inspection; lost copies require a recovery record.</p></div><div className="inventory-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, barcode, shelf" aria-label="Search copies"/><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter copy status"><option value="ALL">All statuses</option><option value="IN_SERVICE">In service</option><option value="DAMAGED">Damaged</option><option value="LOST">Lost</option><option value="WITHDRAWN">Withdrawn</option></select></div></div>{loading ? <div className="empty-state">Loading inventory…</div> : items.length ? <div className="table-scroll"><table><thead><tr><th>BOOK / COPY</th><th>BARCODE</th><th>SHELF</th><th>BORROWER</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.title}</td><td className="mono">{item.barcode}</td><td>{item.shelfLocation || '—'}</td><td>{item.borrower || '—'}</td><td><StatusPill label={item.status.replace(/_/g, ' ').toLowerCase()} tone={item.status === 'IN_SERVICE' ? 'success' : item.status === 'DAMAGED' || item.status === 'LOST' ? 'danger' : 'neutral'} /></td><td>{item.activeLoanId ? 'On loan' : item.status === 'DAMAGED' || item.status === 'WITHDRAWN' ? <button className="small-outline" onClick={() => updateStatus(item, 'IN_SERVICE')}>Inspect & return to service</button> : item.status === 'IN_SERVICE' ? <button className="small-outline request-decline" onClick={() => updateStatus(item, 'WITHDRAWN')}>Withdraw</button> : item.status === 'LOST' ? 'Recover through lost-loan records' : '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state">No copies match this search.</div>}</section></>;
}
