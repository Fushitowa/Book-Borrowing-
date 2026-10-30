import { useCallback, useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { date, isOverdue, isStaff } from '../utils/format';
import type { Notice } from '../types/app';
import type { Loan, User } from '../types';

/* ------------------------------------------------------------------ */
/*  Return Request Modal (student-facing)                              */
/* ------------------------------------------------------------------ */
function ReturnRequestModal({ loan, busy, onConfirm, onCancel }: { loan: Loan; busy: boolean; onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const dueDate = new Date(loan.dueAt);
  const now = new Date();
  const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-card rr-modal" role="dialog" aria-modal="true" aria-labelledby="rr-title">
        <div className="rr-modal-header">
          <div className="rr-modal-icon"><span>⇩</span></div>
          <div>
            <h2 id="rr-title">Return this book</h2>
            <p>You're requesting to return <strong>"{loan.title}"</strong>.</p>
          </div>
        </div>

        <div className="rr-modal-book-card">
          <div className="rr-book-detail">
            <span className="rr-detail-label">Book</span>
            <strong>{loan.title}</strong>
          </div>
          <div className="rr-book-detail">
            <span className="rr-detail-label">Barcode</span>
            <span className="mono">{loan.barcode}</span>
          </div>
          <div className="rr-book-detail">
            <span className="rr-detail-label">Checked out</span>
            <span>{date(loan.checkedOutAt)}</span>
          </div>
          <div className="rr-book-detail">
            <span className="rr-detail-label">Due date</span>
            <span>{date(loan.dueAt)}{daysRemaining > 0 && <small className="rr-days-badge"> {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left</small>}</span>
          </div>
        </div>

        <div className="rr-modal-body">
          <label className="rr-label">Note for the librarian <small className="rr-optional">(optional)</small></label>
          <textarea ref={inputRef} className="rr-textarea" rows={2} placeholder="e.g. I'll drop it off at the front desk this afternoon…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>

        <div className="rr-modal-info">
          <span className="rr-info-icon">ℹ</span>
          <p>The librarian will be notified about your return request. <strong>Please bring the book to the library desk</strong> so they can inspect and confirm the return.</p>
        </div>

        <div className="rr-modal-actions">
          <button className="outline-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="primary-button rr-confirm-btn" disabled={busy} onClick={() => onConfirm(note.trim())}>
            {busy ? <><span className="spinner" /> Submitting…</> : <><span>⇩</span> Request return</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loans Page                                                         */
/* ------------------------------------------------------------------ */
export function Loans({ user, notify, initialFilter = 'ACTIVE', studentHistory = false }: { user: User; notify: (notice: Notice) => void; initialFilter?: string; studentHistory?: boolean }) {
  const [items, setItems] = useState<Loan[]>([]);
  const [filter, setFilter] = useState(initialFilter);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [returningLoan, setReturningLoan] = useState<Loan | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const visibleItems = items.filter((loan) => `${loan.title} ${loan.barcode} ${loan.borrower}`.toLowerCase().includes(query.toLowerCase()));
  const staff = isStaff(user);

  const reload = useCallback(() => {
    setLoading(true);
    api<{ items: Loan[] }>(`/loans?status=${filter}`).then((result) => setItems(result.items)).catch((e) => notify({ kind: 'error', message: e.message })).finally(() => setLoading(false));
  }, [filter, notify]);
  useEffect(reload, [reload]);

  const returnLoan = async (loan: Loan, condition: 'GOOD' | 'DAMAGED') => {
    const conditionLabel = condition === 'GOOD' ? 'good condition' : 'damaged';
    if (!window.confirm(`Confirm "${loan.title}" (${loan.barcode}) was returned in ${conditionLabel}?`)) return;
    try { await api(`/loans/${loan.id}/return`, { method: 'POST', body: JSON.stringify({ condition }) }); notify({ kind: 'success', message: condition === 'GOOD' ? 'Return recorded.' : 'Return recorded and copy marked damaged.' }); reload(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not record return.' }); }
  };

  const renewLoan = async (loan: Loan) => {
    try { const result = await api<{ message: string; dueAt: string }>(`/loans/${loan.id}/renew`, { method: 'POST' }); notify({ kind: 'success', message: `Renewed. New due date: ${date(result.dueAt)}.` }); reload(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not renew this loan.' }); }
  };

  const markLost = async (loan: Loan) => {
    if (!window.confirm(`Mark "${loan.title}" (${loan.barcode}) as lost?`)) return;
    try { await api(`/loans/${loan.id}/lost`, { method: 'POST' }); notify({ kind: 'success', message: 'Loan and physical copy marked lost.' }); reload(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not update this loan.' }); }
  };

  const recover = async (loan: Loan, condition: 'GOOD' | 'DAMAGED') => {
    try { await api(`/loans/${loan.id}/recover`, { method: 'POST', body: JSON.stringify({ condition }) }); notify({ kind: 'success', message: condition === 'GOOD' ? 'Book recovery recorded and copy returned to service.' : 'Book recovery recorded; copy is marked damaged.' }); reload(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not record recovery.' }); }
  };

  /* Student return request */
  const requestReturn = async (loan: Loan, note: string) => {
    setBusy(loan.id);
    try {
      const result = await api<{ message: string }>(`/loans/${loan.id}/request-return`, { method: 'POST', body: JSON.stringify({ note: note || null }) });
      notify({ kind: 'success', message: result.message });
      setReturningLoan(null);
      reload();
    } catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not submit return request.' }); }
    finally { setBusy(null); }
  };

  /* Student cancel return request */
  const cancelReturn = async (loan: Loan) => {
    if (!window.confirm(`Cancel your return request for "${loan.title}"?`)) return;
    setBusy(loan.id);
    try {
      const result = await api<{ message: string }>(`/loans/${loan.id}/cancel-return`, { method: 'POST' });
      notify({ kind: 'success', message: result.message });
      reload();
    } catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not cancel return request.' }); }
    finally { setBusy(null); }
  };

  const isStudent = user.roles.includes('STUDENT') && !staff;
  const showActions = (filter !== 'RETURNED' && filter !== 'ALL' && filter !== 'LOST') || (staff && filter === 'LOST') || isStudent;
  const title = filter === 'OVERDUE' && staff ? 'Overdue monitoring' : filter === 'ACTIVE' && staff ? 'Process returns' : staff ? 'Loan activity' : studentHistory ? 'Borrowing history' : 'My borrowed books';
  const subtitle = filter === 'OVERDUE' && staff ? 'Identify overdue loans and follow up with students.' : filter === 'ACTIVE' && staff ? 'Find active loans and record return condition.' : staff ? 'Track due dates, returns, and circulation history.' : studentHistory ? 'Review books you have checked out, returned, or reported lost.' : 'See your active checkouts and return books before the due date.';

  return <>
    <div className="page-title-row">
      <div>
        <div className="eyebrow">{staff ? 'CIRCULATION' : 'MY LIBRARY'}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {staff && <div className="filter-wrap"><label htmlFor="loan-filter">Show</label><select id="loan-filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ACTIVE">Active loans</option><option value="OVERDUE">Overdue</option><option value="RETURNED">Returned</option><option value="LOST">Lost</option><option value="ALL">All activity</option></select></div>}
    </div>

    {staff && <div className="loan-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search book, barcode, or student" aria-label="Search loans"/><span>{visibleItems.length} matching records</span></div>}

    <section className="surface catalog-surface">
      <div className="section-heading">
        <div>
          <h2>{filter === 'ACTIVE' ? 'Current checkouts' : studentHistory ? 'All previous and current loans' : `${filter.charAt(0)}${filter.slice(1).toLowerCase()} loans`}</h2>
          <p>{isStudent && !studentHistory ? 'You can return books early by clicking the return button.' : 'Overdue status is calculated from the due date.'}</p>
        </div>
        <span className="results-count">{visibleItems.length} records</span>
      </div>

      {loading ? <div className="empty-state">Loading loans…</div> : visibleItems.length ? <div className="table-scroll">
        <table>
          <thead><tr>
            <th>BOOK / COPY</th>
            {staff && <th>BORROWER</th>}
            <th>CHECKED OUT</th>
            <th>DUE DATE</th>
            <th>STATUS</th>
            {showActions && <th>ACTION</th>}
          </tr></thead>
          <tbody>
            {visibleItems.map((loan, index) => {
              const hasReturnRequest = !!loan.returnRequestedAt;
              return <tr key={loan.id} className={hasReturnRequest && staff ? 'rr-highlighted-row' : ''}>
                <td><div className="book-cell">
                  {loan.coverImageUrl
                    ? <span className="book-cover cover-with-image"><img src={loan.coverImageUrl} alt={loan.title + ' cover'} /></span>
                    : <span className={`book-cover cover-${index % 5}`}>{loan.title[0]}</span>}
                  <span>
                    <strong>{loan.title}</strong>
                    <small className="mono">{loan.barcode}</small>
                  </span>
                </div></td>

                {staff && <td>
                  <strong>{loan.borrower}</strong>
                  {loan.borrowerEmail && <small className="cell-sub">{loan.borrowerEmail}</small>}
                </td>}

                <td>{date(loan.checkedOutAt)}</td>
                <td>{date(loan.dueAt)}</td>

                <td>
                  {hasReturnRequest ? (
                    <div className="rr-status-stack">
                      <StatusPill label={isOverdue(loan) ? 'Overdue' : loan.status === 'ACTIVE' ? 'On loan' : loan.status.toLowerCase()} tone={isOverdue(loan) ? 'danger' : loan.status === 'ACTIVE' ? 'warning' : 'neutral'} />
                      <span className="rr-return-badge">⇩ Return requested</span>
                    </div>
                  ) : (
                    <StatusPill label={isOverdue(loan) ? 'Overdue' : loan.status === 'ACTIVE' ? 'On loan' : loan.status.toLowerCase()} tone={isOverdue(loan) ? 'danger' : loan.status === 'ACTIVE' ? 'warning' : 'neutral'} />
                  )}
                </td>

                {showActions && <td>
                  <div className="row-actions">
                    {filter === 'LOST' ? <>
                      <button className="small-outline" onClick={() => recover(loan, 'GOOD')}>Recovered · good</button>
                      <button className="small-outline" onClick={() => recover(loan, 'DAMAGED')}>Recovered · damaged</button>
                    </> : <>
                      {/* Renew (both staff and students) */}
                      {(loan.status === 'ACTIVE' || isOverdue(loan)) && !hasReturnRequest && <button className="small-outline" disabled={busy === loan.id} onClick={() => renewLoan(loan)}>Renew</button>}

                      {/* Staff actions */}
                      {staff && <>
                        <button className={`small-outline ${hasReturnRequest ? 'rr-confirm-return-btn' : ''}`} onClick={() => returnLoan(loan, 'GOOD')}>{hasReturnRequest ? '✓ Confirm return · good' : 'Return · good'}</button>
                        <button className="small-outline request-decline" onClick={() => returnLoan(loan, 'DAMAGED')}>Return · damaged</button>
                        <button className="icon-button mini-action lost-action" title="Mark as lost" aria-label={`Mark ${loan.title} as lost`} onClick={() => markLost(loan)}>×</button>
                      </>}

                      {/* Student actions */}
                      {isStudent && loan.status === 'ACTIVE' && !studentHistory && <>
                        {hasReturnRequest ? (
                          <div className="rr-student-status">
                            <span className="rr-pending-label">✓ Return requested</span>
                            <button className="rr-cancel-btn" disabled={busy === loan.id} onClick={() => cancelReturn(loan)}>
                              {busy === loan.id ? 'Cancelling…' : 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          <button className="rr-return-btn" disabled={busy === loan.id} onClick={() => setReturningLoan(loan)}>
                            <span className="rr-btn-icon">⇩</span> Return book
                          </button>
                        )}
                      </>}
                    </>}
                  </div>
                </td>}
              </tr>;
            })}
          </tbody>
        </table>
      </div> : <div className="empty-state">
        <span className="empty-icon">◷</span>
        <strong>No loan records</strong>
        <span>There are no loans in this view.</span>
      </div>}
    </section>

    {/* Return request modal */}
    {returningLoan && <ReturnRequestModal
      loan={returningLoan}
      busy={busy === returningLoan.id}
      onConfirm={(note) => requestReturn(returningLoan, note)}
      onCancel={() => setReturningLoan(null)}
    />}
  </>;
}
