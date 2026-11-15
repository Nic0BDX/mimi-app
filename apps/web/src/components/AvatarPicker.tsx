import { avatarIdSchema } from '@mimi/shared';
import { useT } from '../i18n';
export function AvatarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  return (
    <fieldset className="avatar-picker">
      <legend>{t('chooseAvatar')}</legend>
      <div className="avatar-grid">
        {avatarIdSchema.options.map((id, index) => (
          <label className={`avatar-option ${value === id ? 'selected' : ''}`} key={id}>
            <input
              type="radio"
              name="avatar"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
              aria-label={`${t('avatar')} ${index + 1}`}
            />
            <img src={`/avatars/${id}.svg`} alt="" width="52" height="52" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
