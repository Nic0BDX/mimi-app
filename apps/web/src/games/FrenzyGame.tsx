import { useState } from 'react';
import { z } from 'zod';
import type { Room } from '@mimi/shared';
import { useT } from '../i18n';
const playSchema = z.object({
  type: z.literal('play'),
  cardId: z.string(),
  color: z.string().optional(),
});
const labels: Record<string, string> = {
  skip: '⊘',
  reverse: '⇄',
  draw2: '+2',
  wild: '✦',
  wild4: '+4',
};
const shapes: Record<string, string> = { A: '●', B: '◆', C: '▲', D: '■', '*': '✦' };
export function FrenzyGame({
  view,
  onAction,
  disabled,
}: {
  view: NonNullable<Room['view']>;
  onAction: (action: unknown) => void;
  disabled: boolean;
}) {
  const t = useT(),
    [wild, setWild] = useState<string | null>(null),
    plays = view.legalActions.flatMap((a) => {
      const r = playSchema.safeParse(a);
      return r.success ? [r.data] : [];
    });
  const has = (type: string) =>
      view.legalActions.some((a) => !!a && typeof a === 'object' && 'type' in a && a.type === type),
    catchAction = view.legalActions.find(
      (a) => !!a && typeof a === 'object' && 'type' in a && a.type === 'catch',
    ),
    choosing = has('chooseColor');
  const cardText = (value: string) => labels[value] ?? value;
  return (
    <div className="frenzy-game">
      <div className="hand-counts">
        {view.counts?.map((count, i) => (
          <span key={view.players[i]}>
            {t('cardsRemaining')} {i + 1}: <strong>{count}</strong>
          </span>
        ))}
      </div>
      <div className="discard-area">
        <div className="draw-pile" aria-hidden="true">
          <span>✦</span>
        </div>
        <div className={`playing-card color-${view.color}`} aria-label={t('discard')}>
          <span className="card-corner">{shapes[view.color ?? 'A']}</span>
          <strong>{cardText(view.top?.value ?? '')}</strong>
          <span className="card-bottom">{shapes[view.color ?? 'A']}</span>
        </div>
        <div className="direction-indicator">
          {view.direction === 1 ? '↻' : '↺'}
          <small>
            {t('round')} {view.round}
          </small>
        </div>
      </div>
      {view.pendingDraw ? (
        <p className="feedback error">
          +{view.pendingDraw} {t('drawPenalty')}
        </p>
      ) : null}
      {view.notice && (
        <p role="status" className="feedback success">
          {t(
            view.notice === 'challengeWon'
              ? 'challengeWon'
              : view.notice === 'challengeLost'
                ? 'challengeLost'
                : 'penaltyAccepted',
          )}
        </p>
      )}
      {(wild || choosing) && (
        <fieldset className="color-picker">
          <legend>{t('chooseColor')}</legend>
          {['A', 'B', 'C', 'D'].map((color) => (
            <button
              key={color}
              className={`button color-${color}`}
              disabled={disabled}
              onClick={() => {
                onAction(
                  choosing ? { type: 'chooseColor', color } : { type: 'play', cardId: wild, color },
                );
                setWild(null);
              }}
            >
              {shapes[color]} {color}
            </button>
          ))}
        </fieldset>
      )}
      <div className="card-hand" aria-label={t('yourHand')}>
        {view.hand?.map((card) => {
          const legal = plays.filter((a) => a.cardId === card.id);
          return (
            <button
              className={`playing-card color-${card.color} ${legal.length ? 'playable' : ''}`}
              key={card.id}
              disabled={disabled || !legal.length}
              aria-label={`${t('playCard')} ${card.color} ${cardText(card.value)}`}
              onClick={() => {
                if (card.color === '*') setWild(card.id);
                else onAction({ type: 'play', cardId: card.id });
              }}
            >
              <span className="card-corner">
                {shapes[card.color]} {cardText(card.value)}
              </span>
              <strong>{cardText(card.value)}</strong>
              <span className="card-bottom">{shapes[card.color]}</span>
            </button>
          );
        })}
      </div>
      <div className="button-row frenzy-actions">
        {has('draw') && (
          <button
            className="button primary"
            disabled={disabled}
            onClick={() => onAction({ type: 'draw' })}
          >
            {t('drawCard')}
          </button>
        )}
        {has('pass') && (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => onAction({ type: 'pass' })}
          >
            {t('passTurn')}
          </button>
        )}
        {has('announce') && (
          <button
            className="button primary"
            disabled={disabled}
            onClick={() => onAction({ type: 'announce' })}
          >
            {t('lastCard')}
          </button>
        )}
        {!!catchAction && (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => onAction(catchAction)}
          >
            {t('catchLastCard')}
          </button>
        )}
        {has('challenge') && (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => onAction({ type: 'challenge' })}
          >
            {t('challengeFour')}
          </button>
        )}
      </div>
      {view.scores && (
        <p className="muted small">
          {t('points')}: {view.scores.join(' · ')}
        </p>
      )}
    </div>
  );
}
