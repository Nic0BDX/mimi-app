import { z } from 'zod';

export const gameTypeSchema = z.enum([
  'morpion',
  'puissance-quatre',
  'dames',
  'carte-frenesie',
  'course-ecuries',
  'bombe-mots',
]);
export type GameType = z.infer<typeof gameTypeSchema>;
export interface RandomSource {
  int(maxExclusive: number): number;
}
export function shuffle<T>(values: readonly T[], rng: RandomSource): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
export const coreStateSchema = z.object({
  players: z.array(z.string()).min(2).max(12),
  turn: z.number().int().nonnegative(),
  moves: z.number().int().nonnegative(),
  finished: z.boolean(),
  ranking: z.array(z.string()),
});
export type CoreState = z.infer<typeof coreStateSchema>;
export type EngineStatus = { status: 'playing' | 'finished'; ranking: string[]; draw: boolean };
export class RuleError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const assertRule: (condition: unknown, code?: string) => asserts condition = (
  condition,
  code = 'ILLEGAL_ACTION',
) => {
  if (!condition) throw new RuleError(code);
};
export interface EngineView {
  kind: GameType;
  players: string[];
  turn: string | null;
  finished: boolean;
  ranking: string[];
  legalActions: unknown[];
  board?: number[];
  columns?: number;
  hand?: { id: string; color: string; value: string }[];
  counts?: number[];
  top?: { color: string; value: string };
  color?: string;
  direction?: number;
  pendingDraw?: number;
  lastCardPlayer?: string | null;
  positions?: number[][];
  die?: number | null;
  lives?: number[];
  letters?: string[];
  sequence?: string;
  usedWords?: string[];
  round?: number;
  scores?: number[];
  notice?: string;
}
export interface GameEngine<S extends CoreState, O, A> {
  id: GameType;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  defaultOptions: O;
  stateSchema: z.ZodType<S>;
  optionsSchema: z.ZodType<O>;
  actionSchema: z.ZodType<A>;
  createInitialState(players: string[], options: O, rng: RandomSource): S;
  getLegalActions(state: S, playerId: string): A[];
  applyAction(state: S, playerId: string, action: A, rng: RandomSource): S;
  getPlayerView(state: S, playerId: string): EngineView;
  getStatus(state: S): EngineStatus;
  onTimeout(state: S, playerId: string): A | null;
  bot?(state: S, playerId: string, rng: RandomSource): A | null;
  getTurnSeconds?(state: S): number;
}
export interface RegisteredEngine {
  id: GameType;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  defaultOptions: unknown;
  parseOptions(input: unknown): unknown;
  createInitialState(players: string[], options: unknown, rng: RandomSource): CoreState;
  getLegalActions(state: unknown, id: string): unknown[];
  applyAction(
    state: unknown,
    id: string,
    action: unknown,
    rng: RandomSource,
  ): { ok: true; state: CoreState } | { ok: false; code: string };
  getPlayerView(state: unknown, id: string): EngineView;
  getStatus(state: unknown): EngineStatus;
  onTimeout(state: unknown, id: string): unknown | null;
  bot(state: unknown, id: string, rng: RandomSource): unknown | null;
  getTurnSeconds(state: unknown): number | null;
  parseState(state: unknown): CoreState;
}
export function defineEngine<S extends CoreState, O, A>(
  engine: GameEngine<S, O, A>,
): RegisteredEngine {
  return {
    id: engine.id,
    name: engine.name,
    minPlayers: engine.minPlayers,
    maxPlayers: engine.maxPlayers,
    defaultOptions: engine.defaultOptions,
    parseOptions: (o) => engine.optionsSchema.parse(o),
    parseState: (s) => engine.stateSchema.parse(s),
    createInitialState(players, options, rng) {
      assertRule(
        players.length >= engine.minPlayers &&
          players.length <= engine.maxPlayers &&
          new Set(players).size === players.length,
        'PLAYER_COUNT',
      );
      return engine.createInitialState([...players], engine.optionsSchema.parse(options), rng);
    },
    getLegalActions: (s, id) => engine.getLegalActions(engine.stateSchema.parse(s), id),
    applyAction(s, id, a, rng) {
      try {
        const state = engine.stateSchema.parse(s);
        assertRule(state.players.includes(id) && !state.finished);
        return {
          ok: true,
          state: engine.applyAction(state, id, engine.actionSchema.parse(a), rng),
        };
      } catch (error) {
        return {
          ok: false,
          code:
            error instanceof RuleError
              ? error.code
              : error instanceof z.ZodError
                ? 'VALIDATION_ERROR'
                : 'ENGINE_ERROR',
        };
      }
    },
    getPlayerView(s, id) {
      const state = engine.stateSchema.parse(s);
      assertRule(state.players.includes(id), 'NOT_A_PLAYER');
      return engine.getPlayerView(state, id);
    },
    getStatus: (s) => engine.getStatus(engine.stateSchema.parse(s)),
    onTimeout: (s, id) => engine.onTimeout(engine.stateSchema.parse(s), id),
    bot: (s, id, rng) =>
      engine.bot?.(engine.stateSchema.parse(s), id, rng) ??
      engine.onTimeout(engine.stateSchema.parse(s), id),
    getTurnSeconds: (s) => engine.getTurnSeconds?.(engine.stateSchema.parse(s)) ?? null,
  };
}
export function coreView(state: CoreState, kind: GameType, legalActions: unknown[]): EngineView {
  return {
    kind,
    players: [...state.players],
    turn: state.finished ? null : state.players[state.turn]!,
    finished: state.finished,
    ranking: [...state.ranking],
    legalActions,
  };
}
export function status(state: CoreState): EngineStatus {
  return {
    status: state.finished ? 'finished' : 'playing',
    ranking: [...state.ranking],
    draw: state.finished && state.ranking.length === 0,
  };
}
export function requireTurn(state: CoreState, id: string) {
  assertRule(!state.finished && state.players[state.turn] === id, 'NOT_YOUR_TURN');
}
