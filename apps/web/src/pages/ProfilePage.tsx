import { Link } from 'react-router';
import { Trophy, Gamepad2, Medal, Pencil } from 'lucide-react';
import { useAuth } from '../stores/auth';
import { usePreferences } from '../stores/preferences';
import { useT } from '../i18n';
export function ProfilePage() {
  const user = useAuth((s) => s.user),
    language = usePreferences((s) => s.language),
    t = useT();
  if (!user) return null;
  const played = user.stats.reduce((sum, stat) => sum + stat.gamesPlayed, 0),
    wins = user.stats.reduce((sum, stat) => sum + stat.wins, 0);
  const scores = user.stats.flatMap((stat) => (stat.bestScore === null ? [] : [stat.bestScore]));
  return (
    <>
      <header className="page-heading">
        <h1>{t('profileTitle')}</h1>
      </header>
      <section className="panel profile-card">
        <div className="profile-banner" />
        <img
          className="profile-avatar"
          src={`/avatars/${user.avatarId}.svg`}
          alt=""
          width="112"
          height="112"
        />
        <h2>{user.username}</h2>
        <p>
          {t('memberSince')}{' '}
          {new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(
            new Date(user.createdAt),
          )}
        </p>
        <Link to="/settings" className="button secondary">
          <Pencil size={16} />
          {t('editProfile')}
        </Link>
        <div className="stats-grid">
          <div>
            <Gamepad2 />
            <strong>{played}</strong>
            <span>{t('gamesPlayed')}</span>
          </div>
          <div>
            <Trophy />
            <strong>{wins}</strong>
            <span>{t('wins')}</span>
          </div>
          <div>
            <Medal />
            <strong>{scores.length ? Math.max(...scores) : '—'}</strong>
            <span>{t('bestScore')}</span>
          </div>
        </div>
        <p className="muted">{t('noStats')}</p>
      </section>
    </>
  );
}
