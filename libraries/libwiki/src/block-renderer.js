import path from "node:path";
import { analyze, renderChart, MIN_POINTS } from "@forwardimpact/libxmr";

/** Error thrown when an XmR block cannot be rendered due to missing CSV or metric. */
export class BlockRenderError extends Error {
  /** Create a BlockRenderError with the given reason string. */
  constructor(reason) {
    super(reason);
    this.name = "BlockRenderError";
  }
}

/**
 * Render an XmR chart block for a metric by reading its CSV and producing
 * markdown lines.
 * @param {{metric: string, csvPath: string, projectRoot: string, fs: object, priorReadAnchor?: string|null}} options
 *   `fs` is the sync filesystem surface (`runtime.fsSync`). `priorReadAnchor`,
 *   when supplied, stamps per-signal provenance surfaced in the Signals line.
 */
export function renderBlock({
  metric,
  csvPath,
  projectRoot,
  fs,
  priorReadAnchor,
}) {
  const fullPath = path.resolve(projectRoot, csvPath);
  let csvText;
  try {
    csvText = fs.readFileSync(fullPath, "utf-8");
  } catch {
    throw new BlockRenderError(`csv-not-found: ${csvPath}`);
  }
  const report = analyze(csvText, { priorReadAnchor });

  const m = report.metrics.find((entry) => entry.metric === metric);
  if (!m) {
    throw new BlockRenderError(`metric-not-found: ${metric}`);
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
