import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Search, UserPlus, Check, X, UserMinus, ShieldBan } from 'lucide-react';
import { buddySchema, type Buddy } from '@mimi/shared';
import { useT } from '../i18n';
import { useSocial } from '../stores/social';
import { request, ApiError } from '../lib/api';
import { ErrorMessage } from '../components/Feedback';
const resultsSchema = z.object({ users: z.array(buddySchema), nextCursor: z.string().nullable() });
export function FriendsPage() {
  const t = useT(),
    { snapshot, load, error: loadError } = useSocial();
  const [tab, setTab] = useState<'friends' | 'incoming' | 'outgoing' | 'blocked'>('friends'),
    [results, setResults] = useState<Buddy[]>([]),
    [query, setQuery] = useState(''),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [searched, setSearched] = useState(false);
  async function search(event?: FormEvent, more = false) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = resultsSchema.parse(
        await request(
          `/players?q=${encodeURIComponent(query)}${more && cursor ? `&cursor=${cursor}` : ''}`,
        ),
      );
      setResults((old) => (more ? [...old, ...data.users] : data.users));
      setCursor(data.nextCursor);
      setSearched(true);
    } catch (error) {
      setError(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }
  async function act(path: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      await request(path, { method: 'POST', body: JSON.stringify(body) });
      await load();
    } catch (error) {
      setError(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }
  function row(user: Buddy, actions: React.ReactNode, status?: string) {
    return (
      <article className="person-row" key={user.id}>
        <img src={`/avatars/${user.avatarId}.svg`} alt="" width="48" height="48" />
        <div>
          <strong>{user.username}</strong>
          {status && (
            <span className={`presence ${status}`}>
              {t(
                status === 'playing' ? 'playing' : status === 'online' ? 'online' : 'offlineStatus',
              )}
            </span>
          )}
        </div>
        <div className="person-actions">{actions}</div>
      </article>
    );
  }
  const button = (
    label: Parameters<typeof t>[0],
    icon: React.ReactNode,
    path: string,
    body: object,
  ) => (
    <button
      className="icon-button"
      title={t(label)}
      aria-label={t(label)}
      disabled={busy}
      onClick={() => {
        void act(path, body);
      }}
    >
      {icon}
    </button>
  );
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('friends')}</h1>
          <p>{t('friendsRealSubtitle')}</p>
        </div>
      </header>
      <section className="panel settings-panel">
        <form
          className="search-form"
          onSubmit={(event) => {
            void search(event);
          }}
        >
          <label>
            {t('findPlayer')}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              minLength={2}
              maxLength={20}
              required
            />
          </label>
          <button className="button primary" disabled={busy}>
            <Search size={18} />
            {t('search')}
          </button>
        </form>
        {results.map((user) =>
          row(
            user,
            button('addFriend', <UserPlus size={19} />, '/friends/requests', {
              targetUserId: user.id,
            }),
          ),
        )}
        {searched && results.length === 0 && <p>{t('noPlayers')}</p>}
        {cursor && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              void search(undefined, true);
            }}
          >
            {t('loadMore')}
          </button>
        )}
      </section>
      <div className="tabs" role="tablist" aria-label={t('friends')}>
        {(['friends', 'incoming', 'outgoing', 'blocked'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {t(key)} <span>{snapshot[key].length}</span>
          </button>
        ))}
      </div>
      <section className="panel settings-panel" role="tabpanel">
        <ErrorMessage code={error ?? loadError} />
        {snapshot[tab].length === 0 && (
          <div className="empty-state">
            <UserPlus size={40} />
            <p>{t('emptyList')}</p>
          </div>
        )}
        {tab === 'friends' &&
          snapshot.friends.map((user) =>
            row(
              user,
              <>
                {button('removeFriend', <UserMinus size={18} />, '/friends/remove', {
                  targetUserId: user.id,
                })}
                {button('block', <ShieldBan size={18} />, '/players/block', {
                  targetUserId: user.id,
                })}
              </>,
              user.presence,
            ),
          )}
        {tab === 'incoming' &&
          snapshot.incoming.map(({ id, user }) =>
            row(
              user,
              <>
                {button('accept', <Check size={18} />, '/friends/respond', {
                  requestId: id,
                  accept: true,
                })}
                {button('decline', <X size={18} />, '/friends/respond', {
                  requestId: id,
                  accept: false,
                })}
                {button('block', <ShieldBan size={18} />, '/players/block', {
                  targetUserId: user.id,
                })}
              </>,
            ),
          )}
        {tab === 'outgoing' &&
          snapshot.outgoing.map(({ id, user }) =>
            row(user, button('cancel', <X size={18} />, '/friends/cancel', { requestId: id })),
          )}
        {tab === 'blocked' &&
          snapshot.blocked.map((user) =>
            row(
              user,
              button('unblock', <Check size={18} />, '/players/unblock', { targetUserId: user.id }),
            ),
          )}
      </section>
    </>
  );
}
