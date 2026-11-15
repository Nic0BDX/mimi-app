import { create } from 'zustand';
import { z } from 'zod';
import { languageSchema, type Language } from '@mimi/shared';

const schema = z.object({
  language: languageSchema,
  sound: z.boolean(),
  volume: z.number().min(0).max(1),
  vibration: z.boolean(),
});
const defaults = { language: 'fr' as Language, sound: false, volume: 0.5, vibration: false };
function read() {
  try {
    return schema.parse(JSON.parse(localStorage.getItem('mimi_preferences') ?? 'null'));
  } catch {
    return defaults;
  }
}
interface Preferences extends z.infer<typeof schema> {
  update: (patch: Partial<z.infer<typeof schema>>) => void;
}
export const usePreferences = create<Preferences>((set, get) => ({
  ...read(),
  update(patch) {
    const value = schema.parse({ ...get(), ...patch });
    try {
      localStorage.setItem('mimi_preferences', JSON.stringify(value));
    } catch {
      /* Preferences remain usable without storage. No account data is stored here. */
    }
    set(value);
  },
}));
