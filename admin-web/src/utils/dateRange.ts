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

function toComparableDay(value: string | Date | { toDate?: () => Date } | null | undefined): string | null {
  if (!value) return null;

  // Firestore Timestamp-like objects
  if (typeof value === "object" && !(value instanceof Date) && typeof value.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : toIsoDay(date);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toIsoDay(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    // Plain calendar day from the date picker — use as-is.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    // ISO timestamps: convert to the admin's local calendar day (not UTC slice),
    // so a PH evening report is not filtered out of "today".
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : toIsoDay(date);
  }

  return null;
}

/** Inclusive range: empty from/to means no bound on that side. */
export function isWithinDateRange(
  value: string | Date | { toDate?: () => Date } | null | undefined,
  fromDay: string,
  toDay: string,
): boolean {
  if (!fromDay && !toDay) return true;
  const day = toComparableDay(value);
  if (!day) return false;

  if (fromDay && day < fromDay) return false;
  if (toDay && day > toDay) return false;
  return true;
}
