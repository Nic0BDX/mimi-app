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
const stateSchema = coreStateSchema.extend({
  board: z.array(z.number().int().min(0).max(4)).length(100),
  quiet: z.number().int().nonnegative(),
  history: z.array(z.string()),
  endgameRemaining: z.number().int().nullable(),
});
const actionSchema = z
  .object({
    type: z.literal('move'),
    from: z.number().int().min(0).max(99),
    path: z.array(z.number().int().min(0).max(99)).min(1).max(20),
  })
  .strict();
type State = z.infer<typeof stateSchema>;
type Action = z.infer<typeof actionSchema>;
type Capture = Action & { captures: number[] };
const directions = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;
const side = (piece: number) =>
  piece === 1 || piece === 3 ? 0 : piece === 2 || piece === 4 ? 1 : -1;
const at = (x: number, y: number) => (x >= 0 && x < 10 && y >= 0 && y < 10 ? y * 10 + x : -1);
function capturesFrom(
  board: number[],
  from: number,
  piece: number,
  path: number[] = [],
  taken: number[] = [],
): Capture[] {
  const current = path.at(-1) ?? from,
    x = current % 10,
    y = Math.floor(current / 10),
    next: Capture[] = [];
  for (const [dx, dy] of directions) {
    let distance = 1,
      target = at(x + dx, y + dy);
    if (piece >= 3) {
      while (target >= 0 && board[target] === 0) {
        distance++;
        target = at(x + dx * distance, y + dy * distance);
      }
    }
    if (
      target < 0 ||
      !board[target] ||
      side(board[target]!) === side(piece) ||
      taken.includes(target)
    )
      continue;
    let landing = at(x + dx * (distance + 1), y + dy * (distance + 1));
    while (landing >= 0 && board[landing] === 0) {
      const moved = [...board];
      moved[current] = 0;
      moved[landing] = piece;
      const route = [...path, landing],
        captured = [...taken, target],
        continuation = capturesFrom(moved, from, piece, route, captured);
      if (continuation.length) next.push(...continuation);
      else next.push({ type: 'move', from, path: route, captures: captured });
      if (piece < 3) break;
      distance++;
      landing = at(x + dx * (distance + 1), y + dy * (distance + 1));
    }
  }
  return next;
}
export function legalDraughts(state: State): Capture[] {
  const captures: Capture[] = [];
  for (let from = 0; from < 100; from++)
    if (side(state.board[from]!) === state.turn)
      captures.push(...capturesFrom(state.board, from, state.board[from]!));
  if (captures.length) {
    const maximum = Math.max(...captures.map((a) => a.captures.length));
    return captures.filter((a) => a.captures.length === maximum);
  }
  const moves: Capture[] = [];
  for (let from = 0; from < 100; from++) {
    const piece = state.board[from]!;
    if (side(piece) !== state.turn) continue;
    for (const [dx, dy] of directions) {
      if (piece < 3 && dy !== (state.turn === 0 ? -1 : 1)) continue;
      let step = 1,
        landing = at((from % 10) + dx, Math.floor(from / 10) + dy);
      while (landing >= 0 && state.board[landing] === 0) {
        moves.push({ type: 'move', from, path: [landing], captures: [] });
        if (piece < 3) break;
        step++;
        landing = at((from % 10) + dx * step, Math.floor(from / 10) + dy * step);
      }
    }
  }
  return moves;
}
const legal = (s: State, id: string): Action[] =>
  s.finished || s.players[s.turn] !== id
    ? []
    : legalDraughts(s).map(({ type, from, path }) => ({ type, from, path: [...path] }));
function drawLimit(board: number[]) {
  const groups = [board.filter((v) => side(v) === 0), board.filter((v) => side(v) === 1)];
  for (let i = 0; i < 2; i++) {
    const one = groups[i]!,
      other = groups[1 - i]!;
    if (one.length === 1 && one[0]! >= 3 && other.some((p) => p >= 3)) {
      if (other.length <= 2) return 10;
      if (other.length === 3) return 32;
    }
  }
  return null;
}
export const dames = defineEngine<State, Record<string, never>, Action>({
  id: 'dames',
  name: 'Dames',
  minPlayers: 2,
  maxPlayers: 2,
  defaultOptions: {},
  stateSchema,
  optionsSchema: z.object({}).strict(),
  actionSchema,
  createInitialState(players) {
    const board = Array<number>(100).fill(0);
    for (let i = 0; i < 100; i++)
      if (((i % 10) + Math.floor(i / 10)) % 2 === 1) {
        if (i < 40) board[i] = 2;
        if (i >= 60) board[i] = 1;
      }
    return {
      players,
      turn: 0,
      moves: 0,
      finished: false,
      ranking: [],
      board,
      quiet: 0,
      history: [board.join('') + ':0'],
      endgameRemaining: null,
    };
  },
  getLegalActions: legal,
  applyAction(s, id, a) {
    requireTurn(s, id);
    const move = legalDraughts(s).find(
      (m) =>
        m.from === a.from &&
        m.path.length === a.path.length &&
        m.path.every((cell, i) => cell === a.path[i]),
    );
    assertRule(move);
    const board = [...s.board],
      piece = board[a.from]!,
      last = move.path.at(-1)!;
    board[a.from] = 0;
    for (const cell of move.captures) board[cell] = 0;
    board[last] = piece;
    if (piece === 1 && last < 10) board[last] = 3;
    if (piece === 2 && last >= 90) board[last] = 4;
    const turn = 1 - s.turn,
      quiet = piece >= 3 && !move.captures.length ? s.quiet + 1 : 0,
      signature = board.join('') + ':' + turn,
      history = [...s.history, signature].slice(-101),
      limit = drawLimit(board);
    const endgameRemaining =
      limit === null
        ? null
        : Math.min(limit, s.endgameRemaining === null ? limit : s.endgameRemaining - 1);
    const next: State = { ...s, board, turn, moves: s.moves + 1, quiet, history, endgameRemaining };
    const won = !board.some((p) => side(p) === turn) || legalDraughts(next).length === 0,
      draw =
        !won &&
        (quiet >= 50 ||
          history.filter((h) => h === signature).length >= 3 ||
          endgameRemaining === 0);
    return { ...next, finished: won || draw, ranking: won ? [id, s.players[turn]!] : [] };
  },
  getPlayerView(s, id) {
    return { ...coreView(s, 'dames', legal(s, id)), board: [...s.board], columns: 10 };
  },
  getStatus: status,
  onTimeout: (s, id) => legal(s, id)[0] ?? null,
  bot(s, id, rng: RandomSource) {
    const actions = legal(s, id);
    if (!actions.length) return null;
    const men = actions.filter((a) => s.board[a.from]! < 3);
    const pool = men.length ? men : actions;
    return pool[rng.int(pool.length)]!;
  },
});
