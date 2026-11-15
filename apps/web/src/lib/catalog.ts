import { z } from 'zod';
import { gameTypeSchema, type GameType } from '@mimi/shared';
import type { TranslationKey } from '../i18n';
export const catalogSchema = z.object({
  games: z.array(
    z.object({
      id: gameTypeSchema,
      minPlayers: z.number(),
      maxPlayers: z.number(),
      defaultOptions: z.record(z.string(), z.unknown()),
    }),
  ),
});
const names: Record<GameType, TranslationKey> = {
  morpion: 'morpion',
  'puissance-quatre': 'connect',
  dames: 'checkers',
  'carte-frenesie': 'cards',
  'course-ecuries': 'horses',
  'bombe-mots': 'words',
};
export function gameName(id: string): TranslationKey {
  const parsed = gameTypeSchema.safeParse(id);
  return parsed.success ? names[parsed.data] : 'games';
}
