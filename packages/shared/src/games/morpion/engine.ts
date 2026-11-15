import { z } from 'zod';
import {
  coreStateSchema,
  coreView,
  defineEngine,
  requireTurn,
  assertRule,
  status,
  type CoreState,
} from '../../engine/types.js';
const stateSchema = coreStateSchema.extend({
  board: z.array(z.number().int().min(0).max(2)).length(9),
});
const actionSchema = z
  .object({ type: z.literal('place'), cell: z.number().int().min(0).max(8) })
  .strict();
const lines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
type State = z.infer<typeof stateSchema>;
const legal = (s: State, id: string) =>
  s.finished || s.players[s.turn] !== id
    ? []
    : s.board.flatMap((value, cell) => (value === 0 ? [{ type: 'place' as const, cell }] : []));
export const morpion = defineEngine<State, Record<string, never>, z.infer<typeof actionSchema>>({
  id: 'morpion',
  name: 'Morpion',
  minPlayers: 2,
  maxPlayers: 2,
  defaultOptions: {},
  stateSchema,
  optionsSchema: z.object({}).strict(),
  actionSchema,
  createInitialState(players) {
    return {
      players,
      turn: 0,
      moves: 0,
      finished: false,
      ranking: [],
      board: Array<number>(9).fill(0),
    };
  },
  getLegalActions: legal,
  applyAction(s, id, a) {
    requireTurn(s, id);
    assertRule(s.board[a.cell] === 0);
    const board = [...s.board];
    board[a.cell] = s.turn + 1;
    const won = lines.some((line) => line.every((cell) => board[cell] === s.turn + 1)),
      finished = won || board.every(Boolean);
    return {
      ...s,
      board,
      moves: s.moves + 1,
      turn: finished ? s.turn : 1 - s.turn,
      finished,
      ranking: won ? [id, s.players[1 - s.turn]!] : [],
    };
  },
  getPlayerView(s, id) {
    return { ...coreView(s, 'morpion', legal(s, id)), board: [...s.board], columns: 3 };
  },
  getStatus: status,
  onTimeout: (s, id) => legal(s, id)[0] ?? null,
});
export const emptyMorpion = (players: string[]): CoreState =>
  morpion.createInitialState(players, {}, { int: () => 0 });
