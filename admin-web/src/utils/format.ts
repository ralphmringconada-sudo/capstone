/**
 * Purpose: Converts a stored timestamp into separate human-readable date and time labels.
 * How it works:
 * 1. The ISO value is parsed with the JavaScript Date API.
 * 2. Invalid values return safe placeholder labels.
 * 3. Valid values use localized month, day, year, hour, and minute formatting.
 * Technologies Used: JavaScript Date and Intl-backed locale formatting.
 * Why this implementation: Central formatting keeps report and account tables consistent.
 */
export function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: '-', time: '-' };

  return {
    date: date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

/**
 * Purpose: Produces the most informative available display name for an app user.
 * How it works:
 * 1. First and last names are joined and surrounding whitespace is removed.
 * 2. Missing names fall back to email, then to a generic User label.
 * Technologies Used: TypeScript string handling.
 * Why this implementation: A deterministic fallback prevents blank identity fields in admin views.
 */
export function getUserDisplayName(user: { firstName?: string; lastName?: string; email?: string }) {
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || user.email || 'User';
}
