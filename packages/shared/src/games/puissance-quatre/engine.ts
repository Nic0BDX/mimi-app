import { z } from 'zod';
import {
  coreStateSchema,
  coreView,
  defineEngine,
  requireTurn,
  assertRule,
  status,
} from '../../engine/types.js';
const stateSchema = coreStateSchema.extend({
    board: z.array(z.number().int().min(0).max(2)).length(42),
  }),
  actionSchema = z
    .object({ type: z.literal('drop'), column: z.number().int().min(0).max(6) })
    .strict();
type State = z.infer<typeof stateSchema>;
const legal = (s: State, id: string) =>
  s.finished || s.players[s.turn] !== id
    ? []
    : Array.from({ length: 7 }, (_, column) => ({ type: 'drop' as const, column })).filter(
        (a) => s.board[a.column] === 0,
      );
export function wonFour(board: number[], cell: number, piece: number) {
  const x = cell % 7,
    y = Math.floor(cell / 7);
  return [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ].some(([dx, dy]) => {
    let count = 1;
    for (const sign of [-1, 1])
      for (let step = 1; step <= 3; step++) {
        const nx = x + dx! * step * sign,
          ny = y + dy! * step * sign;
        if (nx < 0 || nx >= 7 || ny < 0 || ny >= 6 || board[ny * 7 + nx] !== piece) break;
        count++;
      }
    return count >= 4;
  });
}
export const puissanceQuatre = defineEngine<
  State,
  Record<string, never>,
  z.infer<typeof actionSchema>
>({
  id: 'puissance-quatre',
  name: 'Puissance 4',
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
      board: Array<number>(42).fill(0),
    };
  },
  getLegalActions: legal,
  applyAction(s, id, a) {
    requireTurn(s, id);
    assertRule(s.board[a.column] === 0);
    const board = [...s.board];
    let row = 5;
    while (row > 0 && board[row * 7 + a.column] !== 0) row--;
    const cell = row * 7 + a.column;
    board[cell] = s.turn + 1;
    const won = wonFour(board, cell, s.turn + 1),
      finished = won || board.every(Boolean);
    return {
      ...s,
      board,
      moves: s.moves + 1,
      finished,
      turn: finished ? s.turn : 1 - s.turn,
      ranking: won ? [id, s.players[1 - s.turn]!] : [],
    };
  },
  getPlayerView(s, id) {
    return { ...coreView(s, 'puissance-quatre', legal(s, id)), board: [...s.board], columns: 7 };
  },
  getStatus: status,
  onTimeout: (s, id) => legal(s, id)[0] ?? null,
});
