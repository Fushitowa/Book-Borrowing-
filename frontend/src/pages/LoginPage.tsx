import { useState, type FormEvent } from 'react';
import { api } from '../services/api';
import type { User } from '../types';
export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }); onLogin(result.user); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign in.'); }
    finally { setBusy(false); }
  };
  return <div className="login-layout"><div className="login-art"><div className="art-grain"/><div className="art-top"><div className="brand-mark brand-mark-light">N</div><span>NORTHSTAR <i>LIBRARY</i></span></div><div className="book-art"><div className="book book-one"><span>THE<br/>GARDEN<br/>OF WORDS</span><i/></div><div className="book book-two"><span>ATLAS<br/>OF IDEAS</span><i/></div><div className="book book-three"><span>THE QUIET<br/>ARCHIVE</span><i/></div><div className="book book-four"><span>FIELD<br/>NOTES<br/>NO. 04</span></div><div className="plant"><b/><b/><b/><b/><b/><i/></div><div className="sun-disc"/></div><div className="art-caption"><span>READ. DISCOVER. GROW.</span><h2>A little more<br/>wonder, every day.</h2><p>Your school’s shared space for stories, study, and new ideas.</p></div><div className="art-footer"><span>SCHOOL LIBRARY</span><span>READ · LEARN · GROW</span></div></div><div className="login-side"><div className="login-side-top"><span className="brand-mark">N</span><span>Northstar <b>Library</b></span></div><div className="login-form-wrap"><div className="eyebrow">YOUR LIBRARY, IN ONE PLACE</div><h1>Welcome back</h1><p className="login-subtitle">Sign in to continue to your school library.</p><form onSubmit={submit} className="login-form"><label htmlFor="identifier">Username or email</label><input autoComplete="username" id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="e.g. j.santos" required/><div className="password-label"><label htmlFor="password">Password</label><span>Protected sign-in</span></div><input autoComplete="current-password" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required/>{error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? <><span className="spinner"/> Signing in…</> : <>Sign in <span>→</span></>}</button></form><div className="login-support"><span className="lock-icon">⌑</span><span>Your account is managed by your school library.</span></div></div><div className="login-bottom"><span>© {new Date().getFullYear()} School Library</span><span>Library services</span></div></div></div>;
}
