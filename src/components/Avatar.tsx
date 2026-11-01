import { AVATARS, displayName, type AvatarKey } from '../lib/profile';

/** Round outlined avatar: the chosen animal on its colour, or the name's first letter until one is picked. */
export function Avatar({ who, size = 44 }: {
  who: { email: string; display_name?: string | null; avatar?: AvatarKey | null; tone?: number | null };
  size?: number;
}) {
  const emoji = who.avatar ? AVATARS[who.avatar] : null;
  return (
    <span className={`avatar t${who.tone ?? 0}`} style={{ width: size, height: size, fontSize: size * (emoji ? 0.55 : 0.42) }} aria-hidden="true">
      {emoji ?? displayName(who).slice(0, 1).toUpperCase()}
    </span>
  );
}
