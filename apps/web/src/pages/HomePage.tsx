import { Link } from 'react-router';
import { ArrowRight, UsersRound, Mail, Dice5, Sparkles, Clock3 } from 'lucide-react';
import { useT, type TranslationKey } from '../i18n';
import { useAuth } from '../stores/auth';
import { useSocial } from '../stores/social';
import { useRemote } from '../lib/useRemote';
import { catalogSchema } from '../lib/catalog';

export const catalog: {
  id: string;
  name: TranslationKey;
  description: TranslationKey;
  count: string;
  theme: string;
}[] = [
  { id: 'morpion', name: 'morpion', description: 'morpionDesc', count: '2', theme: 'peach' },
  {
    id: 'puissance-quatre',
    name: 'connect',
    description: 'connectDesc',
    count: '2',
    theme: 'blue',
  },
  { id: 'dames', name: 'checkers', description: 'checkersDesc', count: '2', theme: 'rose' },
  { id: 'carte-frenesie', name: 'cards', description: 'cardsDesc', count: '2–8', theme: 'purple' },
  { id: 'course-ecuries', name: 'horses', description: 'horsesDesc', count: '2–4', theme: 'mint' },
  { id: 'bombe-mots', name: 'words', description: 'wordsDesc', count: '2–12', theme: 'gold' },
];
export function GameCards() {
  const t = useT();
  const { data } = useRemote('/catalog', catalogSchema);
  return (
    <div className="game-grid">
      {catalog.map((game) => (
        <article className={`game-card ${game.theme}`} key={game.id}>
          <Link
            to={
              data?.games.some((g) => g.id === game.id)
                ? `/games/new?type=${game.id}`
                : `/games/${game.id}`
            }
            aria-label={`${t(game.name)} — ${t(data?.games.some((g) => g.id === game.id) ? 'play' : 'upcoming')}`}
          >
            <div className="game-cover">
              <img
                src={`/illustrations/${game.id}.svg`}
                alt=""
                width="400"
                height="260"
                loading="lazy"
              />
              <span className="game-state">
                <Clock3 size={12} />
                {t(data?.games.some((g) => g.id === game.id) ? 'play' : 'upcoming')}
              </span>
            </div>
            <div className="game-content">
              <h3>{t(game.name)}</h3>
              <p className="game-description">{t(game.description)}</p>
              <div className="game-footer">
                <span>
                  <UsersRound size={14} />
                  {game.count} {t('players')}
                </span>
                <span className="round-arrow">
                  <ArrowRight size={17} />
                </span>
              </div>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
export function HomePage() {
  const social = useSocial((s) => s.snapshot);
  const t = useT(),
    user = useAuth((s) => s.user);
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">MIMI · PLAY TOGETHER</span>
          <h1>{t('welcome')}</h1>
          <p>{t('welcomeSub')}</p>
        </div>
        <div className="heading-dice" aria-hidden="true">
          <Dice5 />
        </div>
      </header>
      <div className="home-columns">
        <div className="home-main">
          <section className="hero">
            <div className="hero-content">
              <span className="hero-kicker">
                <span className="spark-dot" />
                {t('heroEyebrow')}
              </span>
              <h2>{t('heroTitle')}</h2>
              <p>{t('heroText')}</p>
              <Link className="button primary" to={user ? '/games' : '/register'}>
                {t(user ? 'discover' : 'register')}
                <ArrowRight size={18} />
              </Link>
            </div>
            <img src="/illustrations/hero.svg" alt="" className="hero-art" fetchPriority="high" />
            <span className="hero-orbit orbit-one" />
            <span className="hero-orbit orbit-two" />
          </section>
          <div className="section-heading">
            <div>
              <h2>
                <span className="section-icon">
                  <Dice5 size={21} />
                </span>
                {t('ourGames')}
              </h2>
              <p>{t('gamesSub')}</p>
            </div>
            <span className="count-chip">06</span>
          </div>
          <GameCards />
        </div>
        <aside className="social-column">
          <section className="panel social-panel">
            <div className="panel-title">
              <span className="icon-tile">
                <UsersRound size={19} />
              </span>
              <h2>{t('friends')}</h2>
              <span className="count-pill">
                {social.friends.filter((f) => f.presence !== 'offline').length}
              </span>
            </div>
            <div className="empty-friends-art" aria-hidden="true">
              <img src="/avatars/fox.svg" alt="" />
              <span>+</span>
              <img src="/avatars/frog.svg" alt="" />
            </div>
            <h3>{t('friendsTitle')}</h3>
            {social.friends.length ? (
              social.friends.slice(0, 5).map((friend) => (
                <div className="person-row compact" key={friend.id}>
                  <img src={`/avatars/${friend.avatarId}.svg`} alt="" width="36" height="36" />
                  <div>
                    <strong>{friend.username}</strong>
                    <span className={`presence ${friend.presence}`}>
                      {t(
                        friend.presence === 'online'
                          ? 'online'
                          : friend.presence === 'playing'
                            ? 'playing'
                            : 'offlineStatus',
                      )}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p>{t('friendsEmpty')}</p>
            )}
            <Link to="/friends" className="button secondary full">
              {t('friends')}
              <ArrowRight size={16} />
            </Link>
          </section>
          <section className="panel social-panel invitations-panel">
            <div className="panel-title">
              <span className="icon-tile amber">
                <Mail size={19} />
              </span>
              <h2>{t('invitations')}</h2>
            </div>
            <div className="empty-icon">
              <Mail size={28} />
            </div>
            <h3>{t('invitesEmpty')}</h3>
            <p>{t('invitesSub')}</p>
          </section>
          <section className="development-note">
            <Sparkles size={18} />
            <div>
              <strong>{t('homePromiseTitle')}</strong>
              <p>{t('homePromiseText')}</p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
