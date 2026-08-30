/**
 * Format an RFC 3339 / ISO 8601 timestamp for display in the browser's local
 * timezone as `YYYY-MM-DD HH:mm:ss`. Returns `undefined` when there is nothing
 * valid to show (empty / unparseable — never the `'Invalid date'` sentinel).
 */
export function formatChangeTime(iso: string | undefined): string | undefined {
  if (iso === undefined || iso.length === 0) {
    return undefined;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
