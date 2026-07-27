// Deterministic avatar color from a name/email, so the same person always
// gets the same color across the app without needing a stored value.
const PALETTE = [
  "#C13A16", "#8A5A0B", "#2E6B5E", "#3D5A99", "#6B4E9C", "#A13D6B", "#4A7A2E",
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
