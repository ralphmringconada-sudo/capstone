/**
 * Purpose: Shared helpers for inclusive admin date-range filtering.
 * How it works: ISO day strings (YYYY-MM-DD) bound the start/end of each calendar day.
 */

export function toIsoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatIsoDayLabel(isoDay: string): string {
  if (!isoDay) return "";
  const date = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Inclusive range: empty from/to means no bound on that side. */
export function isWithinDateRange(
  value: string | Date | null | undefined,
  fromDay: string,
  toDay: string,
): boolean {
  if (!fromDay && !toDay) return true;
  if (!value) return false;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const time = date.getTime();
  if (fromDay) {
    const start = new Date(`${fromDay}T00:00:00`).getTime();
    if (time < start) return false;
  }
  if (toDay) {
    const end = new Date(`${toDay}T23:59:59.999`).getTime();
    if (time > end) return false;
  }
  return true;
}
