import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { StatusPill } from '../components/LibraryUI';
import { date, isOverdue, isStaff } from '../utils/format';
import type { Notice } from '../types/app';
import type { Loan, User } from '../types';
export function Loans({ user, notify, initialFilter = 'ACTIVE', studentHistory = false }: { user: User; notify: (notice: Notice) => void; initialFilter?: string; studentHistory?: boolean }) {
  const [items, setItems] = useState<Loan[]>([]);
  const [filter, setFilter] = useState(initialFilter);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const visibleItems = items.filter((loan) => `${loan.title} ${loan.barcode} ${loan.borrower}`.toLowerCase().includes(query.toLowerCase()));
  const staff = isStaff(user);
  const reload = useCallback(() => { setLoading(true); api<{ items: Loan[] }>(`/loans?status=${filter}`).then((result) => setItems(result.items)).catch((e) => notify({ kind: 'error', message: e.message })).finally(() => setLoading(false)); }, [filter, notify]);
  useEffect(reload, [reload]);
  const returnLoan = async (loan: Loan, condition: 'GOOD' | 'DAMAGED') => {
    const conditionLabel = condition === 'GOOD' ? 'good condition' : 'damaged';
    if (!window.confirm(`Confirm “${loan.title}” (${loan.barcode}) was returned in ${conditionLabel}?`)) return;
    try { await api(`/loans/${loan.id}/return`, { method: 'POST', body: JSON.stringify({ condition }) }); notify({ kind: 'success', message: condition === 'GOOD' ? 'Return recorded.' : 'Return recorded and copy marked damaged.' }); reload(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not record return.' }); }
  };
  const renewLoan = async (loan: Loan) => {
    try { const result = await api<{ message: string; dueAt: string }>(`/loans/${loan.id}/renew`, { method: 'POST' }); notify({ kind: 'success', message: `Renewed. New due date: ${date(result.dueAt)}.` }); reload(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not renew this loan.' }); }
  };
  const markLost = async (loan: Loan) => {
    if (!window.confirm(`Mark “${loan.title}” (${loan.barcode}) as lost?`)) return;
    try { await api(`/loans/${loan.id}/lost`, { method: 'POST' }); notify({ kind: 'success', message: 'Loan and physical copy marked lost.' }); reload(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not update this loan.' }); }
  };
  const recover = async (loan: Loan, condition: 'GOOD' | 'DAMAGED') => {
    try { await api(`/loans/${loan.id}/recover`, { method: 'POST', body: JSON.stringify({ condition }) }); notify({ kind: 'success', message: condition === 'GOOD' ? 'Book recovery recorded and copy returned to service.' : 'Book recovery recorded; copy is marked damaged.' }); reload(); }
    catch (error) { notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not record recovery.' }); }
  };
  const showActions = (filter !== 'RETURNED' && filter !== 'ALL' && filter !== 'LOST') || (staff && filter === 'LOST');
  const title = filter === 'OVERDUE' && staff ? 'Overdue monitoring' : filter === 'ACTIVE' && staff ? 'Process returns' : staff ? 'Loan activity' : studentHistory ? 'Borrowing history' : 'My borrowed books';
  const subtitle = filter === 'OVERDUE' && staff ? 'Identify overdue loans and follow up with students.' : filter === 'ACTIVE' && staff ? 'Find active loans and record return condition.' : staff ? 'Track due dates, returns, and circulation history.' : studentHistory ? 'Review books you have checked out, returned, or reported lost.' : 'See your active checkouts, borrowing dates, due dates, and status.';
  return <><div className="page-title-row"><div><div className="eyebrow">{staff ? 'CIRCULATION' : 'MY LIBRARY'}</div><h1>{title}</h1><p>{subtitle}</p></div>{staff && <div className="filter-wrap"><label htmlFor="loan-filter">Show</label><select id="loan-filter" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ACTIVE">Active loans</option><option value="OVERDUE">Overdue</option><option value="RETURNED">Returned</option><option value="LOST">Lost</option><option value="ALL">All activity</option></select></div>}</div>{staff && <div className="loan-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search book, barcode, or student" aria-label="Search loans"/><span>{visibleItems.length} matching records</span></div>}<section className="surface catalog-surface"><div className="section-heading"><div><h2>{filter === 'ACTIVE' ? 'Current checkouts' : studentHistory ? 'All previous and current loans' : `${filter.charAt(0)}${filter.slice(1).toLowerCase()} loans`}</h2><p>Overdue status is calculated from the due date.</p></div><span className="results-count">{visibleItems.length} records</span></div>{loading ? <div className="empty-state">Loading loans…</div> : visibleItems.length ? <div className="table-scroll"><table><thead><tr><th>BOOK / COPY</th>{staff && <th>BORROWER</th>}<th>CHECKED OUT</th><th>DUE DATE</th><th>STATUS</th>{showActions && <th>ACTION</th>}</tr></thead><tbody>{visibleItems.map((loan, index) => <tr key={loan.id}><td><div className="book-cell"><span className={`book-cover cover-${index % 5}`}>{loan.title[0]}</span><span><strong>{loan.title}</strong><small className="mono">{loan.barcode}</small></span></div></td>{staff && <td><strong>{loan.borrower}</strong>{loan.borrowerEmail && <small className="cell-sub">{loan.borrowerEmail}</small>}</td>}<td>{date(loan.checkedOutAt)}</td><td>{date(loan.dueAt)}</td><td><StatusPill label={isOverdue(loan) ? 'Overdue' : loan.status === 'ACTIVE' ? 'On loan' : loan.status.toLowerCase()} tone={isOverdue(loan) ? 'danger' : loan.status === 'ACTIVE' ? 'warning' : 'neutral'} /></td>{showActions && <td><div className="row-actions">{filter === 'LOST' ? <><button className="small-outline" onClick={() => recover(loan, 'GOOD')}>Recovered · good</button><button className="small-outline" onClick={() => recover(loan, 'DAMAGED')}>Recovered · damaged</button></> : <>{(loan.status === 'ACTIVE' || isOverdue(loan)) && <button className="small-outline" onClick={() => renewLoan(loan)}>Renew</button>}{staff && <><button className="small-outline" onClick={() => returnLoan(loan, 'GOOD')}>Return · good</button><button className="small-outline request-decline" onClick={() => returnLoan(loan, 'DAMAGED')}>Return · damaged</button><button className="icon-button mini-action lost-action" title="Mark as lost" aria-label={`Mark ${loan.title} as lost`} onClick={() => markLost(loan)}>×</button></>}</>}</div></td>}</tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon">◷</span><strong>No loan records</strong><span>There are no loans in this view.</span></div>}</section></>;
}
