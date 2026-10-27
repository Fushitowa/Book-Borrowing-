import { useState, type FormEvent } from 'react';
import { AuthArtwork } from '../components/AuthArtwork';
import { BrandMark } from '../components/BrandMark';
import { api } from '../services/api';
import type { User } from '../types';

type AccountRole = 'STUDENT' | 'LIBRARIAN';

interface CreateAccountPageProps {
  onRegister: (user: User) => void;
  onBackToLogin: () => void;
}

export function CreateAccountPage({ onRegister, onBackToLogin }: CreateAccountPageProps) {
  const [role, setRole] = useState<AccountRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!role) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          role,
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          username: form.get('username'),
          email: form.get('email'),
          password,
          studentNumber: form.get('studentNumber'),
          program: form.get('program'),
          yearLevel: form.get('yearLevel'),
          section: form.get('section'),
          invitationCode: form.get('invitationCode'),
        }),
      });
      onRegister(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-layout">
      <AuthArtwork />
      <div className="login-side register-side">
        <div className="login-side-top"><BrandMark /><span>Carbonell <b>Library</b></span></div>
        <div className={`login-form-wrap register-form-wrap${role ? ' register-form-wide' : ''}`}>
          <div className="eyebrow">JOIN YOUR COLLEGE LIBRARY</div>
          {!role ? (
            <>
              <h1>Create your account</h1>
              <p className="login-subtitle">Choose the account type that matches your role.</p>
              <div className="account-role-options" aria-label="Choose an account type">
                <button className="account-role-card" type="button" onClick={() => { setRole('STUDENT'); setError(''); }}>
                  <span className="account-role-icon">♙</span>
                  <span className="account-role-copy"><strong>Student</strong><small>Borrow books and manage your reservations.</small></span>
                  <span className="account-role-arrow">→</span>
                </button>
                <button className="account-role-card" type="button" onClick={() => { setRole('LIBRARIAN'); setError(''); }}>
                  <span className="account-role-icon staff">▤</span>
                  <span className="account-role-copy"><strong>Librarian</strong><small>Staff account · invitation code required.</small></span>
                  <span className="account-role-arrow">→</span>
                </button>
              </div>
              <div className="account-security-note"><span>⌑</span><p>Administrator access is managed separately and cannot be created here.</p></div>
            </>
          ) : (
            <>
              <button type="button" className="auth-back-link" onClick={() => { setRole(null); setError(''); }}>← Change account type</button>
              <h1>Create {role === 'STUDENT' ? 'student' : 'librarian'} account</h1>
              <p className="login-subtitle">Enter your details to join the campus library.</p>
              <form onSubmit={submit} className="account-form">
                <div className="account-form-pair">
                  <label className="account-field"><span>First name</span><input name="firstName" autoComplete="given-name" maxLength={100} required /></label>
                  <label className="account-field"><span>Last name</span><input name="lastName" autoComplete="family-name" maxLength={100} required /></label>
                </div>
                <label className="account-field"><span>Username</span><input name="username" autoComplete="username" minLength={3} maxLength={80} pattern="[a-zA-Z0-9._-]{3,80}" title="Use 3 to 80 letters, numbers, dots, underscores, or dashes." required /><small>3–80 letters, numbers, dots, underscores, or dashes.</small></label>
                <label className="account-field"><span>Email <i>Optional</i></span><input name="email" type="email" autoComplete="email" maxLength={254} /></label>
                {role === 'STUDENT' ? (
                  <>
                    <label className="account-field"><span>Student number</span><input name="studentNumber" maxLength={40} required /></label>
                    <label className="account-field"><span>Program / course <i>Optional</i></span><input name="program" maxLength={120} placeholder="e.g. BS Information Technology" /></label>
                    <div className="account-form-pair">
                      <label className="account-field"><span>Year level <i>Optional</i></span><input name="yearLevel" maxLength={20} placeholder="e.g. 1st Year" /></label>
                      <label className="account-field"><span>Section <i>Optional</i></span><input name="section" maxLength={50} placeholder="e.g. BSIT-1A" /></label>
                    </div>
                  </>
                ) : (
                  <label className="account-field"><span>Staff invitation code</span><input name="invitationCode" type="password" autoComplete="off" required /><small>Request this code from your library administrator.</small></label>
                )}
                <div className="account-form-pair">
                  <label className="account-field"><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required /><small>At least 12 characters.</small></label>
                  <label className="account-field"><span>Confirm password</span><input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={200} required /></label>
                </div>
                {error && <div className="form-error" role="alert">{error}</div>}
                <button className="primary-button account-submit" disabled={busy}>{busy ? <><span className="spinner" /> Creating account…</> : <>Create {role === 'STUDENT' ? 'student' : 'librarian'} account <span>→</span></>}</button>
              </form>
            </>
          )}
          <div className="auth-switch">Already have an account? <button type="button" onClick={onBackToLogin}>Sign in</button></div>
        </div>
        <div className="login-bottom"><span>© {new Date().getFullYear()} Carbonell College Library</span><span>Library services</span></div>
      </div>
    </div>
  );
}
