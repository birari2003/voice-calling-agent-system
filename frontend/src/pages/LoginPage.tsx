import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, Building2, CircleHelp, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { signIn, user } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not sign in. Check your connection and retry.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-story">
        <div className="login-brand">
          <span className="brand-mark">
            <Building2 size={20} />
          </span>
          <strong>
            Nagar<span className="brand-light">Seva</span>
          </strong>
        </div>
        <div className="story-content">
          <div className="story-kicker">
            <span /> MUNICIPAL OPERATIONS PLATFORM
          </div>
          <h1>
            Better service
            <br />
            starts with
            <br />
            <em>being heard.</em>
          </h1>
          <p>A focused workspace for the people who keep our communities moving.</p>
        </div>
        <div className="story-bottom">
          <ShieldCheck size={17} />
          <span>Secure access for authorized municipal staff</span>
        </div>
        <div className="story-orb orb-one" />
        <div className="story-orb orb-two" />
      </section>
      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="mobile-login-brand">
            <span className="brand-mark">
              <Building2 size={20} />
            </span>
            <strong>
              Nagar<span className="brand-light">Seva</span>
            </strong>
          </div>
          <div className="login-heading">
            <span className="eyebrow">STAFF PORTAL</span>
            <h2>Welcome back</h2>
            <p>Sign in to your municipal workspace.</p>
          </div>
          <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
            <label htmlFor="email">Work email</label>
            <div className="input-wrap">
              <Mail size={17} />
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@municipality.gov.in"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="password-label">
              <label htmlFor="password">Password</label>
              <button
                type="button"
                className="text-button"
                title="Contact your system administrator if you need a password reset."
              >
                <CircleHelp size={14} /> Need help?
              </button>
            </div>
            <div className="input-wrap">
              <LockKeyhole size={17} />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button login-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="spinner spinner-light" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in to workspace <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="login-security">
            <span>
              <ShieldCheck size={16} />
            </span>
            <p>
              <strong>Protected municipal access</strong>
              <br />
              Your session is encrypted and secured.
            </p>
          </div>
          <div className="login-footer">
            <span>© 2026 NagarSeva</span>
            <span>For authorized staff only</span>
          </div>
        </div>
      </section>
    </main>
  );
}
