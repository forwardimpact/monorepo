// Classify a metric report into a coarse process-behavior category.
//
//   insufficient — fewer than MIN_POINTS data points. The code does not
//                  compute limits.
//   chaos        — mR Rule 1 fires. The variation itself is unstable. Every
//                  limit on the X chart stays unreliable until someone
//                  investigates the outsized moves.
//   signals      — at least one X chart rule fires. mR Rule 1 does not fire.
//   stable       — predictable. No rules fire and the series varies.
//   degenerate-zero — predictable. Every observation equals zero. There is
//                  no variation around zero. Predictability is trivial.
//                  The series carries no process signal.
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
