import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../services/api';
import { Field, Modal, StatusPill } from '../components/LibraryUI';
import type { Notice } from '../types/app';
import type { User } from '../types';

type AccountRole = 'STUDENT' | 'LIBRARIAN';
type Account = {
  id: number;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  roleCode: AccountRole;
  accountStatus: 'ACTIVE' | 'DISABLED' | 'LOCKED';
  studentNumber: string | null;
  program: string | null;
  yearLevel: string | null;
  section: string | null;
  activeLoans: number;
  maxActiveLoans: number | null;
};

export function Students({ user, notify, adminView = false, librarianView = false }: { user: User; notify: (notice: Notice) => void; adminView?: boolean; librarianView?: boolean }) {
  const [items, setItems] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<AccountRole>('STUDENT');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const isAdmin = user.roles.includes('ADMIN');
  const selectedRole: AccountRole = adminView ? role : 'STUDENT';

  const reload = useCallback(() => {
    setLoading(true);
    api<{ items: Account[] }>(`/users?role=${selectedRole}&q=${encodeURIComponent(query)}`)
      .then((result) => setItems(result.items))
      .catch((error) => notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not load accounts.' }))
      .finally(() => setLoading(false));
  }, [selectedRole, query, notify]);
  useEffect(reload, [reload]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({
        role: selectedRole,
        username: data.get('username'), email: data.get('email'),
        firstName: data.get('firstName'), lastName: data.get('lastName'),
        studentNumber: data.get('studentNumber'), program: data.get('program'),
        yearLevel: data.get('yearLevel'), section: data.get('section'), password: data.get('password'),
      }) });
      setModal(false);
      notify({ kind: 'success', message: `${selectedRole === 'STUDENT' ? 'Student' : 'Librarian'} account created. Share the temporary password securely.` });
      reload();
    } catch (error) {
      notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not create the account.' });
    } finally { setSaving(false); }
  };

  const changeStatus = async (account: Account) => {
    const status = account.accountStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const name = `${account.firstName} ${account.lastName}`;
    if (status === 'DISABLED' && !window.confirm(`Disable ${name}’s ${account.roleCode.toLowerCase()} account? They will no longer be able to sign in.`)) return;
    setBusyId(account.id);
    try {
      await api(`/users/${account.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      notify({ kind: 'success', message: status === 'ACTIVE' ? 'Account reactivated.' : 'Account disabled.' });
      reload();
    } catch (error) {
      notify({ kind: 'error', message: error instanceof Error ? error.message : 'Could not update this account.' });
    } finally { setBusyId(null); }
  };

  const title = adminView ? 'User Management' : librarianView ? 'Student Records' : 'Students';
  return <>
    <div className="page-title-row"><div><div className="eyebrow">PEOPLE</div><h1>{title}</h1><p>{adminView ? 'Manage student and librarian sign-in accounts.' : 'Review student enrollment and borrowing eligibility.'}</p></div>{isAdmin && <button className="primary-button" onClick={() => setModal(true)}><span>＋</span> Add {selectedRole === 'STUDENT' ? 'student' : 'librarian'}</button>}</div>
    {adminView && <div className="account-role-tabs" aria-label="Account type">{(['STUDENT', 'LIBRARIAN'] as const).map((item) => <button key={item} type="button" aria-pressed={role === item} className={role === item ? 'active' : ''} onClick={() => setRole(item)}>{item === 'STUDENT' ? 'Students' : 'Librarians'}</button>)}</div>}
    <div className="catalog-summary"><div><span className="summary-icon">♙</span><span><strong>{items.length}</strong><small>{selectedRole === 'STUDENT' ? 'student accounts' : 'librarian accounts'}</small></span></div><div className="summary-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={selectedRole === 'STUDENT' ? 'Search name, student number, or program' : 'Search librarian name or username'} aria-label={`Search ${selectedRole.toLowerCase()} accounts`} /><kbd>↵</kbd></div></div>
    <section className="surface catalog-surface"><div className="section-heading"><div><h2>{selectedRole === 'STUDENT' ? 'Student directory' : 'Librarian directory'}</h2><p>Accounts are retained to preserve library activity history.</p></div><span className="results-count">{items.length} {selectedRole === 'STUDENT' ? 'students' : 'librarians'}</span></div>
      {loading ? <div className="empty-state">Loading accounts…</div> : items.length ? <div className="table-scroll"><table><thead><tr><th>{selectedRole}</th>{selectedRole === 'STUDENT' && <><th>STUDENT NUMBER</th><th>PROGRAM / YEAR / SECTION</th><th>ACTIVE LOANS</th><th>ELIGIBILITY</th></>}<th>USERNAME</th><th>STATUS</th>{isAdmin && <th>ACTION</th>}</tr></thead><tbody>{items.map((account) => <tr key={account.id}><td><div className="book-cell"><span className="student-avatar">{account.firstName[0]}{account.lastName[0]}</span><span><strong>{account.firstName} {account.lastName}</strong><small>{account.email || 'No email added'}</small></span></div></td>{selectedRole === 'STUDENT' && <><td className="mono">{account.studentNumber || '—'}</td><td>{[account.program, account.yearLevel, account.section].filter(Boolean).join(' · ') || '—'}</td><td>{account.activeLoans} / {account.maxActiveLoans ?? '—'}</td><td><StatusPill label={account.accountStatus !== 'ACTIVE' ? 'Account inactive' : account.maxActiveLoans == null ? 'Policy unavailable' : account.activeLoans >= account.maxActiveLoans ? 'Loan limit reached' : 'Eligible'} tone={account.accountStatus === 'ACTIVE' && account.maxActiveLoans != null && account.activeLoans < account.maxActiveLoans ? 'success' : 'warning'} /></td></>}<td>{account.username}</td><td><StatusPill label={account.accountStatus.toLowerCase()} tone={account.accountStatus === 'ACTIVE' ? 'success' : 'neutral'} /></td>{isAdmin && <td><button className="small-outline" disabled={busyId === account.id} onClick={() => changeStatus(account)}>{busyId === account.id ? 'Saving…' : account.accountStatus === 'ACTIVE' ? 'Disable' : 'Reactivate'}</button></td>}</tr>)}</tbody></table></div> : <div className="empty-state"><span className="empty-icon">♙</span><strong>No {selectedRole.toLowerCase()} accounts found</strong><span>{query ? 'Try another search.' : isAdmin ? `Add the first ${selectedRole.toLowerCase()} account to get started.` : 'Accounts will appear here when they are created.'}</span></div>}
    </section>
    {modal && <Modal title={`Create ${selectedRole.toLowerCase()} account`} subtitle={selectedRole === 'STUDENT' ? 'This creates a sign-in account and student borrowing profile.' : 'This creates a sign-in account with librarian access.'} onClose={() => setModal(false)}><form className="form-grid" onSubmit={create}>
      <div className="form-pair"><Field label="First name" required><input name="firstName" required maxLength={100} autoComplete="given-name" /></Field><Field label="Last name" required><input name="lastName" required maxLength={100} autoComplete="family-name" /></Field></div>
      <div className="form-pair"><Field label="Username" required hint="3–80 letters, numbers, dots, dashes, or underscores"><input name="username" required minLength={3} maxLength={80} autoComplete="username" /></Field>{selectedRole === 'STUDENT' && <Field label="Student number" required><input name="studentNumber" required maxLength={40} /></Field>}</div>
      <Field label="Email" hint="Optional"><input name="email" type="email" maxLength={254} autoComplete="email" /></Field>
      {selectedRole === 'STUDENT' && <><Field label="Program / course" hint="Optional"><input name="program" maxLength={120} placeholder="e.g. BS Information Technology" /></Field><div className="form-pair"><Field label="Year level" hint="Optional"><input name="yearLevel" maxLength={20} placeholder="e.g. 1st Year" /></Field><Field label="Section" hint="Optional"><input name="section" maxLength={50} placeholder="e.g. BSIT-1A" /></Field></div></>}
      <Field label="Temporary password" hint="At least 12 characters; share it securely" required><input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" /></Field>
      <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setModal(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Creating…' : `Create ${selectedRole.toLowerCase()}`}</button></div>
    </form></Modal>}
  </>;
}
