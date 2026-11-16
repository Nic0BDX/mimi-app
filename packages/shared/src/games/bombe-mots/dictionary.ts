import words from './words.json' with { type: 'json' };

// Source: https://github.com/words/an-array-of-french-words (MIT).
// Keep WORDS-LICENSE alongside the vendored list.
export const normalizeWord = (word: string) =>
  word
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('œ', 'oe')
    .replaceAll('æ', 'ae');
export const dictionary = new Set(
  words.map(normalizeWord).filter((word) => /^[a-z]{3,35}$/.test(word)),
);
const candidates = new Map<string, string[]>();
export function wordsFor(sequence: string) {
  let matches = candidates.get(sequence);
  if (!matches) {
    matches = [...dictionary].filter((word) => word.includes(sequence));
    candidates.set(sequence, matches);
  }
  return matches;
}
export const sequences = {
  easy: ['an', 'ar', 'at', 'ch', 'en', 'er', 'in', 'on', 'or', 'ou', 're', 'te'],
  hard: ['ait', 'ant', 'art', 'ble', 'cha', 'che', 'ent', 'eur', 'ion', 'oin', 'our', 'que'],
};
