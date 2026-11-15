import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { registerSchema, loginSchema, forgotSchema, resetSchema } from '@mimi/shared';
import { useT } from '../i18n';
import { useAuth } from '../stores/auth';
import { authenticate, request, session, ApiError } from '../lib/api';
import { AvatarPicker } from '../components/AvatarPicker';
import { ErrorMessage } from '../components/Feedback';

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' | 'reset' }) {
  const t = useT(),
    navigate = useNavigate(),
    user = useAuth((s) => s.user),
    setUser = useAuth((s) => s.setUser);
  const [avatarId, setAvatarId] = useState('comet'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [done, setDone] = useState(false);
  const [resetToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('token') ?? '',
  );
  useEffect(() => {
    if (mode === 'reset') history.replaceState(null, '', location.pathname);
  }, [mode]);
  if (user && (mode === 'login' || mode === 'register')) return <Navigate to="/" replace />;
  const title = {
    login: 'loginTitle',
    register: 'registerTitle',
    forgot: 'forgotTitle',
    reset: 'resetTitle',
  } as const;
  const submit = {
    login: 'login',
    register: 'register',
    forgot: 'sendReset',
    reset: 'resetButton',
  } as const;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? ''),
      password = String(form.get('password') ?? '');
    try {
      if (!navigator.onLine) throw new ApiError('NETWORK_ERROR');
      // Refresh a potentially expired CSRF cookie before an unauthenticated operation.
      await session();
      if (mode === 'register') {
        const result = registerSchema.safeParse({
          email,
          password,
          username: String(form.get('username') ?? ''),
          avatarId,
        });
        if (!result.success) throw new ApiError('VALIDATION_ERROR');
        setUser(await authenticate('/auth/register', result.data));
        navigate('/', { replace: true });
      } else if (mode === 'login') {
        const result = loginSchema.safeParse({ email, password });
        if (!result.success) throw new ApiError('VALIDATION_ERROR');
        setUser(await authenticate('/auth/login', result.data));
        navigate('/', { replace: true });
      } else if (mode === 'forgot') {
        const result = forgotSchema.safeParse({ email });
        if (!result.success) throw new ApiError('VALIDATION_ERROR');
        await request('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify(result.data),
        });
        setDone(true);
      } else {
        const result = resetSchema.safeParse({ token: resetToken, password });
        if (!result.success) throw new ApiError(resetToken ? 'VALIDATION_ERROR' : 'RESET_INVALID');
        await request('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify(result.data),
        });
        setUser(null);
        setDone(true);
      }
    } catch (error) {
      setError(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout">
      <div className="auth-art" aria-hidden="true">
        <img className="auth-dice" src="/illustrations/hero.svg" alt="" />
        <span className="eyebrow">MIMI CLUB</span>
        <h2>{t('heroTitle')}</h2>
        <p>{t('tagline')}</p>
      </div>
      <div className="panel auth-panel">
        <Link className="back-link" to="/">
          <ArrowLeft size={16} />
          {t('backHome')}
        </Link>
        <div className="mini-icon">
          <Sparkles />
        </div>
        <h1>{t(title[mode])}</h1>
        <p className="muted">{t(mode === 'forgot' ? 'forgotText' : 'authSubtitle')}</p>
        {done ? (
          <div role="status" className="success-block">
            <p>{t(mode === 'reset' ? 'resetDone' : 'resetSent')}</p>
            <Link className="button primary" to="/login">
              {t('login')}
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            {mode === 'register' && (
              <label>
                {t('username')}
                <input
                  name="username"
                  aria-label={t('username')}
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_\-]+"
                  aria-describedby="username-hint"
                />
                <small id="username-hint">{t('usernameHint')}</small>
              </label>
            )}
            {mode !== 'reset' && (
              <label>
                {t('email')}
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
            )}
            {mode !== 'forgot' && (
              <label>
                {t(mode === 'reset' ? 'newPassword' : 'password')}
                <input
                  name="password"
                  aria-label={t(mode === 'reset' ? 'newPassword' : 'password')}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'login' ? 1 : 8}
                  maxLength={128}
                  aria-describedby={mode === 'login' ? undefined : 'password-hint'}
                />
                {mode !== 'login' && <small id="password-hint">{t('passwordHint')}</small>}
              </label>
            )}
            {mode === 'register' && <AvatarPicker value={avatarId} onChange={setAvatarId} />}
            <ErrorMessage code={error} />
            <button className="button primary full" disabled={busy}>
              {t(busy ? 'loading' : submit[mode])}
              <ArrowRight size={18} />
            </button>
            {mode === 'login' && (
              <Link className="text-link centered" to="/forgot-password">
                {t('forgot')}
              </Link>
            )}
            {(mode === 'login' || mode === 'register') && (
              <p className="auth-switch">
                {t(mode === 'login' ? 'noAccount' : 'hasAccount')}{' '}
                <Link to={mode === 'login' ? '/register' : '/login'}>
                  {t(mode === 'login' ? 'register' : 'login')}
                </Link>
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
