/**
 * Shared time formatting for libtelemetry. Kept in one place so `logger.js`
 * and `visualizer.js` share a single, tested implementation.
 */

/**
 * Converts milliseconds since Unix epoch to an ISO 8601 string (UTC)
 * without constructing a `new Date` object (ambient-dep smell avoidance).
 * Matches `new Date(ms).toISOString()` for ms ≥ 0 (every value
 * `clock.now()` returns); negative (pre-epoch) inputs clamp to the epoch.
 * @param {number} ms - Milliseconds since epoch (non-negative)
 * @returns {string} ISO 8601 timestamp, e.g. "2024-04-29T18:52:58.114Z"
 */
export function msToIso(ms) {
  const p = (n, w = 2) => String(Math.floor(n)).padStart(w, "0");
  const totalMs = Math.floor(Math.max(0, ms));
  const millis = p(totalMs % 1000, 3);
  let s = Math.floor(totalMs / 1000);
  const sec = p(s % 60);
  s = Math.floor(s / 60);
  const min = p(s % 60);
  s = Math.floor(s / 60);
  const hour = p(s % 24);
  let days = Math.floor(s / 24); // days since 1970-01-01

  let year = 1970;
  for (;;) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const diy = leap ? 366 : 365;
    if (days < diy) break;
    days -= diy;
    year += 1;
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const mdays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let month = 0;
  while (days >= mdays[month]) {
    days -= mdays[month];
    month += 1;
  }
  return `${year}-${p(month + 1)}-${p(days + 1)}T${hour}:${min}:${sec}.${millis}Z`;
}
