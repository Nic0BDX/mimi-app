import { expect, it } from 'vitest';
import { fr } from './fr';
import { en } from './en';
it('has matching nonempty French and English dictionaries', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  for (const value of [...Object.values(fr), ...Object.values(en)])
    expect(value.trim().length).toBeGreaterThan(0);
});
