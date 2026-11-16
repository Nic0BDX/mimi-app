import { useEffect, useRef, useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import { useLocation } from 'react-router';
import { usePreferences } from '../stores/preferences';
import { useT } from '../i18n';
import { Ambience } from '../lib/ambience';

export function AudioAmbience() {
  const t = useT();
  const { pathname } = useLocation();
  const scenic = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/settings',
  ].includes(pathname);
  const { sound, music, volume, update } = usePreferences();
  const player = useRef<Ambience | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  async function unlock() {
    try {
      player.current ??= new Ambience();
      await player.current.resume();
      setReady(true);
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }

  useEffect(() => {
    player.current?.configure(volume, music && scenic);
  }, [volume, music, scenic, ready]);

  useEffect(() => {
    function click(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[data-sound-control]')) return;
      if (!target.closest('button:not(:disabled), a[href], [role="button"]')) return;
      const prefs = usePreferences.getState();
      if (prefs.vibration) navigator.vibrate?.(12);
      if (!prefs.sound && !prefs.music) return;
      void unlock().then((ok) => {
        if (ok && usePreferences.getState().sound) player.current?.effect('click');
      });
    }
    function hover(event: PointerEvent) {
      if (event.pointerType !== 'mouse' || !usePreferences.getState().sound) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[data-sound-control]')) return;
      const button = target.closest('button:not(:disabled), a[href]');
      if (button && !(event.relatedTarget instanceof Node && button.contains(event.relatedTarget)))
        player.current?.effect('hover');
    }
    function visibility() {
      if (document.hidden) void player.current?.suspend().catch(() => setFailed(true));
      else if (player.current) void unlock();
    }
    document.addEventListener('click', click);
    document.addEventListener('pointerover', hover);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('visibilitychange', visibility);
      player.current?.close();
      player.current = null;
    };
  }, []);

  if (pathname !== '/settings') return null;
  return (
    <aside
      className="sound-dock panel settings-panel"
      aria-label={t('audioAmbience')}
      data-sound-control
    >
      <h2>{t('audioAmbience')}</h2>
      <button
        type="button"
        className="sound-music button secondary"
        aria-pressed={music && ready}
        onClick={() => {
          if (music && ready) update({ music: false });
          else
            void unlock().then((ok) => {
              if (ok) update({ music: true });
            });
        }}
      >
        <Music2 size={19} aria-hidden="true" />
        <span>{t(music && ready ? 'pauseMusic' : 'enableMusic')}</span>
        <span className={`sound-bars ${music && ready ? 'playing' : ''}`} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      <button
        type="button"
        className="sound-effects button subtle"
        aria-label={t('animationSounds')}
        aria-pressed={sound}
        onClick={() => {
          if (sound) update({ sound: false });
          else
            void unlock().then((ok) => {
              if (ok) {
                update({ sound: true });
                player.current?.effect('click');
              }
            });
        }}
      >
        {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
      </button>
      <label className="sound-volume">
        <span className="sr-only">{t('volume')}</span>
        <input
          aria-label={t('volume')}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(event) => update({ volume: Number(event.target.value) })}
        />
      </label>
      {failed && <p role="status">{t('audioUnavailable')}</p>}
    </aside>
  );
}
