import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Heart, Lightbulb, Send } from 'lucide-react';
import type { Room } from '@mimi/shared';
import { useT } from '../i18n';

export function WordsGame({
  view,
  onAction,
  disabled,
}: {
  view: NonNullable<Room['view']>;
  onAction: (action: unknown) => Promise<boolean>;
  disabled: boolean;
}) {
  const t = useT(),
    [word, setWord] = useState(''),
    input = useRef<HTMLInputElement>(null);
  const canPlay = !disabled && view.legalActions.length > 0;
  useEffect(() => {
    setWord('');
  }, [view.turn, view.sequence]);
  useEffect(() => {
    if (canPlay) input.current?.focus();
  }, [canPlay]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (canPlay && word.trim() && (await onAction({ type: 'word', word: word.trim() })))
      setWord('');
  }
  return (
    <div className="words-game">
      <div className="words-lives" aria-label={t('optionLives')}>
        {view.players.map((player, seat) => (
          <span key={player} className={view.turn === player ? 'active' : ''}>
            <span>
              {t('wordPlayer')} {seat + 1}
            </span>
            <span aria-label={`${view.lives?.[seat] ?? 0} ${t('optionLives')}`}>
              {Array.from({ length: view.lives?.[seat] ?? 0 }, (_, i) => (
                <Heart key={i} size={17} fill="currentColor" />
              ))}
              {view.lives?.[seat] === 0 && '—'}
            </span>
          </span>
        ))}
      </div>
      <div className="word-challenge">
        <Lightbulb size={48} />
        <p>{t('wordPrompt')}</p>
        <strong aria-live="polite">{view.sequence?.toUpperCase()}</strong>
      </div>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="word-form"
      >
        <label htmlFor="word-answer">{t('wordAnswer')}</label>
        <div>
          <input
            ref={input}
            id="word-answer"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            disabled={!canPlay}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            minLength={3}
            maxLength={35}
            required
          />
          <button className="button primary" disabled={!canPlay || word.trim().length < 3}>
            <Send size={18} />
            {t('wordSubmit')}
          </button>
        </div>
      </form>
      <p className="muted">{t('wordHint')}</p>
      <div className="word-alphabet" aria-label={t('wordAlphabet')}>
        {[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => (
          <span
            key={letter}
            className={view.letters?.includes(letter.toLowerCase()) ? 'collected' : ''}
          >
            {letter}
          </span>
        ))}
      </div>
      <details className="word-history">
        <summary>
          {t('wordHistory')} ({view.usedWords?.length ?? 0})
        </summary>
        <p>{view.usedWords?.slice(-30).reverse().join(' · ') || '—'}</p>
      </details>
    </div>
  );
}
