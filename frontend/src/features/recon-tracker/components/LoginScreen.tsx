import { useState } from 'react';
import { BrandMark } from './BrandMark';

interface LoginScreenProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onShowRegister: () => void;
  error: string | null;
}

export function LoginScreen({ onSignIn, onShowRegister, error }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onSignIn(email, password);
    } catch {
      // The message is already surfaced through the `error` prop; swallowing
      // here only stops an unhandled rejection.
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="rt-login" id="rt-main">
      <form className="rt-login-card" onSubmit={handleSubmit}>
        <div className="rt-login-brand">
          <span className="rt-brand-mark" aria-hidden="true">
            <BrandMark size={18} />
          </span>
          <span>
            <span className="rt-brand-name">Merovíngio</span>
            <span className="rt-brand-tagline">Recon &amp; Workflow</span>
          </span>
        </div>

        <h1 className="rt-login-title">Sign in</h1>
        <p className="rt-login-sub">
          The gateway requires authentication for runs, scope and tool registry.
        </p>

        {error && (
          <p className="rt-field-error" role="alert">
            {error}
          </p>
        )}

        <div className="rt-field">
          <label htmlFor="rt-email">Email</label>
          <input
            id="rt-email"
            className="rt-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </div>

        <div className="rt-field">
          <label htmlFor="rt-password">Password</label>
          <input
            id="rt-password"
            className="rt-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </div>

        <button type="submit" className="rt-btn-primary rt-login-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="rt-login-hint">
          No account yet?{' '}
          <button type="button" className="rt-link-button" onClick={onShowRegister}>
            Create one
          </button>
          {' '}— or seed one with <code>backend-gateway/scripts/seed_user.py</code>.
        </p>
      </form>
    </main>
  );
}
