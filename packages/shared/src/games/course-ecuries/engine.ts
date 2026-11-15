import { z } from 'zod';
import {
  coreStateSchema,
  coreView,
  defineEngine,
  assertRule,
  requireTurn,
  status,
  type RandomSource,
} from '../../engine/types.js';
export const FINISH = 62;
export const horseOptions = z
  .object({
    safeStarts: z.boolean().default(true),
    barriers: z.boolean().default(false),
    threeAttempts: z.boolean().default(false),
    automaticMove: z.boolean().default(false),
    bounce: z.boolean().default(false),
    tripleSixPenalty: z.boolean().default(false),
    fullRanking: z.boolean().default(false),
  })
  .strict();
const stateSchema = coreStateSchema.extend({
  positions: z.array(z.array(z.number().int().min(-1).max(FINISH)).length(4)),
  die: z.number().int().min(1).max(6).nullable(),
  phase: z.enum(['roll', 'choose']),
  attempts: z.number().int().nonnegative(),
  consecutiveSix: z.number().int().nonnegative(),
  lastHorse: z.number().int().nullable(),
  options: horseOptions,
  lastMove: z
    .object({
      id: z.number(),
      player: z.number(),
      horse: z.number(),
      path: z.array(z.number().int()),
    })
    .nullable(),
});
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }).strict(),
  z.object({ type: z.literal('moveHorse'), horse: z.number().int().min(0).max(3) }).strict(),
]);
export type HorsesState = z.infer<typeof stateSchema>;
type Action = z.infer<typeof actionSchema>;
export const trackCell = (seat: number, progress: number) => (seat * 14 + progress) % 56;
function occupancy(s: HorsesState, cell: number, ignoreHorse: number) {
  const seats: number[] = [];
  s.positions.forEach((horses, seat) => {
    if (s.forfeited?.includes(s.players[seat]!)) return;
    horses.forEach((progress, horse) => {
      if (
        !(seat === s.turn && horse === ignoreHorse) &&
        progress >= 0 &&
        progress < 56 &&
        trackCell(seat, progress) === cell
      )
        seats.push(seat);
    });
  });
  return seats;
}
function destination(s: HorsesState, horse: number): number | null {
  const from = s.positions[s.turn]![horse]!,
    die = s.die!;
  if (from === FINISH) return null;
  if (from === -1 && die !== 6) return null;
  let to = from === -1 ? 0 : from + die;
  if (to > FINISH) {
    if (!s.options.bounce) return null;
    to = 2 * FINISH - to;
  }
  const path =
    from === -1
      ? [0]
      : Array.from({ length: die }, (_, i) => {
          const p = from + i + 1;
          return p > FINISH ? 2 * FINISH - p : p;
        });
  if (s.options.barriers)
    for (const p of path)
      if (p < 56) {
        const counts = new Map<number, number>();
        for (const seat of occupancy(s, trackCell(s.turn, p), horse))
          counts.set(seat, (counts.get(seat) ?? 0) + 1);
        if ([...counts.values()].some((n) => n >= 2)) return null;
      }
  return to;
}
export function legalHorses(s: HorsesState): number[] {
  return s.positions[s.turn]!.flatMap((_, horse) =>
    destination(s, horse) === null ? [] : [horse],
  );
}
const legal = (s: HorsesState, id: string): Action[] =>
  s.finished || s.forfeited?.includes(id) || s.players[s.turn] !== id
    ? []
    : s.phase === 'roll'
      ? [{ type: 'roll' }]
      : legalHorses(s).map((horse) => ({ type: 'moveHorse', horse }));
