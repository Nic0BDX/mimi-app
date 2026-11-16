import { morpion } from '../games/morpion/engine.js';
import { puissanceQuatre } from '../games/puissance-quatre/engine.js';
import { dames } from '../games/dames/engine.js';
import { carteFrenesie } from '../games/carte-frenesie/engine.js';
import { courseEcuries } from '../games/course-ecuries/engine.js';
import { bombeMots } from '../games/bombe-mots/engine.js';
import { meganopoly } from '../games/meganopoly/engine.js';
import type { RegisteredEngine } from './types.js';
export const engines: Record<string, RegisteredEngine> = {
  morpion,
  'puissance-quatre': puissanceQuatre,
  dames,
  'carte-frenesie': carteFrenesie,
  'course-ecuries': courseEcuries,
  'bombe-mots': bombeMots,
  meganopoly,
};
export function getEngine(id: string): RegisteredEngine {
  const engine = engines[id];
  if (!engine) throw new Error('UNKNOWN_GAME');
  return engine;
}
