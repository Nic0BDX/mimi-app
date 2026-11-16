import { z } from 'zod';
import {
  assertRule,
  coreStateSchema,
  coreView,
  defineEngine,
  requireTurn,
  status,
  type RandomSource,
} from '../../engine/types.js';
import { dictionary, normalizeWord, sequences, wordsFor } from './dictionary.js';

export const wordOptions = z
  .object({
    lives: z.number().int().min(1).max(5).default(3),
    difficulty: z.enum(['easy', 'hard']).default('easy'),
  })
  .strict();
const stateSchema = coreStateSchema.extend({
  lives: z.array(z.number().int().min(0).max(5)),
  letters: z.array(z.string()),
  sequence: z.string(),
  usedWords: z.array(z.string()),
  eliminated: z.array(z.string()),
  options: wordOptions,
});
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('word'), word: z.string().min(3).max(35) }).strict(),
  z.object({ type: z.literal('explode') }).strict(),
]);
export type WordsState = z.infer<typeof stateSchema>;
type Action = z.infer<typeof actionSchema>;
function alive(s: WordsState, seat: number) {
  return s.lives[seat]! > 0 && !s.forfeited?.includes(s.players[seat]!);
}
function advance(s: WordsState, rng: RandomSource) {
  const survivors = s.players.filter((_, seat) => alive(s, seat));
  if (survivors.length <= 1) {
    s.finished = true;
    s.ranking = [...survivors, ...s.eliminated.slice().reverse()];
    return s;
  }
  do {
    s.turn = (s.turn + 1) % s.players.length;
  } while (!alive(s, s.turn));
  const pool = sequences[s.options.difficulty];
  s.sequence = pool[rng.int(pool.length)]!;
  return s;
}
const legal = (s: WordsState, id: string): Action[] =>
  s.finished || s.players[s.turn] !== id ? [] : [{ type: 'explode' }];
export const bombeMots = defineEngine<WordsState, z.infer<typeof wordOptions>, Action>({
  id: 'bombe-mots',
  name: 'Mot Mystère',
  minPlayers: 2,
  maxPlayers: 6,
  defaultOptions: wordOptions.parse({}),
  optionsSchema: wordOptions,
  stateSchema,
  actionSchema,
  createInitialState(players, options, rng) {
    const pool = sequences[options.difficulty];
    return {
      players,
      turn: 0,
      moves: 0,
      finished: false,
      ranking: [],
      lives: players.map(() => options.lives),
      letters: players.map(() => ''),
      sequence: pool[rng.int(pool.length)]!,
      usedWords: [],
      eliminated: [],
      options,
    };
  },
  getLegalActions: legal,
  applyAction(state, id, action, rng) {
    requireTurn(state, id);
    const s = structuredClone(state);
    if (action.type === 'word') {
      const word = normalizeWord(action.word);
      assertRule(dictionary.has(word), 'WORD_UNKNOWN');
      assertRule(word.includes(s.sequence), 'WORD_SEQUENCE');
      assertRule(!s.usedWords.includes(word), 'WORD_USED');
      s.usedWords.push(word);
      const letters = new Set(s.letters[s.turn]! + word);
      if (letters.size === 26) {
        s.lives[s.turn] = Math.min(5, s.lives[s.turn]! + 1);
        s.letters[s.turn] = '';
      } else s.letters[s.turn] = [...letters].sort().join('');
    } else {
      s.lives[s.turn]!--;
      if (s.lives[s.turn] === 0) s.eliminated.push(id);
    }
    s.moves++;
    return advance(s, rng);
  },
  getPlayerView(s, id) {
    return {
      ...coreView(s, 'bombe-mots', legal(s, id)),
      lives: [...s.lives],
      letters: [...(s.letters[s.players.indexOf(id)] ?? '')],
      sequence: s.sequence,
      usedWords: [...s.usedWords],
    };
  },
  getStatus: status,
  onTimeout: (s, id) => legal(s, id)[0] ?? null,
  getTurnSeconds: (s) => (s.options.difficulty === 'hard' ? 10 : 15),
  bot(s, id, rng) {
    if (!legal(s, id).length) return null;
    if (rng.int(4) === 0) return { type: 'explode' };
    const used = new Set(s.usedWords);
    const word = wordsFor(s.sequence).find((word) => !used.has(word));
    return word ? { type: 'word', word } : { type: 'explode' };
  },
  forfeit(state, id, rng) {
    const s = structuredClone(state);
    s.lives[s.players.indexOf(id)] = 0;
    if (!s.eliminated.includes(id)) s.eliminated.push(id);
    const current = s.turn;
    if (s.players[current] === id || s.players.filter((_, seat) => alive(s, seat)).length <= 1)
      return advance(s, rng);
    return s;
  },
});
