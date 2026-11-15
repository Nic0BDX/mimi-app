import { useState } from 'react';
import { z } from 'zod';
import { Crown } from 'lucide-react';
import type { Room } from '@mimi/shared';
import { useT } from '../i18n';
const moveSchema = z.object({
  type: z.literal('move'),
  from: z.number(),
  path: z.array(z.number()),
});
export function DraughtsGame({
  view,
  onAction,
  disabled,
}: {
  view: NonNullable<Room['view']>;
  onAction: (action: unknown) => void;
  disabled: boolean;
}) {
  const t = useT(),
    [selected, setSelected] = useState<number | null>(null),
    actions = view.legalActions.flatMap((a) => {
      const r = moveSchema.safeParse(a);
      return r.success ? [r.data] : [];
    }),
    available = selected === null ? actions : actions.filter((a) => a.from === selected);
  function choose(cell: number) {
    const destinations = available.filter((a) => a.path.at(-1) === cell);
    if (selected !== null && destinations.length === 1) {
      onAction(destinations[0]);
      setSelected(null);
    } else if (actions.some((a) => a.from === cell)) setSelected(cell);
    else setSelected(null);
  }
  return (
    <>
      <div className="draughts-board" role="group" aria-label={t('checkers')}>
        {view.board?.map((piece, cell) => (
          <button
            key={cell}
            className={`draughts-cell ${((cell % 10) + Math.floor(cell / 10)) % 2 ? 'dark' : 'light'} ${selected === cell ? 'selected' : ''} ${selected !== null && available.some((a) => a.path.at(-1) === cell) ? 'destination' : ''}`}
            disabled={
              disabled ||
              (!actions.some((a) => a.from === cell) &&
                !available.some((a) => a.path.at(-1) === cell))
            }
            aria-label={`${t('cell')} ${cell + 1}${piece ? ` ${t(piece >= 3 ? 'kingPiece' : 'manPiece')}` : ''}`}
            onClick={() => choose(cell)}
          >
            {piece > 0 && (
              <span className={`draughts-piece side-${piece % 2 === 1 ? 0 : 1}`}>
                {piece >= 3 && <Crown size={18} />}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="muted small">{t('draughtsHint')}</p>
      <div className="legal-moves">
        {available.map((a) => (
          <button
            className="button subtle"
            key={JSON.stringify(a)}
            disabled={disabled}
            onClick={() => {
              onAction(a);
              setSelected(null);
            }}
          >
            {a.from + 1} → {a.path.map((c) => c + 1).join(' → ')}
          </button>
        ))}
      </div>
    </>
  );
}
