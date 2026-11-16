import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Plus, LogIn, RefreshCw, Trophy, Gamepad2 } from 'lucide-react';
import { roomSchema, buddySchema, gameTypeSchema, type GameType } from '@mimi/shared';
import { useT } from '../i18n';
import { useRemote } from '../lib/useRemote';
import { request, ApiError } from '../lib/api';
import { ErrorMessage } from '../components/Feedback';
import { catalogSchema, gameName } from '../lib/catalog';
import { GameOptions, readGameOptions } from '../components/GameOptions';
const publicSchema = z.object({
  rooms: z.array(
    z.object({
      id: z.string(),
      gameType: gameTypeSchema,
      maxPlayers: z.number(),
      count: z.number(),
      host: buddySchema.nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
const mineSchema = z.object({ rooms: z.array(roomSchema) });
const leaderboardSchema = z.object({
  rows: z.array(
    z.object({
      user: buddySchema,
      gamesPlayed: z.number(),
      wins: z.number(),
      draws: z.number(),
      bestScore: z.number().nullable(),
    }),
  ),
});
export function MultiplayerPage() {
  const t = useT(),
    navigate = useNavigate(),
    [filter, setFilter] = useState(''),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const {
      data,
      load,
      error: loadError,
    } = useRemote(`/games${filter ? `?gameType=${filter}` : ''}`, publicSchema),
    available = useRemote('/catalog', catalogSchema);
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const room = roomSchema.parse(
        await request('/games/join', {
          method: 'POST',
          body: JSON.stringify({
            joinCode: String(new FormData(event.currentTarget).get('code')).trim().toUpperCase(),
          }),
        }),
      );
      navigate(`/games/room/${room.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t('onlineRooms')}</h1>
          <p>{t('onlineRoomsSubtitle')}</p>
        </div>
        <Link className="button primary" to="/games/new">
          <Plus size={18} />
          {t('createRoom')}
        </Link>
      </header>
      <section className="panel settings-panel">
        <form
          className="search-form"
          onSubmit={(e) => {
            void join(e);
          }}
        >
          <label>
            {t('roomCode')}
            <input
              name="code"
              minLength={6}
              maxLength={6}
              pattern="[A-Za-z2-9]{6}"
              required
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          <button className="button secondary" disabled={busy}>
            <LogIn size={17} />
            {t('join')}
          </button>
        </form>
      </section>
      <div className="room-filter">
        <label>
          {t('games')}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('allGames')}</option>
            {available.data?.games.map((g) => (
              <option key={g.id} value={g.id}>
                {t(gameName(g.id))}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button"
          aria-label={t('refresh')}
          onClick={() => {
            void load();
          }}
        >
          <RefreshCw size={19} />
        </button>
      </div>
      <ErrorMessage code={error ?? loadError} />
      <div className="room-grid">
        {data?.rooms.map((room) => (
          <article className="panel settings-panel" key={room.id}>
            <h2>{t(gameName(room.gameType))}</h2>
            <p>
              {room.host?.username} · {room.count}/{room.maxPlayers} {t('players')}
            </p>
            <Link className="button secondary" to={`/games/room/${room.id}`}>
              {t('join')}
            </Link>
          </article>
        ))}
      </div>
      {data?.rooms.length === 0 && (
        <div className="empty-state">
          <Gamepad2 size={38} />
          <p>{t('noRooms')}</p>
        </div>
      )}
    </>
  );
}
export function CreateRoomPage() {
  const [params] = useSearchParams();
  const t = useT(),
    navigate = useNavigate(),
    available = useRemote('/catalog', catalogSchema),
    [type, setType] = useState<GameType>(() => {
      const parsed = gameTypeSchema.safeParse(params.get('type'));
      return parsed.success ? parsed.data : 'morpion';
    }),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const selected = available.data?.games.find((g) => g.id === type);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const room = roomSchema.parse(
        await request('/games/create', {
          method: 'POST',
          body: JSON.stringify({
            gameType: type,
            maxPlayers: Number(form.get('capacity')),
            isPrivate: form.get('private') === 'on',
            bots: Number(form.get('bots')),
            options: {
              turnSeconds: Number(form.get('turnSeconds')),
              disconnect: String(form.get('disconnect')),
              gameOptions: readGameOptions(form, selected?.defaultOptions ?? {}),
            },
          }),
        }),
      );
      navigate(`/games/room/${room.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel create-room">
      <h1>{t('createRoom')}</h1>
      <form
        onSubmit={(e) => {
          void create(e);
        }}
      >
        <label>
          {t('games')}
          <select value={type} onChange={(e) => setType(gameTypeSchema.parse(e.target.value))}>
            {available.data?.games.map((g) => (
              <option key={g.id} value={g.id}>
                {t(gameName(g.id))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('capacity')}
          <input
            key={type}
            name="capacity"
            type="number"
            required
            min={selected?.minPlayers ?? 2}
            max={selected?.maxPlayers ?? 2}
            defaultValue={selected?.minPlayers ?? 2}
          />
        </label>
        <label>
          {t('bots')}
          <input
            name="bots"
            type="number"
            min="0"
            max={(selected?.maxPlayers ?? 2) - 1}
            defaultValue="0"
            required
          />
        </label>
        <label>
          {t('turnSeconds')}
          <input name="turnSeconds" type="number" min="15" max="180" defaultValue="60" required />
        </label>
        <label>
          {t('disconnectMode')}
          <select name="disconnect">
            <option value="bot">{t('replaceBot')}</option>
            <option value="forfeit">{t('forfeit')}</option>
          </select>
        </label>
        <label className="toggle-row">
          <span>{t('privateRoom')}</span>
          <input name="private" type="checkbox" defaultChecked />
        </label>
        {selected && <GameOptions key={type} values={selected.defaultOptions} />}
        <ErrorMessage code={error ?? available.error} />
        <button className="button primary" disabled={busy || !selected}>
          {t(busy ? 'loading' : 'createRoom')}
        </button>
      </form>
    </section>
  );
}
export function MyGamesPage() {
  const t = useT(),
    { data, error } = useRemote('/games/mine', mineSchema);
  return (
    <>
      <header className="page-heading">
        <h1>{t('myGames')}</h1>
        <Link to="/games/online" className="button primary">
          {t('onlineRooms')}
        </Link>
      </header>
      <ErrorMessage code={error} />
      <div className="room-grid">
        {data?.rooms.map((room) => (
          <article className="panel settings-panel" key={room.id}>
            <h2>{t(gameName(room.gameType))}</h2>
            <p>
              {t(
                room.status === 'LOBBY'
                  ? 'lobby'
                  : room.status === 'IN_PROGRESS'
                    ? 'inProgress'
                    : room.status === 'FINISHED'
                      ? 'finished'
                      : 'abandoned',
              )}
            </p>
            <p>{room.players.map((p) => p.user?.username ?? t('bot')).join(' · ')}</p>
            <Link to={`/games/room/${room.id}`} className="button secondary">
              {t(room.status === 'FINISHED' ? 'results' : 'resume')}
            </Link>
          </article>
        ))}
      </div>
      {data?.rooms.length === 0 && (
        <div className="empty-state">
          <p>{t('myGamesEmpty')}</p>
        </div>
      )}
    </>
  );
}
export function RankingsPage() {
  const t = useT(),
    [type, setType] = useState('morpion'),
    available = useRemote('/catalog', catalogSchema),
    { data, error } = useRemote(`/leaderboard?gameType=${type}`, leaderboardSchema);
  return (
    <>
      <header className="page-heading">
        <h1>{t('rankings')}</h1>
        <Trophy />
      </header>
      <label>
        {t('games')}
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {available.data?.games.map((g) => (
            <option key={g.id} value={g.id}>
              {t(gameName(g.id))}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">{t('rankedNote')}</p>
      <ErrorMessage code={error} />
      <section className="panel settings-panel">
        {data?.rows.map((r, i) => (
          <div className="person-row" key={r.user.id}>
            <strong>{i + 1}</strong>
            <img src={`/avatars/${r.user.avatarId}.svg`} width="44" height="44" alt="" />
            <div>
              <strong>{r.user.username}</strong>
              <p>
                {r.gamesPlayed} {t('gamesPlayed')} · {r.wins} {t('wins')}
              </p>
            </div>
          </div>
        ))}
        {data?.rows.length === 0 && <p>{t('rankingsEmpty')}</p>}
      </section>
    </>
  );
}
