import { describe, it, expect } from 'vitest';
import { morpion } from './morpion/engine.js';
import { puissanceQuatre, wonFour } from './puissance-quatre/engine.js';
import type { RegisteredEngine, CoreState } from '../engine/types.js';
function play(engine: RegisteredEngine, state: CoreState, id: string, action: unknown) {
  const result = engine.applyAction(state, id, action, { int: () => 0 });
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.code);
  return result.state;
}
describe('Morpion', () => {
  it('wins every possible line without mutating prior states', () => {
    for (const cells of [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ]) {
      const initial = morpion.createInitialState(['a', 'b'], {}, { int: () => 0 });
      const state = { ...initial, board: Array<number>(9).fill(0) };
      state.board[cells[0]!] = 1;
      state.board[cells[1]!] = 1;
      const before = JSON.stringify(state),
        next = play(morpion, state, 'a', { type: 'place', cell: cells[2] });
      expect(morpion.getStatus(next)).toMatchObject({ status: 'finished', ranking: ['a', 'b'] });
      expect(JSON.stringify(state)).toBe(before);
    }
  });
  it('rejects wrong players, wrong turns, occupied cells and unknown actions', () => {
    let s = morpion.createInitialState(['a', 'b'], {}, { int: () => 0 });
    for (const [id, action] of [
      ['b', { type: 'place', cell: 0 }],
      ['x', { type: 'place', cell: 0 }],
      ['a', { type: 'place', cell: 9 }],
      ['a', { type: 'cheat' }],
    ] as const)
      expect(morpion.applyAction(s, id, action, { int: () => 0 }).ok).toBe(false);
    s = play(morpion, s, 'a', { type: 'place', cell: 0 });
    expect(morpion.applyAction(s, 'b', { type: 'place', cell: 0 }, { int: () => 0 }).ok).toBe(
      false,
    );
    expect(() => morpion.getPlayerView(s, 'x')).toThrow();
  });
  it('finishes a complete drawn game', () => {
    let s = morpion.createInitialState(['a', 'b'], {}, { int: () => 0 });
    for (const cell of [0, 1, 2, 4, 3, 5, 7, 6, 8])
      s = play(morpion, s, s.players[s.turn]!, { type: 'place', cell });
    expect(morpion.getStatus(s).draw).toBe(true);
    expect(morpion.onTimeout(s, 'a')).toBeNull();
    expect(morpion.getLegalActions(s, 'a')).toEqual([]);
  });
});
describe('Puissance 4', () => {
  it('drops to the lowest space and wins vertically', () => {
    let s = puissanceQuatre.createInitialState(['a', 'b'], {}, { int: () => 0 });
    for (const column of [0, 1, 0, 1, 0, 1, 0])
      s = play(puissanceQuatre, s, s.players[s.turn]!, { type: 'drop', column });
    expect(puissanceQuatre.getStatus(s).ranking).toEqual(['a', 'b']);
    expect(puissanceQuatre.getPlayerView(s, 'a').board?.[35]).toBe(1);
  });
  it('detects horizontal and both diagonals without wrapping edges', () => {
    for (const cells of [
      [35, 36, 37, 38],
      [35, 29, 23, 17],
      [14, 22, 30, 38],
    ]) {
      const board = Array<number>(42).fill(0);
      cells.forEach((c) => (board[c] = 1));
      expect(wonFour(board, cells[3]!, 1)).toBe(true);
    }
    const board = Array<number>(42).fill(0);
    [5, 6, 7, 8].forEach((c) => (board[c] = 1));
    expect(wonFour(board, 8, 1)).toBe(false);
  });
  it('rejects full columns and malformed actions', () => {
    const s = {
      ...puissanceQuatre.createInitialState(['a', 'b'], {}, { int: () => 0 }),
      board: Array<number>(42).fill(0),
    };
    for (let i = 0; i < 6; i++) s.board[i * 7] = (i % 2) + 1;
    expect(
      puissanceQuatre.applyAction(s, 'a', { type: 'drop', column: 0 }, { int: () => 0 }).ok,
    ).toBe(false);
    expect(
      puissanceQuatre.applyAction(s, 'a', { type: 'drop', column: 7 }, { int: () => 0 }).ok,
    ).toBe(false);
    expect(puissanceQuatre.getLegalActions(s, 'a')).toHaveLength(6);
  });
});
