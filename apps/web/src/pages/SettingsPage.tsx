import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Download, Save, Trash2, Volume2 } from 'lucide-react';
import { z } from 'zod';
import { publicUserSchema, profileSchema } from '@mimi/shared';
import { useAuth } from '../stores/auth';
import { usePreferences } from '../stores/preferences';
import { useT } from '../i18n';
import { request, clearCsrf, ApiError } from '../lib/api';
import { AvatarPicker } from '../components/AvatarPicker';
import { ErrorMessage } from '../components/Feedback';

export function SettingsPage() {
  const t = useT(),
    user = useAuth((s) => s.user),
    setUser = useAuth((s) => s.setUser),
    navigate = useNavigate(),
    prefs = usePreferences();
  const [avatarId, setAvatarId] = useState<string>(user?.avatarId ?? 'comet'),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [deleting, setDeleting] = useState(false);
  if (!user) return null;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = profileSchema.safeParse({
        username: new FormData(event.currentTarget).get('username'),
        avatarId,
      });
      if (!result.success) throw new ApiError('VALIDATION_ERROR');
      const data = z
        .object({ user: publicUserSchema })
        .parse(await request('/me', { method: 'PATCH', body: JSON.stringify(result.data) }));
      setUser(data.user);
      setSaved(true);
    } catch (error) {
      setError(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request('/me', {
        method: 'DELETE',
        body: JSON.stringify({ password: new FormData(event.currentTarget).get('password') }),
      });
      setUser(null);
      clearCsrf();
      navigate('/login', { replace: true });
    } catch (error) {
      setError(error instanceof ApiError ? error.code : 'INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-heading">
        <h1>{t('settingsTitle')}</h1>
      </header>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <h2>{t('accountSection')}</h2>
          <form
            onSubmit={(event) => {
              void save(event);
            }}
          >
            <label>
              {t('username')}
              <input
                name="username"
                defaultValue={user.username}
                required
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_\-]+"
              />
            </label>
            <AvatarPicker value={avatarId} onChange={setAvatarId} />
            {saved && (
              <p role="status" className="feedback success">
                {t('saved')}
              </p>
            )}
            <button disabled={busy} className="button primary">
              <Save size={17} />
              {t(busy ? 'loading' : 'save')}
            </button>
          </form>
        </section>
        <div>
          <section className="panel settings-panel">
            <h2>{t('preferences')}</h2>
            <label>
              {t('language')}
              <select
                value={prefs.language}
                onChange={(e) => prefs.update({ language: e.target.value === 'en' ? 'en' : 'fr' })}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="toggle-row">
              <span>
                <Volume2 size={18} />
                {t('sound')}
              </span>
              <input
                type="checkbox"
                checked={prefs.sound}
                onChange={(e) => prefs.update({ sound: e.target.checked })}
              />
            </label>
            <label>
              {t('volume')}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={prefs.volume}
                onChange={(e) => prefs.update({ volume: Number(e.target.value) })}
              />
            </label>
            <label className="toggle-row">
              <span>{t('vibration')}</span>
              <input
                type="checkbox"
                checked={prefs.vibration}
                onChange={(e) => prefs.update({ vibration: e.target.checked })}
              />
            </label>
            <p className="muted small">{t('soundsHint')}</p>
            <button
              className="button secondary full"
              onClick={() => {
                alert(
                  t(/iPad|iPhone|iPod/.test(navigator.userAgent) ? 'installIos' : 'installOther'),
                );
              }}
            >
              <Download size={17} />
              {t('install')}
            </button>
          </section>
          <section className="panel settings-panel danger-zone">
            <h2>{t('danger')}</h2>
            <p>{t('dangerText')}</p>
            {!deleting ? (
              <button className="button danger-button" onClick={() => setDeleting(true)}>
                <Trash2 size={16} />
                {t('danger')}
              </button>
            ) : (
              <form
                onSubmit={(event) => {
                  void remove(event);
                }}
              >
                <label>
                  {t('confirmDelete')}
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    autoFocus
                  />
                </label>
                <div className="button-row">
                  <button className="button danger-button" disabled={busy}>
                    {t('deleteButton')}
                  </button>
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => setDeleting(false)}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
      <ErrorMessage code={error} />
    </>
  );
}
