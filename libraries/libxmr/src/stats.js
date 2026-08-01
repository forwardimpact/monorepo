import { d2, E2, D4, ZONE_SIGMAS } from "./constants.js";

// Compute Wheeler/Vacanti XmR statistics for an individuals chart.
//
// Returns the centerlines, σ̂ estimate, natural process limits, the upper
// range limit, the inner-zone boundaries (μ ± 1.5σ̂), and the moving-range
// series. The code does NOT clip LPL to zero. See Wheeler §"Lower limits below
// zero are real signals that the process distribution lives near a hard
// floor; clipping silently moves the limit and suppresses lower-tail
// breaches."
/** Compute XmR statistics: mean, moving ranges, process limits, and zone boundaries. */
export function computeXmR(values) {
  const n = values.length;
  if (n === 0) {
    throw new Error("computeXmR requires at least one value");
  }

  const mu = values.reduce((a, b) => a + b, 0) / n;

  const mrs = [];
  for (let i = 1; i < n; i++) {
    mrs.push(Math.abs(values[i] - values[i - 1]));
  }
  const R = mrs.length > 0 ? mrs.reduce((a, b) => a + b, 0) / mrs.length : 0;

  const sigmaHat = R / d2;

  return {
    mu,
    R,
    sigmaHat,
    UPL: mu + E2 * R,
    LPL: mu - E2 * R,
    URL: D4 * R,
    zoneUpper: mu + ZONE_SIGMAS * sigmaHat,
    zoneLower: mu - ZONE_SIGMAS * sigmaHat,
    mrs,
  };
}
