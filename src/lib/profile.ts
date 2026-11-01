// Names and avatars. The keys must match the check list in supabase/migrations/0010_profiles.sql.
export const AVATARS = {
  fox: '🦊', panda: '🐼', koala: '🐨', tiger: '🐯', lion: '🦁', frog: '🐸', monkey: '🐵', rabbit: '🐰',
  bear: '🐻', pig: '🐷', octopus: '🐙', unicorn: '🦄', penguin: '🐧', cat: '🐱', dog: '🐶', owl: '🦉',
} as const;
export type AvatarKey = keyof typeof AVATARS;
export const TONES = 5; // background colours, --tone-0 … --tone-4

export interface Profile { display_name: string; avatar: AvatarKey; tone: number }

/** The chosen name, else the part of the email before @. */
export const displayName = (p: { email: string; display_name?: string | null }) => p.display_name || p.email.split('@')[0];

/** Trimmed, single-spaced name, or null if empty or over 24 characters (the database's limit). */
export function cleanName(s: string): string | null {
  const n = s.trim().replace(/\s+/g, ' ');
  return n.length >= 1 && n.length <= 24 ? n : null;
}
