import { readFileSync } from "node:fs";
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

/** Render an XmR chart block for a metric by reading its CSV and producing markdown lines. */
export function renderBlock({
  metric,
  csvPath,
  projectRoot,
  fs = { readFileSync },
}) {
  const fullPath = path.resolve(projectRoot, csvPath);
  let csvText;
  try {
    csvText = fs.readFileSync(fullPath, "utf-8");
  } catch {
    throw new BlockRenderError(`csv-not-found: ${csvPath}`);
  }
  const report = analyze(csvText);

  const m = report.metrics.find((entry) => entry.metric === metric);
  if (!m) {
    throw new BlockRenderError(`metric-not-found: ${metric}`);
  }

  const latestValue = m.latest?.value ?? m.values[m.values.length - 1] ?? "—";
  const status = m.status;

  let chartLines;
  if (status === "insufficient_data") {
    chartLines = [
      `Insufficient data: ${m.n} points (need at least ${MIN_POINTS}).`,
    ];
  } else {
    const chartText = renderChart(m.values, m.stats, m.signals);
    chartLines = chartText.split("\n");
  }

  const signalLine = formatSignals(m.signals);

  return [
    `**Latest:** ${latestValue} · **Status:** ${status}`,
    "",
    "```",
    ...chartLines,
    "```",
    "",
    `**Signals:** ${signalLine}`,
  ];
}

function formatSignals(signals) {
  if (!signals) return "—";
  const fired = [];
  for (const rule of ["xRule1", "xRule2", "xRule3", "mrRule1"]) {
    if (signals[rule]?.length > 0) fired.push(rule);
  }
  return fired.length > 0 ? fired.join(", ") : "—";
}
