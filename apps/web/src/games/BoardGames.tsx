import type { Room } from '@mimi/shared';
import { useT } from '../i18n';
export function BoardGame({
  view,
  onAction,
  disabled,
}: {
  view: NonNullable<Room['view']>;
  onAction: (action: unknown) => void;
  disabled: boolean;
}) {
  const t = useT(),
    board = view.board ?? [];
  if (view.kind === 'morpion')
    return (
      <div className="morpion-board" role="group" aria-label={t('morpion')}>
        {board.map((piece, cell) => (
          <button
            className={`board-cell piece-${piece}`}
            key={cell}
            disabled={
              disabled ||
              !view.legalActions.some(
                (a) => !!a && typeof a === 'object' && 'cell' in a && a.cell === cell,
              )
            }
            aria-label={`${t('cell')} ${cell + 1}${piece ? ` ${piece === 1 ? '×' : '○'}` : ''}`}
            onClick={() => onAction({ type: 'place', cell })}
          >
            {piece === 1 ? '×' : piece === 2 ? '○' : ''}
          </button>
        ))}
      </div>
    );
  return (
    <div className="connect-board" role="group" aria-label={t('connect')}>
      {Array.from({ length: 7 }, (_, column) => (
        <button
          className="connect-column"
          key={column}
          disabled={
            disabled ||
            !view.legalActions.some(
              (a) => !!a && typeof a === 'object' && 'column' in a && a.column === column,
            )
          }
          aria-label={`${t('column')} ${column + 1}`}
          onClick={() => onAction({ type: 'drop', column })}
        >
          <span className="column-arrow">↓</span>
          {Array.from({ length: 6 }, (_, row) => (
            <span key={row} className={`disc piece-${board[row * 7 + column]}`} />
          ))}
        </button>
      ))}
    </div>
  );
}
