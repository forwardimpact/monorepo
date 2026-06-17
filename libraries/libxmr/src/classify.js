// Classify a metric report into a coarse process-behavior category.
//
//   insufficient — fewer than MIN_POINTS data points; limits not computed.
//   chaos        — mR Rule 1 fires; the variation itself is unstable, which
//                  makes every limit on the X chart unreliable until the
//                  outsized moves are investigated.
//   signals      — at least one X chart rule fires (and mR Rule 1 does not).
//   stable       — predictable; no rules fire and the series varies.
//   degenerate-zero — predictable but every observation equals zero: no
//                  variation around zero, so predictability is trivial and the
//                  series carries no process signal.
/** Classify a metric into a process-behavior category: insufficient, chaos, signals, stable, or degenerate-zero. */
export function classify(metric) {
  if (metric.status === "insufficient_data") return "insufficient";
  const s = metric.signals;
  if (!s) return "stable";
  if (s.mrRule1?.length > 0) return "chaos";
  if (s.xRule1?.length > 0 || s.xRule2?.length > 0 || s.xRule3?.length > 0) {
    return "signals";
  }
  if (metric.values?.length > 0 && metric.values.every((v) => v === 0)) {
    return "degenerate-zero";
  }
  return "stable";
}
