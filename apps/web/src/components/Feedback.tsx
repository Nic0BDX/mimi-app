import { useT, type TranslationKey } from '../i18n';
export function ErrorMessage({ code }: { code: string | null }) {
  const t = useT();
  if (!code) return null;
  const known = [
    'NETWORK_ERROR',
    'VALIDATION_ERROR',
    'INVALID_CREDENTIALS',
    'REGISTRATION_UNAVAILABLE',
    'USERNAME_UNAVAILABLE',
    'AUTH_REQUIRED',
    'CSRF_INVALID',
    'RATE_LIMITED',
    'RESET_INVALID',
    'INTERNAL_ERROR',
    'BAD_REQUEST',
    'SELF_REQUEST',
    'PLAYER_UNAVAILABLE',
    'REQUEST_UNAVAILABLE',
  ];
  return (
    <p role="alert" className="feedback error">
      {t(`error_${known.includes(code) ? code : 'INTERNAL_ERROR'}` as TranslationKey)}
    </p>
  );
}
