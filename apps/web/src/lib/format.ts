const dtf = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return dtf.format(typeof d === 'string' ? new Date(d) : d);
}

export function timeAgo(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return 'never';
  const date = typeof d === 'string' ? new Date(d) : d;
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return formatDateTime(date);
}
