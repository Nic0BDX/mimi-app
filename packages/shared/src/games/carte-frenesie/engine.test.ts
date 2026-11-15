import { describe, it, expect } from 'vitest';
import {
  carteFrenesie,
  createDeck,
  cardPoints,
  frenzyOptions,
  type FrenzyState,
} from './engine.js';
import type { RandomSource } from '../../engine/types.js';
const rng: RandomSource = { int: () => 0 };
function fixture(
  specs: string[][],
  top = 'A5',
  options: object = {},
  extra: object = {},
): FrenzyState {
  const pool = createDeck();
  function choose(spec: string) {
    const index = pool.findIndex((c) => `${c.color}${c.value}` === spec);
    if (index < 0) throw Error(spec);
    return pool.splice(index, 1)[0]!;
  }
  const hands = specs.map((hand) => hand.map(choose)),
    discard = [choose(top)];
  return {
    players: specs.map((_, i) => String(i)),
    turn: 0,
    moves: 0,
    finished: false,
    ranking: [],
    hands,
    deck: pool,
    discard,
    color: top[0] === '*' ? 'A' : (top[0] as 'A'),
    direction: 1,
    drawnId: null,
    pendingDraw: 0,
    lastCardPlayer: null,
    announcedSeat: null,
    awaitingColor: false,
    challenge: null,
    winnerPending: null,
    round: 1,
    scores: specs.map(() => 0),
    options: frenzyOptions.parse(options),
    notice: null,
    ...extra,
  };
}
function play(s: FrenzyState, action: unknown, id = s.players[s.turn]!): FrenzyState {
  const before = JSON.stringify(s),
    result = carteFrenesie.applyAction(s, id, action, rng);
  expect(result.ok).toBe(true);
  expect(JSON.stringify(s)).toBe(before);
  if (!result.ok) throw Error(result.code);
  return result.state as FrenzyState;
}
const put = (s: FrenzyState, index = 0, color?: 'A' | 'B' | 'C' | 'D', announce?: boolean) => ({
  type: 'play',
  cardId: s.hands[s.turn]![index]!.id,
  ...(color ? { color } : {}),
  ...(announce ? { announce } : {}),
});
describe('Carte Frénésie', () => {
  it('builds exactly 108 unique cards and correct values', () => {
    const cards = createDeck();
    expect(cards).toHaveLength(108);
    expect(new Set(cards.map((c) => c.id)).size).toBe(108);
    for (const color of ['A', 'B', 'C', 'D']) {
      expect(cards.filter((c) => c.color === color)).toHaveLength(25);
      expect(cards.filter((c) => c.color === color && c.value === '0')).toHaveLength(1);
    }
    expect(cards.filter((c) => c.value === 'wild4')).toHaveLength(4);
    expect(cardPoints({ id: 'x', color: 'A', value: '9' })).toBe(9);
    expect(cardPoints({ id: 'x', color: 'A', value: 'skip' })).toBe(20);
    expect(cardPoints({ id: 'x', color: '*', value: 'wild' })).toBe(50);
  });
  it('initializes all supported player counts without opening on a wild four', () => {
    for (let n = 2; n <= 8; n++) {
      const s = carteFrenesie.createInitialState(
        Array.from({ length: n }, (_, i) => String(i)),
        {},
        rng,
      ) as FrenzyState;
      expect(s.discard[0]?.value).not.toBe('wild4');
      const all = [...s.deck, ...s.discard, ...s.hands.flat()];
      expect(all).toHaveLength(108);
      expect(new Set(all.map((c) => c.id)).size).toBe(108);
      expect(s.hands.every((h) => h.length >= 7)).toBe(true);
    }
    expect(() => carteFrenesie.createInitialState(['0'], {}, rng)).toThrow();
  });
  it('matches colour or symbol, rejects illegal cards, and never exposes other hands or deck', () => {
    const s = fixture([
      ['A1', 'B5', 'C3', '*wild'],
      ['D7', 'D8'],
    ]);
    const legal = carteFrenesie.getLegalActions(s, '0');
    expect(legal).toContainEqual({ type: 'play', cardId: s.hands[0]![0]!.id });
    expect(legal).toContainEqual({ type: 'play', cardId: s.hands[0]![1]!.id });
    expect(carteFrenesie.applyAction(s, '0', put(s, 2), rng).ok).toBe(false);
    expect(carteFrenesie.applyAction(s, '1', put(s), rng).ok).toBe(false);
    const v = carteFrenesie.getPlayerView(s, '0');
    expect(v.hand).toHaveLength(4);
    expect(v.counts).toEqual([4, 2]);
    expect(v).not.toHaveProperty('deck');
    expect(v).not.toHaveProperty('hands');
    expect(v).not.toHaveProperty('challenge');
    for (const c of s.hands[1]!) expect(v.hand?.some((own) => own.id === c.id)).toBe(false);
  });
  it('skips turns, reverses direction and treats reverse as skip for two players', () => {
    let s = fixture([['Askip', 'B1'], ['B2'], ['B3']]);
    expect(play(s, put(s)).turn).toBe(2);
    s = fixture([['Areverse', 'B1'], ['B2'], ['B3']]);
    const next = play(s, put(s));
    expect(next.direction).toBe(-1);
    expect(next.turn).toBe(2);
    s = fixture([['Areverse', 'B1'], ['B2']]);
    expect(play(s, put(s)).turn).toBe(0);
  });
  it('applies +2 penalties and optional stacking in any colour', () => {
    let s = fixture([['Adraw2', 'B1'], ['Bdraw2', 'B2'], ['B3']]);
    let next = play(s, put(s));
    expect(next.hands[1]).toHaveLength(4);
    expect(next.turn).toBe(2);
    s = fixture([['Adraw2', 'B1'], ['Bdraw2', 'B2'], ['B3']], 'A5', { stackDrawTwo: true });
    next = play(s, put(s));
    expect(next.pendingDraw).toBe(2);
    next = play(next, put(next));
    expect(next.pendingDraw).toBe(4);
    next = play(next, { type: 'draw' });
    expect(next.hands[2]).toHaveLength(5);
    expect(next.pendingDraw).toBe(0);
    expect(next.turn).toBe(0);
  });
  it('enforces strict wild four when challenges are disabled and chooses wild colours', () => {
    let s = fixture([['*wild4', 'A1'], ['B2']]);
    expect(carteFrenesie.applyAction(s, '0', put(s, 0, 'B'), rng).ok).toBe(false);
    s = fixture([['*wild4', 'B1'], ['B2'], ['C1']]);
    const next = play(s, put(s, 0, 'D'));
    expect(next.color).toBe('D');
    expect(next.hands[1]).toHaveLength(5);
    expect(next.turn).toBe(2);
    s = fixture([['*wild', 'B1'], ['B2']]);
    expect(play(s, put(s, 0, 'C')).color).toBe('C');
    expect(carteFrenesie.applyAction(s, '0', put(s), rng).ok).toBe(false);
  });
  it('resolves successful, failed and accepted wild-four challenges without leaking evidence', () => {
    let s = fixture([['*wild4', 'A1'], ['B2'], ['C1']], 'A5', { challengeWildFour: true });
    s = play(s, put(s, 0, 'B'));
    expect(carteFrenesie.getPlayerView(s, '1')).not.toHaveProperty('hadColor');
    s = play(s, { type: 'challenge' });
    expect(s.hands[0]).toHaveLength(5);
    expect(s.turn).toBe(1);
    expect(s.notice).toBe('challengeWon');
    for (const action of [{ type: 'challenge' }, { type: 'draw' }]) {
      let next = fixture([['*wild4', 'D1'], ['B2'], ['C1']], 'A5', { challengeWildFour: true });
      next = play(next, put(next, 0, 'B'));
      next = play(next, action);
      expect(next.hands[1]).toHaveLength(action.type === 'challenge' ? 7 : 5);
      expect(next.turn).toBe(2);
    }
  });
  it('allows only the newly drawn card and offers an explicit pass', () => {
    let s = fixture([['B2'], ['C3']]);
    const index = s.deck.findIndex((c) => c.color === 'A' && c.value === '7');
    s.deck.push(s.deck.splice(index, 1)[0]!);
    s = play(s, { type: 'draw' });
    expect(s.drawnId).toBe(s.hands[0]!.at(-1)!.id);
    expect(carteFrenesie.getLegalActions(s, '0')).toContainEqual({ type: 'pass' });
    expect(
      carteFrenesie.applyAction(s, '0', { type: 'play', cardId: s.hands[0]![0]!.id }, rng).ok,
    ).toBe(false);
    const passed = play(s, { type: 'pass' });
    expect(passed.turn).toBe(1);
    expect(passed.drawnId).toBeNull();
    const played = play(s, { type: 'play', cardId: s.drawnId });
    expect(played.discard.at(-1)?.value).toBe('7');
  });
  it('recycles discard while preserving its top and handles an exhausted draw pile', () => {
    let s = fixture([['B2'], ['C3']]);
    const top = s.discard[0]!,
      old = s.deck.splice(0, 3);
    s.deck = [];
    s.discard = [...old, top];
    s = play(s, { type: 'draw' });
    expect(s.discard).toEqual([top]);
    expect(s.hands.flat().some((c) => c.id === top.id)).toBe(false);
    s = fixture([['B2'], ['C3']], 'A5', {}, { deck: [] });
    expect(play(s, { type: 'draw' }).turn).toBe(1);
  });
  it('penalizes missing last-card announcements only within the open window', () => {
    let s = fixture([
      ['A1', 'A2'],
      ['A3', 'A4'],
    ]);
    s = play(s, put(s));
    expect(s.lastCardPlayer).toBe('0');
    const caught = play(s, { type: 'catch', target: '0' }, '1');
    expect(caught.hands[0]).toHaveLength(3);
    expect(caught.turn).toBe(1);
    expect(carteFrenesie.applyAction(caught, '1', { type: 'catch', target: '0' }, rng).ok).toBe(
      false,
    );
    const announced = play(s, { type: 'announce' }, '0');
    expect(announced.lastCardPlayer).toBeNull();
    let pre = fixture([['A1', 'A2'], ['B2']]);
    pre = play(pre, { type: 'announce' });
    pre = play(pre, put(pre));
    expect(pre.lastCardPlayer).toBeNull();
    const closed = play(s, put(s));
    expect(closed.lastCardPlayer).not.toBe('0');
  });
  it('scores actual cards, starts further rounds and resolves a last-card +4 before victory', () => {
    let s = fixture([['A1'], ['B9']], 'A5', { pointsMode: true });
    s = play(s, put(s));
    expect(s.round).toBe(2);
    expect(s.scores[0]).toBe(9);
    expect(s.finished).toBe(false);
    s = fixture(
      [['A1'], ['B9']],
      'A5',
      { pointsMode: true, targetScore: 100 },
      { scores: [99, 0] },
    );
    s = play(s, put(s));
    expect(s.finished).toBe(true);
    expect(s.scores[0]).toBe(108);
    let pending = fixture([['*wild4'], ['B2'], ['C1']], 'A5', { challengeWildFour: true });
    pending = play(pending, put(pending, 0, 'B'));
    expect(pending.finished).toBe(false);
    pending = play(pending, { type: 'draw' });
    expect(pending.finished).toBe(true);
    expect(pending.ranking[0]).toBe('0');
  });
  it('supports initial colour selection, timeouts, bots and ended-game guards', () => {
    let s = fixture([['A1'], ['B2']], '*wild', {}, { awaitingColor: true });
    expect(carteFrenesie.getLegalActions(s, '0')).toHaveLength(4);
    s = play(s, { type: 'chooseColor', color: 'D' });
    expect(s.color).toBe('D');
    expect(s.awaitingColor).toBe(false);
    expect(carteFrenesie.onTimeout(s, '0')).toBeTruthy();
    expect(carteFrenesie.bot(s, '0', rng)).toBeTruthy();
    s.finished = true;
    expect(carteFrenesie.getLegalActions(s, '0')).toEqual([]);
    expect(carteFrenesie.onTimeout(s, '0')).toBeNull();
  });
});