function advance(s: HorsesState) {
  let next = s.turn;
  do {
    next = (next + 1) % s.players.length;
  } while (s.ranking.includes(s.players[next]!) || s.forfeited?.includes(s.players[next]!));
  s.turn = next;
  s.phase = 'roll';
  s.attempts = 0;
  s.consecutiveSix = 0;
  s.lastHorse = null;
}
function moveHorse(s: HorsesState, horse: number): HorsesState {
  const from = s.positions[s.turn]![horse]!,
    to = destination(s, horse);
  assertRule(to !== null);
  const seat = s.turn,
    path =
      from === -1
        ? [-1, 0]
        : [
            from,
            ...Array.from({ length: s.die! }, (_, i) => {
              const p = from + i + 1;
              return p > FINISH ? 2 * FINISH - p : p;
            }),
          ];
  s.positions[seat]![horse] = to;
  s.lastMove = { id: s.moves, player: seat, horse, path };
  s.lastHorse = horse;
  s.attempts = 0;
  if (to < 56) {
    const cell = trackCell(seat, to),
      safe = s.options.safeStarts && cell % 14 === 0;
    if (!safe)
      s.positions.forEach((horses, other) => {
        if (other === seat) return;
        horses.forEach((progress, index) => {
          if (progress >= 0 && progress < 56 && trackCell(other, progress) === cell)
            horses[index] = -1;
        });
      });
  }
  if (s.positions[seat]!.every((p) => p === FINISH)) {
    s.ranking.push(s.players[seat]!);
    const remaining = s.players.filter(
      (id) => !s.ranking.includes(id) && !s.forfeited?.includes(id),
    );
    if (!s.options.fullRanking || remaining.length <= 1) {
      s.finished = true;
      s.ranking = [...s.ranking, ...remaining, ...[...(s.forfeited ?? [])].reverse()];
      return s;
    }
    advance(s);
    return s;
  }
  if (s.die === 6) s.phase = 'roll';
  else advance(s);
  return s;
}
export const courseEcuries = defineEngine<HorsesState, z.infer<typeof horseOptions>, Action>({
  id: 'course-ecuries',
  name: 'Course des Écuries',
  minPlayers: 2,
  maxPlayers: 4,
  defaultOptions: horseOptions.parse({}),
  stateSchema,
  optionsSchema: horseOptions,
  actionSchema,
  createInitialState(players, options) {
    return {
      players,
      turn: 0,
      moves: 0,
      finished: false,
      ranking: [],
      positions: players.map(() => [-1, -1, -1, -1]),
      die: null,
      phase: 'roll',
      attempts: 0,
      consecutiveSix: 0,
      lastHorse: null,
      options,
      lastMove: null,
    };
  },
  getLegalActions: legal,
  applyAction(state, id, action, rng) {
    requireTurn(state, id);
    assertRule(legal(state, id).some((a) => JSON.stringify(a) === JSON.stringify(action)));
    const s = structuredClone(state);
    s.moves++;
    if (action.type === 'moveHorse') return moveHorse(s, action.horse);
    s.lastMove = null;
    s.die = rng.int(6) + 1;
    s.consecutiveSix = s.die === 6 ? s.consecutiveSix + 1 : 0;
    if (s.options.tripleSixPenalty && s.consecutiveSix === 3) {
      if (s.lastHorse !== null) s.positions[s.turn]![s.lastHorse] = -1;
      advance(s);
      return s;
    }
    const horses = legalHorses(s);
    if (!horses.length) {
      const stable = s.positions[s.turn]!.every((p) => p === -1);
      if (stable && s.options.threeAttempts && s.die !== 6 && s.attempts < 2) {
        s.attempts++;
        return s;
      }
      if (s.die === 6) return s;
      advance(s);
      return s;
    }
    s.attempts = 0;
    s.phase = 'choose';
    if (s.options.automaticMove && horses.length === 1) return moveHorse(s, horses[0]!);
    return s;
  },
  getPlayerView(s, id) {
    return {
      ...coreView(s, 'course-ecuries', legal(s, id)),
      positions: s.positions.map((p) => [...p]),
      die: s.die,
      ...(s.lastMove ? { lastMove: { ...s.lastMove, path: [...s.lastMove.path] } } : {}),
    };
  },
  getStatus: status,
  onTimeout: (s, id) => legal(s, id)[0] ?? null,
  bot(s, id, rng: RandomSource) {
    const actions = legal(s, id);
    if (s.phase === 'roll') return actions[0] ?? null;
    const moves = legalHorses(s);
    const exit = moves.find((h) => s.positions[s.turn]![h] === -1);
    if (exit !== undefined) return { type: 'moveHorse', horse: exit };
    const capture = moves.find((h) => {
      const to = destination(s, h)!;
      return (
        to < 56 &&
        !(s.options.safeStarts && trackCell(s.turn, to) % 14 === 0) &&
        occupancy(s, trackCell(s.turn, to), h).some((seat) => seat !== s.turn)
      );
    });
    if (capture !== undefined) return { type: 'moveHorse', horse: capture };
    const ranked = moves
      .map((horse) => ({ horse, progress: s.positions[s.turn]![horse]! }))
      .sort((a, b) => b.progress - a.progress);
    if (ranked.length) return { type: 'moveHorse', horse: ranked[0]!.horse };
    return actions.length ? actions[rng.int(actions.length)]! : null;
  },
  forfeit(s, id) {
    const seat = s.players.indexOf(id);
    s.positions[seat] = [-1, -1, -1, -1];
    if (s.turn === seat) advance(s);
    return s;
  },
});
