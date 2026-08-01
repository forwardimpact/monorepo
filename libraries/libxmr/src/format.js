// Single source of truth for the one-decimal value format. Chart labels,
// signal descriptions, and human-facing report output all use it. Keep
// these consistent so the same value never reads as "1" in one place and
// "1.0" in another.
/** Format a number to one decimal place as a string, e.g. 1 becomes "1.0". */
export function fmt1(n) {
  return (Math.round(n * 10) / 10).toFixed(1);
}

/** Round a number to one decimal place and return a number. */
export function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Round a number to two decimal places and return a number. */
export function round2(n) {
  return Math.round(n * 100) / 100;
}
