import { morpion } from '../games/morpion/engine.js';
import { puissanceQuatre } from '../games/puissance-quatre/engine.js';
import type { RegisteredEngine } from './types.js';
export const engines: Record<string, RegisteredEngine> = {
  morpion,
  'puissance-quatre': puissanceQuatre,
};
export function getEngine(id: string): RegisteredEngine {
  const engine = engines[id];
  if (!engine) throw new Error('UNKNOWN_GAME');
  return engine;
}
