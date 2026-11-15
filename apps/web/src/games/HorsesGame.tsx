import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Dices } from 'lucide-react';
import type { Room } from '@mimi/shared';
import { useT } from '../i18n';
const colors = ['#ffd56c', '#c799fb', '#6ed6bc', '#ef91b2'];
const corners = [
  [6, 0],
  [9, 0],
  [9, 6],
  [15, 6],
  [15, 9],
  [9, 9],
  [9, 15],
  [6, 15],
  [6, 9],
  [0, 9],
  [0, 6],
  [6, 6],
  [6, 0],
];
const track = Array.from({ length: 56 }, (_, i) => {
  let distance = (i * 60) / 56;
  for (let n = 0; n < corners.length - 1; n++) {
    const a = corners[n]!,
      b = corners[n + 1]!,
      length = Math.abs(b[0]! - a[0]!) + Math.abs(b[1]! - a[1]!);
    if (distance <= length) {
      const ratio = distance / length;
      return {
        x: 75 + 30 * (a[0]! + (b[0]! - a[0]!) * ratio),
        y: 75 + 30 * (a[1]! + (b[1]! - a[1]!) * ratio),
      };
    }
    distance -= length;
  }
  return { x: 255, y: 75 };
});
function point(seat: number, horse: number, progress: number) {
  if (progress === -1) {
    const centers = [
        [150, 150],
        [450, 150],
        [450, 450],
        [150, 450],
      ],
      center = centers[seat]!;
    return { x: center[0]! + (horse % 2 === 0 ? -21 : 21), y: center[1]! + (horse < 2 ? -21 : 21) };
  }
  if (progress === 62) return { x: 285 + (seat % 2) * 30, y: 285 + Math.floor(seat / 2) * 30 };
  if (progress < 56) return track[(seat * 14 + progress) % 56]!;
  const p = progress - 56;
  return [
    { x: 300, y: 110 + p * 30 },
    { x: 490 - p * 30, y: 300 },
    { x: 300, y: 490 - p * 30 },
    { x: 110 + p * 30, y: 300 },
  ][seat]!;
}
const moveSchema = z.object({ type: z.literal('moveHorse'), horse: z.number() });
export function HorsesGame({
  view,
  onAction,
  disabled,
}: {
  view: NonNullable<Room['view']>;
  onAction: (action: unknown) => void;
  disabled: boolean;
}) {
  const t = useT(),
    moves = view.legalActions.flatMap((a) => {
      const r = moveSchema.safeParse(a);
      return r.success ? [r.data] : [];
    }),
    canRoll = view.legalActions.some(
      (a) => !!a && typeof a === 'object' && 'type' in a && a.type === 'roll',
    );
  const [lastAnimation, setLastAnimation] = useState<{ id: number; progress: number } | null>(null),
    moveKey = view.lastMove ? JSON.stringify(view.lastMove) : '';
  useEffect(() => {
    if (!moveKey || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = z.object({ id: z.number(), path: z.array(z.number()) }).parse(JSON.parse(moveKey));
    let step = 0;
    const timer = setInterval(() => {
      if (step >= move.path.length) {
        clearInterval(timer);
        return;
      }
      setLastAnimation({ id: move.id, progress: move.path[step++]! });
    }, 95);
    return () => clearInterval(timer);
  }, [moveKey]);
  const current = view.players.indexOf(view.turn ?? '');
  return (
    <div className="horses-game">
      <div className="dice-area">
        <div className="die-face" aria-label={`${t('lastRoll')} ${view.die ?? '—'}`}>
          {view.die ?? <Dices size={35} />}
        </div>
        <button
          className="button primary"
          disabled={disabled || !canRoll}
          onClick={() => onAction({ type: 'roll' })}
        >
          <Dices size={18} />
          {t('rollDice')}
        </button>
      </div>
      <svg className="horses-board" viewBox="0 0 600 600" role="img" aria-label={t('horses')}>
        <defs>
          <radialGradient id="horse-board-bg">
            <stop stopColor="#414270" />
            <stop offset="1" stopColor="#202b4b" />
          </radialGradient>
        </defs>
        <rect
          x="8"
          y="8"
          width="584"
          height="584"
          rx="45"
          fill="url(#horse-board-bg)"
          stroke="#b18ae6"
          strokeWidth="3"
        />
        <path
          d="M255 75h90v180h180v90H345v180h-90V345H75v-90h180z"
          fill="#141d37"
          stroke="#9b83bb"
          strokeWidth="2"
        />
        {[
          [150, 150],
          [450, 150],
          [450, 450],
          [150, 450],
        ].map(([x, y], seat) => (
          <g key={seat}>
            <rect
              x={x! - 64}
              y={y! - 64}
              width="128"
              height="128"
              rx="26"
              fill={`${colors[seat]}16`}
              stroke={colors[seat]}
              strokeWidth="3"
            />
            {[-1, 1].flatMap((dx) =>
              [-1, 1].map((dy) => (
                <circle
                  key={`${dx}:${dy}`}
                  cx={x! + dx * 21}
                  cy={y! + dy * 21}
                  r="17"
                  fill="#141b35"
                  stroke={`${colors[seat]}66`}
                />
              )),
            )}
          </g>
        ))}
        {track.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="11.5"
            fill={i % 14 === 0 ? colors[i / 14] : '#3d496c'}
            stroke={i % 14 === 0 ? '#fff1ca' : '#8692bb'}
            strokeWidth="1.5"
          />
        ))}
        {colors.flatMap((color, seat) =>
          Array.from({ length: 6 }, (_, i) => {
            const p = point(seat, 0, 56 + i);
            return (
              <rect
                key={`${seat}:${i}`}
                x={p.x - 11}
                y={p.y - 11}
                width="22"
                height="22"
                rx="5"
                fill={color}
                opacity=".7"
              />
            );
          }),
        )}
        <path d="m300 275 25 25-25 25-25-25z" fill="#ffe8ac" stroke="#fff3d2" strokeWidth="3" />
        {view.positions?.flatMap((horses, seat) =>
          horses.map((progress, horse) => {
            const animated =
                view.lastMove?.player === seat &&
                view.lastMove.horse === horse &&
                lastAnimation?.id === view.lastMove.id
                  ? lastAnimation.progress
                  : progress,
              p = point(seat, horse, animated),
              legal = seat === current && moves.some((a) => a.horse === horse) && !disabled;
            return (
              <g
                key={`${seat}:${horse}`}
                transform={`translate(${p.x} ${p.y})`}
                role={legal ? 'button' : undefined}
                tabIndex={legal ? 0 : undefined}
                aria-label={`${t('horse')} ${horse + 1}`}
                onClick={() => {
                  if (legal) onAction({ type: 'moveHorse', horse });
                }}
                onKeyDown={(e) => {
                  if (legal && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onAction({ type: 'moveHorse', horse });
                  }
                }}
              >
                <circle
                  r={legal ? 17 : 13}
                  fill={colors[seat]}
                  stroke={legal ? '#fff5bd' : '#1d2744'}
                  strokeWidth={legal ? 3 : 2}
                />
                <path d="M-6 8V0L-2-8 3-10 8-4 5 0H1L4 8Z" fill="#31334b" />
                <circle cx="3" cy="-5" r="1" fill="white" />
              </g>
            );
          }),
        )}
      </svg>
      <div className="horse-choices">
        {moves.map((a) => (
          <button
            className="button secondary"
            key={a.horse}
            disabled={disabled}
            onClick={() => onAction(a)}
          >
            {t('moveHorse')} {a.horse + 1}
          </button>
        ))}
      </div>
      <p className="muted small">{t('horsesHint')}</p>
    </div>
  );
}
