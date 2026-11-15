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
    'ROOM_UNAVAILABLE',
    'NOT_A_PLAYER',
    'PRIVATE_ROOM',
    'ROOM_FULL',
    'HOST_REQUIRED',
    'STALE_STATE',
    'NOT_READY',
    'ALREADY_PLAYING',
    'NOT_YOUR_TURN',
    'ILLEGAL_ACTION',
    'PLAYER_COUNT',
    'ACTION_CONFLICT',
    'TURN_EXPIRED',
  ];
  return (
    <p role="alert" className="feedback error">
      {t(`error_${known.includes(code) ? code : 'INTERNAL_ERROR'}` as TranslationKey)}
    </p>
  );
}
