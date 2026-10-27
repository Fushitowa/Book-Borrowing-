import { useEffect, useState } from 'react';
import { api } from './services/api';
import { NotificationsPanel } from './components/NotificationsPanel';
import { Toast } from './components/LibraryUI';
import { Login } from './pages/LoginPage';
import { Overview } from './pages/OverviewPage';
import { Catalog } from './pages/CatalogPage';
import { Students } from './pages/StudentsPage';
import { Circulation } from './pages/CirculationPage';
import { Loans } from './pages/LoansPage';
import { Reservations } from './pages/ReservationsPage';
import { initials, isStaff, roleLabel } from './utils/format';
import type { Notice, Page } from './types/app';
import type { User } from './types';

const navItems: { id: Page; label: string; icon: string; staffOnly?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: '◫', staffOnly: true },
  { id: 'catalog', label: 'Book catalog', icon: '▤' },
  { id: 'students', label: 'Students', icon: '♙', staffOnly: true },
  { id: 'circulation', label: 'Circulation', icon: '⇄', staffOnly: true },
  { id: 'loans', label: 'Loan activity', icon: '◷' },
  { id: 'reservations', label: 'Reservations', icon: '⌑' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [checkingSession, setCheckingSession] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    api<{ user: User }>('/auth/me').then(({ user: current }) => setUser(current)).catch(() => setUser(null)).finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setPage(isStaff(loggedInUser) ? 'overview' : 'catalog');
    setNotice({ kind: 'success', message: `Welcome back, ${loggedInUser.firstName}.` });
  };

  const handleLogout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear local session even if the API is offline. */ }
    setUser(null);
    setNotice(null);
  };

  if (checkingSession) return <div className="boot-screen"><div className="brand-mark">N</div><span>Opening your library…</span></div>;
  if (!user) return <><Login onLogin={handleLogin} /><Toast notice={notice} onDismiss={() => setNotice(null)} /></>;

  const allowedItems = navItems.filter((item) => !item.staffOnly || isStaff(user));
  const activePage = allowedItems.some((item) => item.id === page) ? page : isStaff(user) ? 'overview' : 'catalog';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">N</div><div><strong>Northstar</strong><span>School library</span></div></div>
        <div className="library-switch"><span className="switch-avatar">SL</span><span><strong>School Library</strong><small>Main library</small></span><span className="chevron">⌄</span></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {allowedItems.map((item) => <button key={item.id} className={`nav-link ${activePage === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === 'loans' && <span className="nav-arrow">›</span>}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-glyph">✦</span><strong>Need a hand?</strong><p>Ask your library administrator for help with your account.</p></div><button className="profile-row" onClick={handleLogout}><span className="profile-avatar">{initials(user)}</span><span className="profile-copy"><strong>{user.firstName} {user.lastName}</strong><small>{roleLabel(user.roles)}</small></span><span className="logout-icon" title="Sign out">↗</span></button></div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><div className="breadcrumb"><span>Library</span><span>/</span><strong>{allowedItems.find((item) => item.id === activePage)?.label}</strong></div><div className="topbar-actions"><span className="today-label">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><button className="icon-button bell-button" aria-label="Notifications" onClick={() => setShowNotifications((value) => !value)}>♧</button><span className="top-avatar">{initials(user)}</span></div></header>
        {showNotifications && <NotificationsPanel onDismiss={() => setShowNotifications(false)} notify={setNotice} />}
        <div className="page-content">
          {activePage === 'overview' && <Overview onGo={setPage} notify={setNotice} />}
          {activePage === 'catalog' && <Catalog user={user} notify={setNotice} />}
          {activePage === 'students' && <Students user={user} notify={setNotice} />}
          {activePage === 'circulation' && <Circulation notify={setNotice} />}
          {activePage === 'loans' && <Loans user={user} notify={setNotice} />}
          {activePage === 'reservations' && <Reservations user={user} notify={setNotice} onGo={setPage} />}
        </div>
      </main>
      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
