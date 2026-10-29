import { useEffect, useState } from 'react';
import { api } from './services/api';
import { NotificationsPanel } from './components/NotificationsPanel';
import { BrandMark } from './components/BrandMark';
import { Toast } from './components/LibraryUI';
import { Login } from './pages/LoginPage';
import { CreateAccountPage } from './pages/CreateAccountPage';
import { Overview } from './pages/OverviewPage';
import { Catalog } from './pages/CatalogPage';
import { Students } from './pages/StudentsPage';
import { Circulation } from './pages/CirculationPage';
import { Loans } from './pages/LoansPage';
import { Reservations } from './pages/ReservationsPage';
import { AdminAuditLogs, AdminNotifications, AdminReports, AdminSettings } from './pages/AdminPages';
import { BorrowingRequests, Inventory } from './pages/LibrarianPages';
import { StudentDashboard, StudentProfile } from './pages/StudentPages';
import { initials, isStaff, roleLabel } from './utils/format';
import type { Notice, Page } from './types/app';
import type { User } from './types';

const adminNavItems: { id: Page; label: string; icon: string }[] = [
  { id: 'overview', label: 'Dashboard', icon: '◫' },
  { id: 'students', label: 'User Management', icon: '♙' },
  { id: 'catalog', label: 'Book Management', icon: '▤' },
  { id: 'inventory', label: 'Categories & Inventory', icon: '◇' },
  { id: 'loans', label: 'Borrowing Transactions', icon: '⇄' },
  { id: 'reservations', label: 'Reservations & Returns', icon: '⌑' },
  { id: 'reports', label: 'Reports & Analytics', icon: '▥' },
  { id: 'notifications', label: 'Notifications', icon: '♧' },
  { id: 'audit', label: 'Audit Logs', icon: '◷' },
  { id: 'settings', label: 'System Settings', icon: '⚙' },
];

const staffNavItems: { id: Page; label: string; icon: string }[] = [
  { id: 'overview', label: 'Dashboard', icon: '◫' },
  { id: 'catalog', label: 'Search Books', icon: '⌕' },
  { id: 'circulation', label: 'Issue / Borrow Books', icon: '⇧' },
  { id: 'loans', label: 'Process Returns', icon: '⇩' },
  { id: 'borrowing-requests', label: 'Borrowing Requests', icon: '▤' },
  { id: 'reservations', label: 'Reservations', icon: '▦' },
  { id: 'students', label: 'Student Records', icon: '♙' },
  { id: 'inventory', label: 'Book Inventory', icon: '▥' },
  { id: 'overdue', label: 'Overdue Monitoring', icon: '◷' },
  { id: 'reports', label: 'Reports', icon: '▧' },
];

