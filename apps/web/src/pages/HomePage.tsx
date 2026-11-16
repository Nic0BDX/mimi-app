import { Link } from 'react-router';
import { useState } from 'react';
import { z } from 'zod';
import { roomSchema, type GameType } from '@mimi/shared';
import {
  ArrowRight,
  UsersRound,
  Mail,
  Dice5,
  Sparkles,
  Clock3,
  Gamepad2,
  Trophy,
  Play,
} from 'lucide-react';
import { useT, type TranslationKey } from '../i18n';
import { useSocial } from '../stores/social';
import { useRemote } from '../lib/useRemote';
import { catalogSchema } from '../lib/catalog';
import { previewOnly, accountsOnly } from '../lib/config';
import { ReferenceArtwork } from '../components/ReferenceArtwork';
import { useAuth } from '../stores/auth';
import { request } from '../lib/api';
import { gameName } from '../lib/catalog';
import { ErrorMessage } from '../components/Feedback';

const homeRoomsSchema = z.object({ rooms: z.array(roomSchema) });

export const catalog: {
  id: GameType;
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
  { id: 'bombe-mots', name: 'words', description: 'wordsDesc', count: '2–6', theme: 'gold' },
  {
    id: 'meganopoly',
    name: 'meganopoly',
    description: 'meganopolyDesc',
    count: '2–6',
    theme: 'mint',
  },
];
export function GameCards() {
  const t = useT();
  const { data } = useRemote('/catalog', catalogSchema, !accountsOnly);
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
            aria-label={`${t(game.name)} — ${t(previewOnly ? 'discover' : data?.games.some((g) => g.id === game.id) ? 'play' : 'upcoming')}`}
          >
            <div className="game-cover">
              {game.id === 'meganopoly' ? (
                <img
                  src="/art/meganopoly-reference.png"
                  alt="Plateau MÉGANOPOLY : mariés, dalmatien et golden retriever"
                />
              ) : (
                <ReferenceArtwork art={game.id} />
              )}
              <span className="game-state">
                <Clock3 size={12} />
                {t(
                  previewOnly
                    ? 'discover'
                    : data?.games.some((g) => g.id === game.id)
                      ? 'play'
                      : 'upcoming',
                )}
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
                <span className="round-arrow game-play">
                  {t('play')}
                  <Play size={14} fill="currentColor" />
                </span>
              </div>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
function MobileLanding() {
  const t = useT(),
    incoming = useSocial((s) => s.snapshot.incoming.length);
  return (
    <section className="mobile-landing" aria-labelledby="mobile-home-title">
      <ReferenceArtwork art="mobile-landscape" className="mobile-reference-landscape" />
      <ReferenceArtwork art="clouds" className="mobile-reference-clouds left" />
      <ReferenceArtwork art="clouds" className="mobile-reference-clouds right" />
      <div className="mobile-home-brand" aria-label="NIMIMI">
        <ReferenceArtwork art="logo" />
        <strong>
          <ReferenceArtwork art="wordmark" />
        </strong>
      </div>
      <ReferenceArtwork art="mobile" className="mobile-game-toys" />
      <h1 id="mobile-home-title">{t('playEverywhere')}</h1>
      <nav className="mobile-quick-actions" aria-label={t('menu')}>
        <Link className="button primary" to="/games">
          <Gamepad2 size={24} />
          {t('play')}
        </Link>
        <Link className="button secondary" to="/friends">
          <UsersRound size={23} />
          {t('yourFriends')}
          {incoming > 0 && <span className="quick-count">{incoming}</span>}
        </Link>
        <Link className="button secondary" to="/my-games">
          <Trophy size={23} />
          {t('myGames')}
        </Link>
      </nav>
      <span className="mobile-spark spark-a" aria-hidden="true">
        ✦
      </span>
      <span className="mobile-spark spark-b" aria-hidden="true">
        ✧
      </span>
    </section>
  );
}
export function HomePage() {
  const social = useSocial((s) => s.snapshot);
  const notifications = useSocial((s) => s.notifications);
  const reloadSocial = useSocial((s) => s.load);
  const user = useAuth((s) => s.user);
  const { data: games } = useRemote('/games/mine', homeRoomsSchema, Boolean(user) && !accountsOnly);
  const active = user ? games?.rooms.find((room) => room.status === 'IN_PROGRESS') : undefined;
  const invitations = user
    ? notifications.filter(
        (n) =>
          n.type === 'GAME_INVITATION' && !n.readAt && n.payload.gameId && n.payload.invitationId,
      )
    : [];
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  async function declineInvite(id: string, invitationId: string) {
    setPendingInvite(id);
    setInviteError(null);
    try {
      await request('/games/invitation/respond', {
        method: 'POST',
        body: JSON.stringify({ invitationId, accept: false }),
      });
      await request('/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [id] }) });
      await reloadSocial();
    } catch {
      setInviteError('NETWORK_ERROR');
    } finally {
      setPendingInvite(null);
    }
  }
  const t = useT();
  return (
    <>
      <MobileLanding />
      <div className="desktop-home">
        <div className="reference-heading-art" aria-hidden="true">
          <ReferenceArtwork art="landscape" />
          <ReferenceArtwork art="trees" />
        </div>
        <header className="page-heading">
          <div>
            <h1>{t('welcome')}</h1>
            <p>{t('homeReferenceSubtitle')}</p>
            {previewOnly && <span className="home-preview-label">{t('previewNotice')}</span>}
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
                  {t(active ? 'resumeGame' : 'tableHeroLabel')}
                </span>
                <h2>{t(active ? gameName(active.gameType) : 'tableHeroTitle')}</h2>
                <p>{t(active ? 'inProgress' : 'tableHeroText')}</p>
                <Link
                  className="button primary"
                  to={active ? `/games/room/${active.id}` : '/games'}
                >
                  {t(active ? 'resume' : 'play')}
                  <Play size={15} fill="currentColor" />
                </Link>
              </div>
              <ReferenceArtwork art="resume" className="hero-art" />
              <span className="hero-orbit orbit-one" />
              <span className="hero-orbit orbit-two" />
            </section>
            <div className="section-heading">
              <div>
                <h2>
                  <span className="section-icon">
                    <Gamepad2 size={25} />
                  </span>
                  {t('ourGameCollection')}
                </h2>
                <p>{t('gamesSub')}</p>
              </div>
              <span className="count-chip">{String(catalog.length).padStart(2, '0')}</span>
            </div>
            <GameCards />
          </div>
          <aside className="social-column">
            <section className="panel social-panel">
              <div className="panel-title">
                <span className="icon-tile">
                  <UsersRound size={19} />
                </span>
                <h2>
                  <span className="online-dot" />
                  {t('friendsOnline')}
                </h2>
                <span className="count-pill">
                  {social.friends.filter((f) => f.presence !== 'offline').length}
                </span>
              </div>
              {social.friends.length === 0 && (
                <div className="empty-friends-art" aria-hidden="true">
                  <img src="/avatars/fox.svg" alt="" />
                  <span>+</span>
                  <img src="/avatars/frog.svg" alt="" />
                </div>
              )}
              {social.friends.length === 0 && <h3>{t('friendsTitle')}</h3>}
              {social.friends.length ? (
                social.friends
                  .filter((f) => f.presence !== 'offline')
                  .slice(0, 4)
                  .map((friend) => (
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
                {t('seeAllFriends')}
                <ArrowRight size={16} />
              </Link>
            </section>
            <section className="panel social-panel invitations-panel">
              <div className="panel-title">
                <span className="icon-tile amber">
                  <Mail size={19} />
                </span>
                <h2>
                  {t('invitations')} ({invitations.length})
                </h2>
              </div>
              {invitations.length > 0 ? (
                invitations.slice(0, 3).map((invite) => (
                  <article className="home-invitation" key={invite.id}>
                    {invite.payload.actor && (
                      <img
                        src={`/avatars/${invite.payload.actor.avatarId}.svg`}
                        alt=""
                        width="42"
                        height="42"
                      />
                    )}
                    <div>
                      <span>{invite.payload.actor?.username}</span>
                      <strong>
                        {invite.payload.gameType
                          ? t(gameName(invite.payload.gameType))
                          : t('notificationInvite')}
                      </strong>
                      <div className="invitation-actions">
                        <Link
                          className="button primary"
                          to={`/games/room/${invite.payload.gameId}?invitation=${invite.payload.invitationId}`}
                        >
                          {t('join')}
                        </Link>
                        <button
                          className="button"
                          disabled={pendingInvite !== null}
                          onClick={() => {
                            void declineInvite(invite.id, invite.payload.invitationId!);
                          }}
                        >
                          {t('decline')}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <>
                  <div className="empty-icon">
                    <Mail size={28} />
                  </div>
                  <h3>{t('invitesEmpty')}</h3>
                  <p>{t('invitesSub')}</p>
                </>
              )}
              <ErrorMessage code={inviteError} />
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
      </div>
    </>
  );
}
