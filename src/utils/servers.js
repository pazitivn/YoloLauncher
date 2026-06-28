export const LOGO_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1',
];

export function getStatusColor(tone) {
  switch (tone) {
    case 'good': return 'var(--green)';
    case 'warn': return 'var(--yellow)';
    case 'bad': return 'var(--red)';
    case 'muted': return 'var(--text-muted)';
    default: return 'var(--text-muted)';
  }
}