const studentNavItems: { id: Page; label: string; icon: string }[] = [
  { id: 'student-dashboard', label: 'My Dashboard', icon: '◫' },
  { id: 'catalog', label: 'Browse Books', icon: '⌕' },
  { id: 'loans', label: 'My Borrowed Books', icon: '▤' },
  { id: 'reservations', label: 'My Reservations', icon: '⌑' },
  { id: 'history', label: 'Borrowing History', icon: '◷' },
  { id: 'notifications', label: 'Notifications', icon: '♧' },
  { id: 'profile', label: 'My Profile', icon: '♙' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [checkingSession, setCheckingSession] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'create-account'>('login');
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
    setPage(isStaff(loggedInUser) ? 'overview' : 'student-dashboard');
    setNotice({ kind: 'success', message: `Welcome back, ${loggedInUser.firstName}.` });
  };

  const handleRegister = (newUser: User) => {
    setUser(newUser);
    setPage(isStaff(newUser) ? 'overview' : 'student-dashboard');
    setNotice({ kind: 'success', message: `Account created. Welcome to Carbonell Library, ${newUser.firstName}.` });
  };

  const handleLogout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* Clear local session even if the API is offline. */ }
    setUser(null);
    setNotice(null);
  };

  if (checkingSession) return <div className="boot-screen"><BrandMark /><span>Opening your library…</span></div>;
  if (!user) return <>
    {authView === 'login'
      ? <Login onLogin={handleLogin} onCreateAccount={() => setAuthView('create-account')} />
      : <CreateAccountPage onRegister={handleRegister} onBackToLogin={() => setAuthView('login')} />}
    <Toast notice={notice} onDismiss={() => setNotice(null)} />
  </>;

  const isAdmin = user.roles.includes('ADMIN');
  const allowedItems = isAdmin ? adminNavItems : isStaff(user) ? staffNavItems : studentNavItems;
  const activePage = allowedItems.some((item) => item.id === page) ? page : isStaff(user) ? 'overview' : 'student-dashboard';
  const activePageLabel = allowedItems.find((item) => item.id === activePage)?.label ?? '';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><BrandMark /><div><strong>Carbonell</strong><span>College library</span></div></div>
        <div className="library-switch"><span className="switch-avatar">CL</span><span><strong>College Library</strong><small>Main campus</small></span><span className="chevron">⌄</span></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {allowedItems.map((item) => <button key={item.id} type="button" aria-label={item.label} aria-current={activePage === item.id ? 'page' : undefined} title={item.label} className={`nav-link ${activePage === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span className="nav-label">{item.label}</span>{item.id === 'loans' && <span className="nav-arrow" aria-hidden="true">›</span>}</button>)}
        </nav>
        <div className="sidebar-bottom"><button type="button" className="profile-row" onClick={handleLogout}><span className="profile-avatar">{initials(user)}</span><span className="profile-copy"><strong>{user.firstName} {user.lastName}</strong><small>{roleLabel(user.roles)}</small></span><span className="logout-icon" title="Sign out">↗</span></button></div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><div className="breadcrumb"><span>Library</span><span>/</span><strong>{activePageLabel}</strong></div><div className="topbar-actions"><span className="today-label">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><button className="icon-button bell-button" aria-label="Notifications" onClick={() => setShowNotifications((value) => !value)}>♧</button><button className="icon-button sign-out-mobile" aria-label="Sign out" title="Sign out" onClick={handleLogout}>↗</button><span className="top-avatar" aria-hidden="true">{initials(user)}</span></div></header>
        {showNotifications && <NotificationsPanel onDismiss={() => setShowNotifications(false)} notify={setNotice} />}
        <div className="page-content">
          {activePage === 'overview' && <Overview onGo={setPage} notify={setNotice} isAdmin={isAdmin} isLibrarian={!isAdmin && user.roles.includes('LIBRARIAN')} />}
          {activePage === 'student-dashboard' && user.roles.includes('STUDENT') && <StudentDashboard user={user} notify={setNotice} onGo={setPage} />}
          {activePage === 'catalog' && <Catalog user={user} notify={setNotice} />}
          {activePage === 'inventory' && (isAdmin ? <Catalog user={user} notify={setNotice} inventoryMode /> : <Inventory notify={setNotice} />)}
          {activePage === 'students' && <Students user={user} notify={setNotice} adminView={isAdmin} librarianView={!isAdmin && user.roles.includes('LIBRARIAN')} />}
          {activePage === 'circulation' && <Circulation notify={setNotice} />}
          {activePage === 'loans' && <Loans key="loans-active" user={user} notify={setNotice} />}
          {activePage === 'history' && user.roles.includes('STUDENT') && <Loans key="loans-history" user={user} notify={setNotice} initialFilter="ALL" studentHistory />}
          {activePage === 'reservations' && <Reservations user={user} notify={setNotice} onGo={setPage} />}
          {activePage === 'profile' && user.roles.includes('STUDENT') && <StudentProfile notify={setNotice} />}
          {activePage === 'borrowing-requests' && user.roles.includes('LIBRARIAN') && <BorrowingRequests notify={setNotice} />}
          {activePage === 'overdue' && <Loans user={user} notify={setNotice} initialFilter="OVERDUE" />}
          {activePage === 'reports' && (isAdmin || user.roles.includes('LIBRARIAN')) && <AdminReports notify={setNotice} isLibrarian={!isAdmin} />}
          {activePage === 'notifications' && (isAdmin || user.roles.includes('STUDENT')) && <AdminNotifications notify={setNotice} isStudent={!isAdmin} />}
          {activePage === 'audit' && isAdmin && <AdminAuditLogs notify={setNotice} />}
          {activePage === 'settings' && isAdmin && <AdminSettings notify={setNotice} />}
        </div>
      </main>
      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
