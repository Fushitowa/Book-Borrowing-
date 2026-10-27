import { useState, type FormEvent } from 'react';
import { AuthArtwork } from '../components/AuthArtwork';
import { api } from '../services/api';
import type { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
  onCreateAccount: () => void;
}

export function Login({ onLogin, onCreateAccount }: LoginProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      onLogin(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-layout">
      <AuthArtwork />
      <div className="login-side">
        <div className="login-side-top"><span className="brand-mark">C</span><span>Carbonell <b>Library</b></span></div>
        <div className="login-form-wrap">
          <div className="eyebrow">YOUR LIBRARY, IN ONE PLACE</div>
          <h1>Welcome back</h1>
          <p className="login-subtitle">Sign in to continue to your school library.</p>
          <form onSubmit={submit} className="login-form">
            <label htmlFor="identifier">Username or email</label>
            <input autoComplete="username" id="identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="e.g. j.santos" required />
            <div className="password-label"><label htmlFor="password">Password</label><span>Protected sign-in</span></div>
            <input autoComplete="current-password" id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required />
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button login-submit" disabled={busy}>{busy ? <><span className="spinner" /> Signing in…</> : <>Sign in <span>→</span></>}</button>
          </form>
          <div className="login-support"><span className="lock-icon">⌑</span><span>Your account is managed by your school library.</span></div>
          <div className="auth-switch">New to Carbonell Library? <button type="button" onClick={onCreateAccount}>Create an account</button></div>
        </div>
        <div className="login-bottom"><span>© {new Date().getFullYear()} School Library</span><span>Library services</span></div>
      </div>
    </div>
  );
}
