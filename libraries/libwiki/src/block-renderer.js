import path from "node:path";
import {
  analyzeSlice,
  formatTally,
  renderChart,
  sliceLabel,
  MIN_POINTS,
  SliceResolutionError,
} from "@forwardimpact/libxmr";
import { XMR_TOKEN_REASONS, XMR_TOKENS } from "./constants.js";

const KNOWN_TOKENS = `Known tokens: ${Object.entries(XMR_TOKENS)
  .map(([key, { placeholder }]) => `\`${key}=${placeholder}\``)
  .join(", ")}.`;
const SLICE_HINT = `Set \`event_type=${XMR_TOKENS.event_type.placeholder}\` on the marker, or \`event_type=*\` for all rows.`;
const TOKEN_CAUSE = Object.freeze({
  [XMR_TOKEN_REASONS.unknown]: (e) =>
    `Unknown marker token \`${e.key}=${e.value}\`.`,
  [XMR_TOKEN_REASONS.repeated]: (e) => `Repeated marker token \`${e.key}\`.`,
  [XMR_TOKEN_REASONS.unusable]: (e) =>
    `Unusable value for \`${e.key}=${e.value}\`.`,
});
// The scanner is the only producer of tokenErrors and writes exactly these
// three reasons, so the lookup needs no fallback.
const tokenCause = (e) => TOKEN_CAUSE[e.reason](e);
const notice = (cause, detail) => [
  `> **XmR block not rendered.** ${cause}`,
  `> ${detail}`,
];

/**
 * Render an XmR chart block for a metric. Read its CSV and produce the
 * markdown lines. Every render failure except a corrupt CSV returns notice
 * lines that name the cause inside the block: a marker token the renderer
 * cannot honour, a file it cannot read, a slice it cannot resolve, or a
 * metric with no rows in the resolved slice. A `CSVIntegrityError`
 * propagates: a conflict-marker CSV is not one block's failure.
 * @param {{metric: string, csvPath: string, projectRoot: string, fs: object, eventType?: string|null, priorReadAnchor?: string|null, tokenErrors?: Array<{key: string, value: string, reason: string}>}} options
 *   `fs` is the sync filesystem surface (`runtime.fsSync`). `eventType` is the
 *   marker's slice; without one the read resolves against the file (the sole
 *   value, or a notice). `priorReadAnchor` stamps per-signal provenance when
 *   the caller supplies it. The Signals line surfaces that provenance.
 */
export function renderBlock({
  metric,
  csvPath,
  projectRoot,
  fs,
  eventType,
  priorReadAnchor,
  tokenErrors = [],
}) {
  if (tokenErrors.length > 0) {
    return notice(tokenErrors.map(tokenCause).join(" "), KNOWN_TOKENS);
  }
  const fullPath = path.resolve(projectRoot, csvPath);
  let csvText;
  try {
    csvText = fs.readFileSync(fullPath, "utf-8");
  } catch {
    return notice(
      `Could not read \`${csvPath}\`.`,
      "The marker names a file this wiki cannot read.",
    );
  }
  let report;
  try {
    report = analyzeSlice(csvText, { eventType, priorReadAnchor });
  } catch (err) {
    if (!(err instanceof SliceResolutionError)) throw err;
    return notice(`Slice not resolved: ${err.message}.`, SLICE_HINT);
  }

  const m = report.metrics.find((entry) => entry.metric === metric);
  if (!m) {
    return notice(
      `No rows for metric \`${metric}\` in slice \`${sliceLabel(report.eventType)}\`.`,
      report.tally.total === 0
        ? "The file holds no rows."
        : `Values present: ${formatTally(report.tally)}.`,
    );
  }

  let chartLines;
  if (m.status === "insufficient_data") {
    chartLines = [
      `Insufficient data: ${m.n} points (need at least ${MIN_POINTS}).`,
    ];
  } else {
    const chartText = renderChart(m.values, m.stats, m.signals);
    chartLines = chartText.split("\n");
  }

  return [
    "```",
    ...chartLines,
    "```",
    "",
    `**Signals:** ${formatSignals(m.signals)}`,
  ];
}

// Annotate each fired rule with its records' provenance when present, so a
// storyboard reader distinguishes recomputation-revealed signals from
// new-point signals at the cell. Without a prior-read anchor, provenance is
// absent and the line renders bare rule names exactly as before.
function formatSignals(signals) {
  if (!signals) return "—";
  const fired = [];
  for (const rule of ["xRule1", "xRule2", "xRule3", "mrRule1"]) {
    const recs = signals[rule];
    if (!recs?.length) continue;
    const tags = [...new Set(recs.map((r) => r.provenance).filter(Boolean))];
    fired.push(tags.length ? `${rule} (${tags.join(", ")})` : rule);
  }
  return fired.length > 0 ? fired.join(", ") : "—";
}
