import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { checkPasswordRules } from '../lib/password';

interface RegisterScreenProps {
  onRegister: (email: string, password: string, name: string) => Promise<void>;
  onShowLogin: () => void;
  error: string | null;
}

export function RegisterScreen({ onRegister, onShowLogin, error }: RegisterScreenProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = useMemo(() => checkPasswordRules(password), [password]);
  const allRulesMet = rules.every(rule => rule.met);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (name.trim() === '') {
      setLocalError('Name is required');
      return;
    }
    if (!allRulesMet) {
      setLocalError('Password does not meet every requirement');
      return;
    }
    if (password !== confirm) {
      setLocalError('Passwords do not match');
      return;
    }

    setBusy(true);
    try {
      await onRegister(email.trim(), password, name.trim());
    } catch {
      // Surfaced through the `error` prop; swallowing stops an unhandled rejection.
    } finally {
      setBusy(false);
    }
  };

  const shown = localError ?? error;

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

        <h1 className="rt-login-title">Create account</h1>
        <p className="rt-login-sub">
          A new account starts with no workspace and no program — someone with access has to
          grant them.
        </p>

        {shown && (
          <p className="rt-field-error" role="alert">
            {shown}
          </p>
        )}

        <div className="rt-field">
          <label htmlFor="rt-reg-name">Name</label>
          <input
            id="rt-reg-name"
            className="rt-input"
            autoComplete="name"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </div>

        <div className="rt-field">
          <label htmlFor="rt-reg-email">Email</label>
          <input
            id="rt-reg-email"
            className="rt-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </div>

        <div className="rt-field">
          <label htmlFor="rt-reg-password">Password</label>
          <input
            id="rt-reg-password"
            className="rt-input"
            type="password"
            autoComplete="new-password"
            aria-describedby="rt-reg-rules"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </div>

        {/* Requirements are listed up front and tick live, so a rejection is
            never the first time the user learns the rules. */}
        <ul className="rt-rules" id="rt-reg-rules">
          {rules.map(rule => (
            <li key={rule.label} className="rt-rule" data-met={rule.met}>
              {rule.met ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <X size={13} aria-hidden="true" />
              )}
              {rule.label}
              <span className="rt-visually-hidden">{rule.met ? ' — met' : ' — not met'}</span>
            </li>
          ))}
        </ul>

        <div className="rt-field">
          <label htmlFor="rt-reg-confirm">Confirm password</label>
          <input
            id="rt-reg-confirm"
            className="rt-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
          />
        </div>

        <button type="submit" className="rt-btn-primary rt-login-submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <p className="rt-login-hint">
          Already have an account?{' '}
          <button type="button" className="rt-link-button" onClick={onShowLogin}>
            Sign in
          </button>
        </p>
      </form>
    </main>
  );
}
