import { useState, type FormEvent } from 'react';
import { AuthArtwork } from '../components/AuthArtwork';
import { BrandMark } from '../components/BrandMark';
import { api } from '../services/api';
import type { User } from '../types';

type LoginRole = 'ADMIN' | 'LIBRARIAN' | 'STUDENT';

interface LoginProps {
  onLogin: (user: User) => void;
  onCreateAccount: () => void;
}

export function Login({ onLogin, onCreateAccount }: LoginProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginRole, setLoginRole] = useState<LoginRole>('ADMIN');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get('identifier') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const rememberMe = form.get('rememberMe') === 'on';
    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, rememberMe, expectedRole: loginRole }),
      });
      onLogin(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-layout login-page-layout">
      <AuthArtwork />
      <div className="login-side">
        <div className="login-side-top"><BrandMark /><span>Carbonell <b>Library</b></span></div>
        <div className="login-form-wrap">
          <div className="eyebrow">YOUR LIBRARY, IN ONE PLACE</div>
          <h1>{loginRole === 'STUDENT' ? 'Student sign in' : `${loginRole === 'ADMIN' ? 'Admin' : 'Librarian'} sign in`}</h1>
          <p className="login-subtitle">Sign in with your {loginRole === 'STUDENT' ? 'student' : loginRole === 'ADMIN' ? 'administrator' : 'librarian'} account.</p>
          <div className="login-role-switch" role="group" aria-label="Choose account type">
            {(['ADMIN', 'LIBRARIAN', 'STUDENT'] as const).map((role) => (
              <button key={role} type="button" className={loginRole === role ? 'selected' : ''} aria-pressed={loginRole === role} onClick={() => { setLoginRole(role); setError(''); }}>
                {role === 'ADMIN' ? 'Admin' : role === 'LIBRARIAN' ? 'Librarian' : 'Student'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="login-form">
            <label htmlFor="identifier">Username or email</label>
            <input autoComplete="username" id="identifier" name="identifier" placeholder="e.g. j.santos" required />
            <div className="password-label"><label htmlFor="password">Password</label><span>Protected sign-in</span></div>
            <div className="password-input-wrap">
              <input autoComplete="current-password" id="password" name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required />
              <button className="password-visibility-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
            <label className="remember-option"><input name="rememberMe" type="checkbox" /><span>Remember me</span><small>Keep me signed in on this device</small></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button login-submit" disabled={busy}>{busy ? <><span className="spinner" /> Signing in…</> : <>Sign in as {loginRole === 'ADMIN' ? 'Admin' : loginRole === 'LIBRARIAN' ? 'Librarian' : 'Student'} <span>→</span></>}</button>
          </form>
          <div className="login-support"><span className="lock-icon">⌑</span><span>Staff accounts are created by a library administrator.</span></div>
          <div className="auth-switch">Need a student account? <button type="button" onClick={onCreateAccount}>Create account</button></div>
        </div>
        <div className="login-bottom"><span>© {new Date().getFullYear()} Carbonell College Library</span><span>Library services</span></div>
      </div>
    </div>
  );
}
