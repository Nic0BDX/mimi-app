import { describe, expect, it } from 'vitest';
import { bombeMots, type WordsState } from './engine.js';
import { normalizeWord } from './dictionary.js';
const rng = { int: () => 0 };
const setup = (extra: Partial<WordsState> = {}): WordsState => ({
  ...bombeMots.createInitialState(['a', 'b', 'c'], {}, rng),
  lives: [3, 3, 3],
  letters: ['', '', ''],
  sequence: 'ch',
  usedWords: [],
  eliminated: [],
  options: { lives: 3, difficulty: 'easy' },
  ...extra,
});
function play(s: WordsState, action: unknown) {
  const before = JSON.stringify(s);
  const result = bombeMots.applyAction(s, s.players[s.turn]!, action, rng);
  expect(JSON.stringify(s)).toBe(before);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.code);
  return result.state as WordsState;
}
describe('Mot Mystère', () => {
  it('validates dictionary words, collects letters and advances the turn', () => {
    const next = play(setup(), { type: 'word', word: 'Château' });
    expect(next.usedWords).toEqual(['chateau']);
    expect(next.turn).toBe(1);
    expect(next.letters[0]).toBe('acehtu');
  });
  it('rejects unknown words, missing sequences, duplicates and out of turn actions', () => {
    for (const [state, id, action, code] of [
      [setup(), 'a', { type: 'word', word: 'chzzzzzz' }, 'WORD_UNKNOWN'],
      [setup(), 'a', { type: 'word', word: 'maison' }, 'WORD_SEQUENCE'],
      [setup({ usedWords: ['chat'] }), 'a', { type: 'word', word: 'CHAT' }, 'WORD_USED'],
      [setup(), 'b', { type: 'word', word: 'chat' }, 'NOT_YOUR_TURN'],
    ] as const)
      expect(bombeMots.applyAction(state, id, action, rng)).toEqual({ ok: false, code });
  });
  it('loses a life on timeout, skips eliminated seats and ranks the final survivor', () => {
    let s = setup({ lives: [1, 1, 1] });
    s = play(s, bombeMots.onTimeout(s, 'a'));
    expect(s.lives).toEqual([0, 1, 1]);
    expect(s.turn).toBe(1);
    s = play(s, { type: 'explode' });
    expect(s.finished).toBe(true);
    expect(s.ranking).toEqual(['c', 'b', 'a']);
    expect(bombeMots.getPlayerView(s, 'c').turn).toBeNull();
  });
  it('awards a life for the alphabet and resets collected letters', () => {
    const s = setup({ letters: ['abdefgijklmnopqrstuvwxyz', '', ''] });
    const next = play(s, { type: 'word', word: 'chat' });
    expect(next.lives[0]).toBe(4);
    expect(next.letters[0]).toBe('');
  });
  it('supports forfeits without reviving eliminated players or changing another turn', () => {
    const s = setup({ lives: [0, 3, 3], turn: 1, eliminated: ['a'] });
    const next = bombeMots.forfeit(s, 'c', rng) as WordsState;
    expect(next.finished).toBe(true);
    expect(next.ranking).toEqual(['b', 'c', 'a']);
    expect(s.lives).toEqual([0, 3, 3]);
  });
  it('provides legal bot moves and normalizes accents and ligatures', () => {
    const s = setup();
    const action = bombeMots.bot(s, 'a', { int: () => 1 });
    expect(action).toMatchObject({ type: 'word' });
    expect(bombeMots.applyAction(s, 'a', action, rng).ok).toBe(true);
    expect(normalizeWord('ŒUF')).toBe('oeuf');
    expect(bombeMots.getTurnSeconds(s)).toBe(15);
    expect(bombeMots.getTurnSeconds(setup({ options: { lives: 3, difficulty: 'hard' } }))).toBe(10);
  });
  it('keeps other turns on forfeit, skips eliminated seats and caps bonus lives', () => {
    const s = setup();
    const next = bombeMots.forfeit(s, 'c', rng) as WordsState;
    expect(next.turn).toBe(0);
    expect(next.finished).toBe(false);
    expect(next.lives).toEqual([3, 3, 0]);
    const skipped = play(setup({ lives: [3, 0, 3], eliminated: ['b'] }), { type: 'explode' });
    expect(skipped.turn).toBe(2);
    const bonus = play(setup({ lives: [5, 3, 3], letters: ['abdefgijklmnopqrstuvwxyz', '', ''] }), {
      type: 'word',
      word: 'chat',
    });
    expect(bonus.lives[0]).toBe(5);
    expect(bonus.letters[0]).toBe('');
  });
  it('bots stop on other turns and finished games, and explode when words run out', () => {
    const s = setup();
    expect(bombeMots.bot(s, 'b', rng)).toBeNull();
    expect(bombeMots.onTimeout(s, 'b')).toBeNull();
    expect(bombeMots.bot(setup({ finished: true }), 'a', rng)).toBeNull();
    expect(bombeMots.bot(s, 'a', rng)).toEqual({ type: 'explode' });
    expect(bombeMots.bot(setup({ sequence: 'zzzzzz' }), 'a', { int: () => 1 })).toEqual({
      type: 'explode',
    });
    const hard = bombeMots.createInitialState(
      ['a', 'b'],
      { difficulty: 'hard' },
      rng,
    ) as WordsState;
    expect(hard.sequence).toBe('ait');
    expect(hard.lives).toEqual([3, 3]);
  });
});
