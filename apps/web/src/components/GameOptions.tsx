import type { TranslationKey } from '../i18n';
import { useT } from '../i18n';
const labels: Record<string, TranslationKey> = {
  roundLimit: 'optionRounds',
  stackDrawTwo: 'optionStack',
  strictWildFour: 'optionStrictFour',
  challengeWildFour: 'optionChallenge',
  pointsMode: 'optionPoints',
  targetScore: 'optionTarget',
  safeStarts: 'optionSafe',
  barriers: 'optionBarriers',
  threeAttempts: 'optionAttempts',
  automaticMove: 'optionAutomatic',
  bounce: 'optionBounce',
  tripleSixPenalty: 'optionTriple',
  fullRanking: 'optionRanking',
  lives: 'optionLives',
  difficulty: 'optionDifficulty',
  preview: 'optionPreview',
};
export function readGameOptions(form: FormData, values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'boolean'
        ? form.get(`option_${key}`) === 'on'
        : typeof value === 'number'
          ? Number(form.get(`option_${key}`))
          : String(form.get(`option_${key}`)),
    ]),
  );
}
export function GameOptions({ values }: { values: Record<string, unknown> }) {
  const t = useT();
  return (
    <>
      {Object.entries(values).map(([key, value]) => (
        <label
          key={`${key}:${String(value)}`}
          className={typeof value === 'boolean' ? 'toggle-row' : ''}
        >
          <span>{t(labels[key] ?? 'gameOptions')}</span>
          {typeof value === 'boolean' ? (
            <input name={`option_${key}`} type="checkbox" defaultChecked={value} />
          ) : key === 'difficulty' ? (
            <select name={`option_${key}`} defaultValue={String(value)}>
              <option value="easy">{t('easy')}</option>
              <option value="hard">{t('hard')}</option>
            </select>
          ) : (
            <input
              name={`option_${key}`}
              type={typeof value === 'number' ? 'number' : 'text'}
              min={key === 'roundLimit' ? 10 : 1}
              max={key === 'roundLimit' ? 100 : 5000}
              required
              defaultValue={String(value)}
            />
          )}
        </label>
      ))}
    </>
  );
}
