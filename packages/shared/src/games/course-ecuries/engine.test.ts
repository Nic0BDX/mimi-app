import { describe, it, expect } from 'vitest';
import { courseEcuries, horseOptions, FINISH, type HorsesState } from './engine.js';
function setup(options: object = {}, extra: object = {}): HorsesState {
  return {
    ...courseEcuries.createInitialState(['a', 'b'], options, { int: () => 0 }),
    positions: [
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
    ],
    die: null,
    phase: 'roll',
    attempts: 0,
    consecutiveSix: 0,
    lastHorse: null,
    options: horseOptions.parse(options),
    lastMove: null,
    ...extra,
  };
}
function play(s: HorsesState, action: unknown, die = 1): HorsesState {
  const before = JSON.stringify(s),
    result = courseEcuries.applyAction(s, s.players[s.turn]!, action, { int: () => die - 1 });
  expect(result.ok).toBe(true);
  expect(JSON.stringify(s)).toBe(before);
  if (!result.ok) throw Error(result.code);
  return result.state as HorsesState;
}
describe('Course des Écuries', () => {
  it('requires a server-rolled six to leave the stable and grants another turn', () => {
    let s = setup();
    s = play(s, { type: 'roll' }, 3);
    expect(s.turn).toBe(1);
    expect(s.positions[0]).toEqual([-1, -1, -1, -1]);
    s = setup();
    s = play(s, { type: 'roll' }, 6);
    expect(courseEcuries.getLegalActions(s, 'a')).toHaveLength(4);
    s = play(s, { type: 'moveHorse', horse: 0 });
    expect(s.positions[0]?.[0]).toBe(0);
    expect(s.turn).toBe(0);
    expect(s.phase).toBe('roll');
    expect(courseEcuries.applyAction(s, 'a', { type: 'roll', die: 6 }, { int: () => 0 }).ok).toBe(
      false,
    );
  });
  it('moves along the common track and captures opposing horses', () => {
    let s = setup(
      { safeStarts: false },
      {
        positions: [
          [12, -1, -1, -1],
          [1, -1, -1, -1],
        ],
        die: 3,
        phase: 'choose',
      },
    );
    s = play(s, { type: 'moveHorse', horse: 0 });
    expect(s.positions[0]?.[0]).toBe(15);
    expect(s.positions[1]?.[0]).toBe(-1);
    expect(s.turn).toBe(1);
    expect(s.lastMove?.path).toEqual([12, 13, 14, 15]);
  });
  it('protects starting squares when enabled and captures them when disabled', () => {
    for (const safeStarts of [true, false]) {
      let s = setup(
        { safeStarts },
        {
          positions: [
            [12, -1, -1, -1],
            [0, -1, -1, -1],
          ],
          die: 2,
          phase: 'choose',
        },
      );
      s = play(s, { type: 'moveHorse', horse: 0 });
      expect(s.positions[1]?.[0]).toBe(safeStarts ? 0 : -1);
    }
  });
  it('blocks crossing barriers but allows a horse to leave its own barrier', () => {
    const s = setup(
      { barriers: true },
      {
        positions: [
          [10, -1, -1, -1],
          [0, 0, -1, -1],
        ],
        die: 6,
        phase: 'choose',
      },
    );
    expect(courseEcuries.getLegalActions(s, 'a')).not.toContainEqual({
      type: 'moveHorse',
      horse: 0,
    });
    const own = setup(
      { barriers: true },
      {
        positions: [
          [10, 10, -1, -1],
          [-1, -1, -1, -1],
        ],
        die: 2,
        phase: 'choose',
      },
    );
    expect(courseEcuries.getLegalActions(own, 'a')).toContainEqual({ type: 'moveHorse', horse: 0 });
  });
  it('uses six private lane cells plus the finish and requires exact arrival by default', () => {
    const s = setup(
      {},
      {
        positions: [
          [61, 62, 62, 62],
          [-1, -1, -1, -1],
        ],
        die: 2,
        phase: 'choose',
      },
    );
    expect(courseEcuries.getLegalActions(s, 'a')).toEqual([]);
    const exact = { ...s, die: 1 };
    const won = play(exact, { type: 'moveHorse', horse: 0 });
    expect(won.finished).toBe(true);
    expect(won.ranking).toEqual(['a', 'b']);
    const bounce = setup(
      { bounce: true },
      {
        positions: [
          [61, -1, -1, -1],
          [-1, -1, -1, -1],
        ],
        die: 3,
        phase: 'choose',
      },
    );
    expect(play(bounce, { type: 'moveHorse', horse: 0 }).positions[0]?.[0]).toBe(60);
    expect(FINISH).toBe(62);
  });
  it('offers at most three starting attempts and then advances', () => {
    let s = setup({ threeAttempts: true });
    for (let i = 0; i < 2; i++) {
      s = play(s, { type: 'roll' }, 2);
      expect(s.turn).toBe(0);
    }
    s = play(s, { type: 'roll' }, 2);
    expect(s.turn).toBe(1);
    expect(s.attempts).toBe(0);
  });
  it('applies optional triple-six penalty and automatic single moves', () => {
    let s = setup(
      { tripleSixPenalty: true },
      {
        positions: [
          [5, -1, -1, -1],
          [-1, -1, -1, -1],
        ],
        consecutiveSix: 2,
        lastHorse: 0,
      },
    );
    s = play(s, { type: 'roll' }, 6);
    expect(s.positions[0]?.[0]).toBe(-1);
    expect(s.turn).toBe(1);
    s = setup(
      { automaticMove: true },
      {
        positions: [
          [5, -1, -1, -1],
          [-1, -1, -1, -1],
        ],
      },
    );
    s = play(s, { type: 'roll' }, 3);
    expect(s.positions[0]?.[0]).toBe(8);
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(1);
  });
  it('continues full ranking and skips completed or forfeited players', () => {
    let s = setup(
      { fullRanking: true },
      {
        players: ['a', 'b', 'c'],
        positions: [
          [61, 62, 62, 62],
          [10, -1, -1, -1],
          [20, -1, -1, -1],
        ],
        die: 1,
        phase: 'choose',
      },
    );
    s = play(s, { type: 'moveHorse', horse: 0 });
    expect(s.finished).toBe(false);
    expect(s.ranking).toEqual(['a']);
    expect(s.turn).toBe(1);
    const forfeited = courseEcuries.forfeit(s, 'b', { int: () => 0 });
    expect(forfeited.finished).toBe(true);
    expect(forfeited.ranking).toEqual(['a', 'c', 'b']);
  });
  it('bots prioritize exit, then capture, then the most advanced horse', () => {
    let s = setup(
      {},
      {
        positions: [
          [10, -1, -1, -1],
          [-1, -1, -1, -1],
        ],
        die: 6,
        phase: 'choose',
      },
    );
    expect(courseEcuries.bot(s, 'a', { int: () => 0 })).toEqual({ type: 'moveHorse', horse: 1 });
    s = setup(
      { safeStarts: false },
      {
        positions: [
          [12, 20, 30, 40],
          [1, -1, -1, -1],
        ],
        die: 3,
        phase: 'choose',
      },
    );
    expect(courseEcuries.bot(s, 'a', { int: () => 0 })).toEqual({ type: 'moveHorse', horse: 0 });
    s = setup(
      {},
      {
        positions: [
          [5, 10, 15, 20],
          [-1, -1, -1, -1],
        ],
        die: 2,
        phase: 'choose',
      },
    );
    expect(courseEcuries.bot(s, 'a', { int: () => 0 })).toEqual({ type: 'moveHorse', horse: 3 });
    expect(courseEcuries.onTimeout(s, 'b')).toBeNull();
  });
});
