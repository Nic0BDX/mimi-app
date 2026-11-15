import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Copy, Play, Check, LogOut, UserPlus, Flag, Send, BookOpen } from 'lucide-react';
import { roomSchema, chatMessageSchema, type Room } from '@mimi/shared';
import { useRemote } from '../lib/useRemote';
import { request, ApiError } from '../lib/api';
import { command, useRealtime } from '../lib/realtime';
import { useT } from '../i18n';
import { useAuth } from '../stores/auth';
import { useSocial } from '../stores/social';
import { ErrorMessage } from '../components/Feedback';
import { BoardGame } from '../games/BoardGames';
import { DraughtsGame } from '../games/DraughtsGame';
import { FrenzyGame } from '../games/FrenzyGame';
import { HorsesGame } from '../games/HorsesGame';
import { gameName } from '../lib/catalog';
import { GameOptions, readGameOptions } from '../components/GameOptions';
const messagesSchema = z.object({ messages: z.array(chatMessageSchema) });
export function RoomPage() {
  const { gameId = '' } = useParams(),
    [params] = useSearchParams(),
    navigate = useNavigate(),
    t = useT(),
    user = useAuth((s) => s.user),
    friends = useSocial((s) => s.snapshot.friends),
    connected = useRealtime((s) => s.connected),
    revision = useRealtime((s) => s.revision);
  const [room, setRoom] = useState<Room | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [rules, setRules] = useState(false),
    [now, setNow] = useState(Date.now()),
    [notice, setNotice] = useState('');
  const messages = useRemote(`/games/${gameId}/messages`, messagesSchema, !!room);
  const invitationId = params.get('invitation') ?? undefined,
    joinCode = params.get('code') ?? undefined;
  const hasRoom = room !== null;
  useEffect(() => {
    let live = true;
    void request('/games/join', {
      method: 'POST',
      body: JSON.stringify({
        gameId,
        ...(invitationId ? { invitationId } : {}),
        ...(joinCode ? { joinCode } : {}),
      }),
    })
      .then((value) => {
        if (live) setRoom(roomSchema.parse(value));
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof ApiError ? e.code : 'INTERNAL_ERROR');
      });
    return () => {
      live = false;
    };
  }, [gameId, invitationId, joinCode]);
  useEffect(() => {
    if (!hasRoom) return;
    let live = true;
    void request(`/games/${gameId}`)
      .then((value) => {
        if (live) setRoom(roomSchema.parse(value));
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof ApiError ? e.code : 'INTERNAL_ERROR');
      });
    return () => {
      live = false;
    };
  }, [gameId, revision, hasRoom]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  async function perform(event: string, path: string, payload: object) {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const value = connected
        ? await command(event, { gameId, ...payload })
        : await request(`/games/${path}`, {
            method: 'POST',
            body: JSON.stringify({ gameId, ...payload }),
          });
      const parsed = roomSchema.safeParse(value);
      if (parsed.success) setRoom(parsed.data);
      return value;
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'NETWORK_ERROR');
      const value = await request(`/games/${gameId}`).catch(() => null);
      const parsed = roomSchema.safeParse(value);
      if (parsed.success) setRoom(parsed.data);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function action(value: unknown) {
    if (!room) return;
    await perform('game:action', 'action', {
      expectedVersion: room.version,
      actionId: crypto.randomUUID(),
      action: value,
    });
  }
  async function chat(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      content = String(new FormData(form).get('message'));
    const result = await perform('chat:send', 'chat', {
      clientMessageId: crypto.randomUUID(),
      content,
    });
    if (result) {
      form.reset();
      await messages.load();
    }
  }
  async function leave() {
    if (!room) return;
    if (room.status === 'LOBBY') {
      if (await perform('lobby:leave', 'leave', {})) navigate('/games/online');
    } else if (confirm(t('confirmForfeit'))) {
      await perform('game:forfeit', 'forfeit', {});
    }
  }
  if (!room)
    return (
      <section className="panel settings-panel">
        <h1>{t('lobby')}</h1>
        <ErrorMessage code={error} />
        <p>{t(error ? 'roomAccessHint' : 'loading')}</p>
      </section>
    );
  const own = room.players.find((p) => p.id === user?.id),
    turn = room.players.find((p) => p.id === room.view?.turn),
    host = room.hostId === user?.id,
    seconds = room.turnDeadlineAt
      ? Math.max(0, Math.ceil((new Date(room.turnDeadlineAt).getTime() - now) / 1000))
      : null;
  const name = (id: string) => room.players.find((p) => p.id === id)?.user?.username ?? t('bot');
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{t(gameName(room.gameType))}</h1>
          <p>
            {t(
              room.status === 'LOBBY'
                ? 'lobby'
                : room.status === 'FINISHED'
                  ? 'finished'
                  : 'inProgress',
            )}
          </p>
        </div>
        <button className="button subtle" onClick={() => setRules((v) => !v)}>
          <BookOpen size={17} />
          {t('rules')}
        </button>
      </header>
      <ErrorMessage code={error} />
      {notice && (
        <p role="status" className="feedback success">
          {notice}
        </p>
      )}
      {rules && (
        <section className="panel settings-panel">
          <h2>{t('rules')}</h2>
          <p>
            {t(
              room.gameType === 'morpion'
                ? 'rulesMorpion'
                : room.gameType === 'puissance-quatre'
                  ? 'rulesConnect'
                  : room.gameType === 'dames'
                    ? 'rulesCheckers'
                    : room.gameType === 'carte-frenesie'
                      ? 'rulesCards'
                      : room.gameType === 'course-ecuries'
                        ? 'rulesHorses'
                        : 'rulesWords',
            )}
          </p>
        </section>
      )}
      <div className="play-layout">
        <section>
          <div className="players-strip">
            {room.players.map((p) => (
              <article
                className={`player-chip ${room.view?.turn === p.id ? 'current' : ''}`}
                key={p.id}
              >
                <img
                  src={`/avatars/${p.user?.avatarId ?? 'robot'}.svg`}
                  alt=""
                  width="40"
                  height="40"
                />
                <div>
                  <strong>{p.user?.username ?? t('bot')}</strong>
                  <small>
                    {p.control === 'BOT'
                      ? t('bot')
                      : p.disconnectedAt
                        ? t('reconnecting')
                        : p.ready
                          ? t('ready')
                          : t('notReady')}
                  </small>
                </div>
                {host && room.status === 'LOBBY' && p.user && p.id !== user?.id && (
                  <button
                    className="icon-button"
                    aria-label={`${t('kick')} ${p.user.username}`}
                    onClick={() => {
                      void perform('lobby:kick', 'kick', { targetUserId: p.id });
                    }}
                  >
                    ×
                  </button>
                )}
              </article>
            ))}
          </div>
          {room.status === 'LOBBY' ? (
            <section className="panel settings-panel lobby-panel">
              <div className="room-code">
                <span>{t('roomCode')}</span>
                <strong>{room.joinCode}</strong>
                <button
                  className="icon-button"
                  aria-label={t('copyInvite')}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(`${location.origin}/games/room/${room.id}?code=${room.joinCode}`)
                      .then(() => setNotice(t('copied')))
                      .catch(() => setError('NETWORK_ERROR'));
                  }}
                >
                  <Copy size={18} />
                </button>
              </div>
              <p>
                {room.players.length}/{room.maxPlayers} {t('players')} · {t('botRankedNote')}
              </p>
              <div className="button-row">
                <button
                  className={`button ${own?.ready ? 'secondary' : 'primary'}`}
                  disabled={busy}
                  onClick={() => {
                    void perform('lobby:ready', 'ready', { ready: !own?.ready });
                  }}
                >
                  <Check size={18} />
                  {t(own?.ready ? 'notReady' : 'ready')}
                </button>
                {host && (
                  <button
                    className="button primary"
                    disabled={busy || room.players.length < 2 || room.players.some((p) => !p.ready)}
                    onClick={() => {
                      void perform('lobby:start', 'start', { expectedVersion: room.version });
                    }}
                  >
                    <Play size={18} />
                    {t('startGame')}
                  </button>
                )}
                <button
                  className="button subtle"
                  disabled={busy}
                  onClick={() => {
                    void leave();
                  }}
                >
                  <LogOut size={17} />
                  {t('leaveRoom')}
                </button>
              </div>
              {host && (
                <form
                  className="lobby-options"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    const gameOptions = readGameOptions(form, room.options.gameOptions);
                    void perform('lobby:options', 'options', {
                      expectedVersion: room.version,
                      options: {
                        turnSeconds: Number(form.get('turnSeconds')),
                        disconnect: form.get('disconnect'),
                        gameOptions,
                      },
                    });
                  }}
                >
                  <label>
                    {t('turnSeconds')}
                    <input
                      key={room.options.turnSeconds}
                      name="turnSeconds"
                      type="number"
                      min="15"
                      max="180"
                      required
                      defaultValue={room.options.turnSeconds}
                    />
                  </label>
                  <label>
                    {t('disconnectMode')}
                    <select name="disconnect" defaultValue={room.options.disconnect}>
                      <option value="bot">{t('replaceBot')}</option>
                      <option value="forfeit">{t('forfeit')}</option>
                    </select>
                  </label>
                  <GameOptions values={room.options.gameOptions} />
                  <button className="button secondary" disabled={busy}>
                    {t('save')}
                  </button>
                </form>
              )}
              <h3>{t('inviteFriend')}</h3>
              {friends.length ? (
                friends
                  .filter((f) => !room.players.some((p) => p.id === f.id))
                  .map((friend) => (
                    <div className="person-row" key={friend.id}>
                      <img src={`/avatars/${friend.avatarId}.svg`} alt="" width="36" height="36" />
                      <strong>{friend.username}</strong>
                      <button
                        className="button secondary"
                        disabled={busy || room.players.length >= room.maxPlayers}
                        onClick={() => {
                          void perform('lobby:invite', 'invite', { targetUserId: friend.id }).then(
                            (v) => {
                              if (v) setNotice(t('invitationSent'));
                            },
                          );
                        }}
                      >
                        <UserPlus size={16} />
                        {t('invite')}
                      </button>
                    </div>
                  ))
              ) : (
                <p>{t('friendsEmpty')}</p>
              )}
            </section>
          ) : (
            <section className="panel game-surface">
              {room.status === 'FINISHED' ? (
                <div className="results-panel">
                  <h2>{t('results')}</h2>
                  {room.view?.ranking.length ? (
                    room.view.ranking.map((id, i) => (
                      <div className="result-row" key={id}>
                        <strong>{i + 1}</strong>
                        <span>{name(id)}</span>
                      </div>
                    ))
                  ) : (
                    <p>{t('draw')}</p>
                  )}
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => {
                      void perform('game:rematch', 'rematch', {}).then((value) => {
                        const next = roomSchema.safeParse(value);
                        if (next.success) navigate(`/games/room/${next.data.id}`);
                      });
                    }}
                  >
                    {t('rematch')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="turn-indicator">
                    <span>
                      {turn?.id === user?.id
                        ? t('yourTurn')
                        : `${t('turnOf')} ${turn?.user?.username ?? t('bot')}`}
                    </span>
                    {seconds !== null && <strong role="timer">{seconds}s</strong>}
                  </div>
                  {room.view &&
                    (room.gameType === 'course-ecuries' ? (
                      <HorsesGame
                        view={room.view}
                        onAction={(a) => {
                          void action(a);
                        }}
                        disabled={busy || own?.control !== 'HUMAN'}
                      />
                    ) : room.gameType === 'carte-frenesie' ? (
                      <FrenzyGame
                        view={room.view}
                        onAction={(a) => {
                          void action(a);
                        }}
                        disabled={busy || own?.control !== 'HUMAN'}
                      />
                    ) : room.gameType === 'dames' ? (
                      <DraughtsGame
                        view={room.view}
                        onAction={(a) => {
                          void action(a);
                        }}
                        disabled={busy || own?.control !== 'HUMAN'}
                      />
                    ) : (
                      <BoardGame
                        view={room.view}
                        onAction={(a) => {
                          void action(a);
                        }}
                        disabled={busy || own?.control !== 'HUMAN'}
                      />
                    ))}
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => {
                      void leave();
                    }}
                  >
                    <Flag size={15} />
                    {t('forfeit')}
                  </button>
                </>
              )}
            </section>
          )}
        </section>
        <aside className="panel chat-panel">
          <h2>{t('chat')}</h2>
          <div className="chat-messages" role="log" aria-live="polite">
            {messages.data?.messages.map((m) => (
              <article key={m.id}>
                <strong>{m.user?.username ?? t('deletedPlayer')}</strong>
                <p>{m.content}</p>
                {m.user?.id !== user?.id && (
                  <button
                    className="report-message"
                    aria-label={t('report')}
                    onClick={() => {
                      void perform('chat:report', 'report', {
                        messageId: m.id,
                        reason: 'ABUSE',
                      }).then((v) => {
                        if (v) setNotice(t('reported'));
                      });
                    }}
                  >
                    <Flag size={12} />
                  </button>
                )}
              </article>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              void chat(e);
            }}
          >
            <label className="sr-only" htmlFor="chat-message">
              {t('message')}
            </label>
            <input
              id="chat-message"
              name="message"
              maxLength={500}
              required
              autoComplete="off"
              placeholder={t('message')}
            />
            <button className="icon-button" disabled={busy} aria-label={t('send')}>
              <Send size={18} />
            </button>
          </form>
          <ErrorMessage code={messages.error} />
        </aside>
      </div>
    </>
  );
}
