import { Link } from 'react-router';
import { useSocial } from '../stores/social';
import { useT } from '../i18n';
import { request } from '../lib/api';
import { useState } from 'react';
import { ErrorMessage } from './Feedback';
export function Notifications() {
  const [error, setError] = useState<string | null>(null);
  const t = useT(),
    { notifications, load } = useSocial();
  return (
    <div className="notification-list">
      <h2>{t('notifications')}</h2>
      <ErrorMessage code={error} />
      {!notifications.length && <p>{t('notificationsEmpty')}</p>}
      {notifications.map((n) => (
        <article className={`notification-row ${n.readAt ? '' : 'unread'}`} key={n.id}>
          <p>
            <strong>{n.payload.actor?.username}</strong>{' '}
            {t(
              n.type === 'FRIEND_REQUEST'
                ? 'notificationRequest'
                : n.type === 'FRIEND_ACCEPTED'
                  ? 'notificationAccepted'
                  : 'notificationInvite',
            )}
          </p>
          <Link
            className="text-link"
            to={
              n.type === 'GAME_INVITATION'
                ? `/games/room/${n.payload.gameId}?invitation=${n.payload.invitationId}`
                : '/friends'
            }
          >
            {t(n.type === 'GAME_INVITATION' ? 'join' : 'friends')}
          </Link>
          {!n.readAt && (
            <button
              className="text-link"
              onClick={() => {
                void request('/notifications/read', {
                  method: 'POST',
                  body: JSON.stringify({ ids: [n.id] }),
                })
                  .then(load)
                  .catch(() => setError('NETWORK_ERROR'));
              }}
            >
              {t('markRead')}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
