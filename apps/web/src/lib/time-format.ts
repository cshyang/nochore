export function formatDuration(start: string | undefined, end: string | undefined): string {
  if (!start || !end) return "";
  const seconds = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
