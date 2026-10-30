/** Invite codes are read aloud or pasted; drop whitespace only (every letter, including s, can be in a code). */
export const cleanInviteCode = (s: string) => s.replace(/\s/g, '');
