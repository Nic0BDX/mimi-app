import { useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import {
  Bell,
  Settings,
  Home,
  Dice5,
  UsersRound,
  Gamepad2,
  Trophy,
  UserRound,
  LogOut,
  Globe2,
  ArrowRight,
  WifiOff,
  Sparkles,
  X,
} from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT, type TranslationKey } from '../i18n';
import { usePreferences } from '../stores/preferences';
import { useAuth } from '../stores/auth';
import { request, clearCsrf, ApiError } from '../lib/api';
import { ErrorMessage } from '../components/Feedback';
import { HomePage, GameCards, catalog } from '../pages/HomePage';
import { AuthPage } from '../pages/AuthPages';
import { ProfilePage } from '../pages/ProfilePage';
import { SettingsPage } from '../pages/SettingsPage';

const links = [
  { to: '/', key: 'home', icon: Home },
  { to: '/games', key: 'games', icon: Dice5 },
  { to: '/friends', key: 'friends', icon: UsersRound },
  { to: '/my-games', key: 'myGames', icon: Gamepad2 },
  { to: '/rankings', key: 'rankings', icon: Trophy },
] as const;
function Layout() {
  const t = useT(),
    user = useAuth((s) => s.user),
    loading = useAuth((s) => s.loading),
    load = useAuth((s) => s.load),
    authError = useAuth((s) => s.error),
    setUser = useAuth((s) => s.setUser),
    language = usePreferences((s) => s.language),
    update = usePreferences((s) => s.update),
    navigate = useNavigate(),
    location = useLocation();
  const [online, setOnline] = useState(navigator.onLine),
    [notifications, setNotifications] = useState(false),
    [error, setError] = useState<string | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    setNotifications(false);
    document.getElementById('main')?.focus();
  }, [location.pathname]);
  useEffect(() => {
    const on = () => {
        setOnline(true);
        void load();
      },
      off = () => {
        setOnline(false);
        setUser(null);
      };
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, [load, setUser]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotifications(false);
    };
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, []);
  async function logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
      setUser(null);
      clearCsrf();
      await load();
      navigate('/');
    } catch (error) {
      setError(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('home')}
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="MIMI">
          <img src="/icons/icon.svg" alt="" />
          <span>
            MIMI<small>{t('tagline')}</small>
          </span>
        </Link>
        <div className="sidebar-separator" />
        <nav aria-label={t('menu')}>
          {links.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={22} />
              <span>{t(key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-stars" aria-hidden="true">
            ✦ · ✧
          </span>
          <p>{t('tagline')}</p>
          {user ? (
            <Link className="user-card" to="/profile">
              <img src={`/avatars/${user.avatarId}.svg`} alt="" />
              <span>
                <strong>{user.username}</strong>
                <small>{t('profile')}</small>
              </span>
              <ArrowRight size={16} />
            </Link>
          ) : (
            <Link className="button secondary full" to="/login">
              {t('login')}
              <ArrowRight size={16} />
            </Link>
          )}
          <div className="legal-links">
            <Link to="/legal">{t('legal')}</Link>
            <Link to="/privacy">{t('privacy')}</Link>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <Link className="mobile-brand" to="/">
            <img src="/icons/icon.svg" alt="" />
            <strong>MIMI</strong>
          </Link>
          <span className="topbar-note">
            <Sparkles size={15} />
            {t('tagline')}
          </span>
          <div className="topbar-actions">
            <button
              className="icon-button language-button"
              aria-label={t('changeLanguage')}
              onClick={() => update({ language: language === 'fr' ? 'en' : 'fr' })}
            >
              <Globe2 size={19} />
              <span>{language.toUpperCase()}</span>
            </button>
            <div className="notification-anchor">
              <button
                className="icon-button"
                aria-label={t('notifications')}
                aria-expanded={notifications}
                onClick={() => setNotifications((v) => !v)}
              >
                <Bell size={20} />
              </button>
              {notifications && (
                <div className="notification-popover panel">
                  <strong>{t('notifications')}</strong>
                  <p>{t('notificationsEmpty')}</p>
                  <button className="text-link" onClick={() => setNotifications(false)}>
                    {t('close')}
                  </button>
                </div>
              )}
            </div>
            <Link
              className="icon-button settings-link"
              to={user ? '/settings' : '/login'}
              aria-label={t('settings')}
            >
              <Settings size={20} />
            </Link>
            {user ? (
              <>
                <Link className="top-avatar" to="/profile" aria-label={t('profile')}>
                  <img src={`/avatars/${user.avatarId}.svg`} alt="" width="38" height="38" />
                </Link>
                <button
                  className="icon-button logout-button"
                  aria-label={t('logout')}
                  onClick={() => {
                    void logout();
                  }}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link to="/login" className="button secondary login-link">
                {t('login')}
              </Link>
            )}
          </div>
        </header>
        {!online && (
          <div role="status" className="network-banner">
            <WifiOff size={18} />
            {t('offline')}
          </div>
        )}
        {needRefresh && (
          <div role="status" className="network-banner">
            {t('update')}
            <button
              onClick={() => {
                void updateServiceWorker(true);
              }}
            >
              {t('updateNow')}
            </button>
            <button aria-label={t('dismiss')} onClick={() => setNeedRefresh(false)}>
              <X size={18} />
            </button>
          </div>
        )}
        <main id="main" tabIndex={-1}>
          <ErrorMessage code={error ?? authError} />
          {loading ? (
            <div role="status" className="loading-state">
              {t('loading')}
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        <footer className="mobile-footer">
          <Link to="/legal">{t('legal')}</Link>
          <span>·</span>
          <Link to="/privacy">{t('privacy')}</Link>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label={t('menu')}>
        {links.slice(0, 3).map(({ to, key, icon: Icon }) => (
          <NavLink to={to} end={to === '/'} key={to}>
            <Icon size={21} />
            <span>{t(key)}</span>
          </NavLink>
        ))}
        <NavLink to={user ? '/profile' : '/login'}>
          <UserRound size={21} />
          <span>{t(user ? 'profile' : 'login')}</span>
        </NavLink>
      </nav>
    </div>
  );
}
function Protected() {
  const user = useAuth((s) => s.user);
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
function InfoPage({
  title,
  text,
  icon: Icon = Sparkles,
}: {
  title: TranslationKey;
  text: TranslationKey;
  icon?: typeof Sparkles;
}) {
  const t = useT();
  return (
    <section className="panel info-page">
      <span className="large-icon">
        <Icon size={40} />
      </span>
      <h1>{t(title)}</h1>
      <p>{t(text)}</p>
      <Link to="/" className="button secondary">
        {t('backHome')}
        <ArrowRight size={17} />
      </Link>
    </section>
  );
}
function GamesPage() {
  const t = useT();
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('ourGames')}</h1>
          <p>{t('gamesNotReady')}</p>
        </div>
      </header>
      <GameCards />
    </>
  );
}
function GameInfo() {
  const t = useT(),
    location = useLocation(),
    game = catalog.find((g) => location.pathname === `/games/${g.id}`);
  return game ? (
    <section className={`panel game-info ${game.theme}`}>
      <img src={`/illustrations/${game.id}.svg`} alt="" width="600" height="390" />
      <h1>{t(game.name)}</h1>
      <p>{t(game.description)}</p>
      <span className="game-state">
        {game.count} {t('players')} · {t('upcoming')}
      </span>
      <p>{t('gamesNotReady')}</p>
      <Link to="/games" className="button secondary">
        {t('games')}
        <ArrowRight size={16} />
      </Link>
    </section>
  ) : (
    <InfoPage title="notFound" text="gamesNotReady" />
  );
}
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<AuthPage key="login" mode="login" />} />
        <Route path="register" element={<AuthPage key="register" mode="register" />} />
        <Route path="forgot-password" element={<AuthPage key="forgot" mode="forgot" />} />
        <Route path="reset-password" element={<AuthPage key="reset" mode="reset" />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="games/:id" element={<GameInfo />} />
        <Route
          path="friends"
          element={<InfoPage title="friendsTitle" text="friendsSoon" icon={UsersRound} />}
        />
        <Route
          path="my-games"
          element={<InfoPage title="myGames" text="myGamesEmpty" icon={Gamepad2} />}
        />
        <Route
          path="rankings"
          element={<InfoPage title="rankings" text="rankingsEmpty" icon={Trophy} />}
        />
        <Route element={<Protected />}>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="legal" element={<InfoPage title="legalTitle" text="legalText" />} />
        <Route path="privacy" element={<InfoPage title="privacyTitle" text="privacyText" />} />
        <Route path="*" element={<InfoPage title="notFound" text="tagline" />} />
      </Route>
    </Routes>
  );
}
