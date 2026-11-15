import { describe, it, expect } from 'vitest';
import { dames, legalDraughts } from './engine.js';
import type { CoreState } from '../../engine/types.js';
function setup(pieces: Record<number, number>, extra: object = {}) {
  const board = Array<number>(100).fill(0);
  for (const [index, piece] of Object.entries(pieces)) board[Number(index)] = piece;
  return {
    ...dames.createInitialState(['a', 'b'], {}, { int: () => 0 }),
    board,
    quiet: 0,
    history: [] as string[],
    endgameRemaining: null,
    ...extra,
  };
}
function play(state: CoreState, action: unknown, id = 'a') {
  const before = JSON.stringify(state),
    result = dames.applyAction(state, id, action, { int: () => 0 });
  expect(result.ok).toBe(true);
  expect(JSON.stringify(state)).toBe(before);
  if (!result.ok) throw Error(result.code);
  return result.state;
}
describe('international draughts 10×10', () => {
  it('initializes 20 men per player and nine opening moves', () => {
    const s = dames.createInitialState(['a', 'b'], {}, { int: () => 0 }),
      v = dames.getPlayerView(s, 'a');
    expect(v.board?.filter((p) => p === 1)).toHaveLength(20);
    expect(v.board?.filter((p) => p === 2)).toHaveLength(20);
    expect(v.legalActions).toHaveLength(9);
    expect(dames.getLegalActions(s, 'b')).toEqual([]);
    expect(dames.onTimeout(s, 'a')).toBeTruthy();
    expect(dames.bot(s, 'a', { int: () => 0 })).toBeTruthy();
  });
  it('requires the maximum capture count over all pieces', () => {
    const s = setup({ 61: 1, 52: 2, 34: 2, 67: 1, 58: 2 });
    expect(dames.getLegalActions(s, 'a')).toEqual([{ type: 'move', from: 61, path: [43, 25] }]);
    expect(
      dames.applyAction(s, 'a', { type: 'move', from: 67, path: [49] }, { int: () => 0 }).ok,
    ).toBe(false);
    const next = dames.getPlayerView(play(s, { type: 'move', from: 61, path: [43, 25] }), 'a');
    expect(next.board?.[52]).toBe(0);
    expect(next.board?.[34]).toBe(0);
    expect(next.board?.[25]).toBe(1);
  });
  it('allows men to capture backwards but not make quiet backward moves', () => {
    const s = setup({ 43: 1, 54: 2, 7: 2 });
    expect(dames.getLegalActions(s, 'a')).toContainEqual({ type: 'move', from: 43, path: [65] });
    const quiet = setup({ 43: 1, 7: 2 });
    expect(
      dames.applyAction(quiet, 'a', { type: 'move', from: 43, path: [54] }, { int: () => 0 }).ok,
    ).toBe(false);
  });
  it('flying kings may land at any available square beyond a captured piece', () => {
    const s = setup({ 81: 3, 54: 2 });
    const actions = dames.getLegalActions(s, 'a');
    expect(actions).toHaveLength(5);
    for (const cell of [45, 36, 27, 18, 9])
      expect(actions).toContainEqual({ type: 'move', from: 81, path: [cell] });
    expect(dames.getStatus(play(s, { type: 'move', from: 81, path: [9] })).ranking).toEqual([
      'a',
      'b',
    ]);
  });
  it('own pieces block flying kings and captured pieces cannot be jumped twice', () => {
    const s = setup({ 81: 3, 63: 1, 54: 2 });
    expect(dames.getLegalActions(s, 'a')).not.toContainEqual({
      type: 'move',
      from: 81,
      path: [45],
    });
    const loop = setup({ 54: 3, 43: 2, 23: 2, 25: 2, 45: 2 });
    const parsed = dames.parseState(loop);
    expect(
      legalDraughts({
        ...parsed,
        board: loop.board,
        quiet: 0,
        history: [],
        endgameRemaining: null,
      }).every((m) => new Set(m.captures).size === m.captures.length),
    ).toBe(true);
  });
  it('promotes both colours only when their full move ends on the last row', () => {
    let next = play(setup({ 12: 1, 98: 4 }), { type: 'move', from: 12, path: [1] });
    expect(dames.getPlayerView(next, 'a').board?.[1]).toBe(3);
    next = play(setup({ 87: 2, 1: 3 }, { turn: 1 }), { type: 'move', from: 87, path: [96] }, 'b');
    expect(dames.getPlayerView(next, 'b').board?.[96]).toBe(4);
    next = play(setup({ 21: 1, 12: 2, 14: 2 }), { type: 'move', from: 21, path: [3, 25] });
    expect(dames.getPlayerView(next, 'a').board?.[25]).toBe(1);
  });
  it('implements king-only, repetition and reduced-material draw rules', () => {
    for (const extra of [{ quiet: 49 }, { endgameRemaining: 1 }]) {
      const s = setup({ 90: 3, 7: 4 }, extra);
      const next = play(s, { type: 'move', from: 90, path: [81] });
      expect(dames.getStatus(next).draw).toBe(true);
    }
    const s = setup({ 90: 3, 7: 4 });
    const target = [...s.board];
    target[90] = 0;
    target[81] = 3;
    s.history = [target.join('') + ':1', target.join('') + ':1'];
    expect(dames.getStatus(play(s, { type: 'move', from: 90, path: [81] })).draw).toBe(true);
  });
  it('rejects malformed paths and ended games', () => {
    const s = setup({ 61: 1, 52: 2 });
    for (const a of [
      { type: 'move', from: 61, path: [] },
      { type: 'move', from: 61, path: [100] },
      { type: 'move', from: 61, path: [43], captures: [52] },
    ])
      expect(dames.applyAction(s, 'a', a, { int: () => 0 }).ok).toBe(false);
    const done = { ...s, finished: true };
    expect(dames.getLegalActions(done, 'a')).toEqual([]);
    expect(dames.onTimeout(done, 'a')).toBeNull();
    expect(dames.bot(done, 'a', { int: () => 0 })).toBeNull();
  });
});
