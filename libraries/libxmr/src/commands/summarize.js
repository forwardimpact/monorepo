import { isoDate } from "@forwardimpact/libutil";
import { analyze, roundStats } from "../analyze.js";
import { round1 } from "../format.js";

/** Run the summarize command: analyze a CSV and output a condensed summary as markdown or JSON. */
export function runSummarizeCommand(ctx) {
  const {
    options: values,
    args,
    deps: { runtime },
  } = ctx;
  const { fsSync, proc, clock } = runtime;

  const csvPath = args["csv-path"];
  if (!csvPath) {
    return {
      ok: false,
      code: 2,
      error: "summarize requires a <csv-path> argument",
    };
  }
  if (!fsSync.existsSync(csvPath)) {
    return {
      ok: false,
      code: 2,
      error: `cannot read CSV "${csvPath}": file not found`,
    };
  }

  const text = fsSync.readFileSync(csvPath, "utf-8");
  const report = analyze(text);
  report.source = csvPath;
  report.generated = isoDate(clock.now());

  if (values.metric) {
    report.metrics = report.metrics.filter((m) => m.metric === values.metric);
  }

  if (values.format === "json") {
    proc.stdout.write(JSON.stringify(jsonReport(report), null, 2) + "\n");
    return { ok: true };
  }

  proc.stdout.write(renderMarkdown(report) + "\n");
  return { ok: true };
}

// Same `{source, generated, metrics: [...]}` shape as analyze, with each
// metric stripped down to summary-relevant fields. Consumers parsing
// either command get a consistent schema.
/** Build a JSON-serializable summary report with rounded stats and compact signal data. */
export function jsonReport(report) {
  return {
    source: report.source,
    generated: report.generated,
    metrics: report.metrics.map((m) => ({
      metric: m.metric,
      unit: m.unit,
      n: m.n,
      classification: m.classification,
      latest: m.latest
        ? {
            date: m.latest.date,
            value: m.latest.value,
            mr: round1(m.latest.mr),
          }
        : null,
      stats: m.stats ? roundStats(m.stats) : null,
      signals: m.signals ?? null,
    })),
  };
}

/** Render an XmR analysis report as a markdown table with classification and signal counts. */
export function renderMarkdown(report) {
  const sufficient = report.metrics.filter(
    (m) => m.classification !== "insufficient",
  );
  const insufficient = report.metrics.filter(
    (m) => m.classification === "insufficient",
  );

  const lines = [
    `**XmR — \`${report.source}\`** _(generated ${report.generated})_`,
    "",
  ];

  if (sufficient.length === 0 && insufficient.length === 0) {
    lines.push("_No metrics found._");
    return lines.join("\n");
  }

  if (sufficient.length > 0) {
    lines.push(
      "| metric | n | latest | μ | UPL | LPL | classification | signals |",
      "| ------ | - | ------ | - | --- | --- | -------------- | ------- |",
    );
    for (const m of sufficient) {
      const display = roundStats(m.stats);
      lines.push(
        `| ${m.metric} | ${m.n} | ${m.latest.value} | ${display.mu} | ${display.UPL} | ${display.LPL} | ${m.classification} | ${formatSignals(m.signals)} |`,
      );
    }
  }

  if (insufficient.length > 0) {
    if (sufficient.length > 0) lines.push("");
    const parts = insufficient.map((m) => `${m.metric} (n=${m.n})`);
    lines.push(`_Insufficient data (n<15):_ ${parts.join(", ")}.`);
  }

  return lines.join("\n");
}

// Compact signal labels: `R1×k`, `R2×len`, `R3×slots`, `mR1×k`. Each rule
// type gets its own token so the column scans without expanding.
function formatSignals(signals) {
  if (!signals) return "—";
  const tokens = [];
  if (signals.xRule1.length > 0) tokens.push(`R1×${signals.xRule1.length}`);
  for (const s of signals.xRule2) tokens.push(`R2×${s.slots.length}`);
  for (const s of signals.xRule3) tokens.push(`R3×${s.slots.length}`);
  if (signals.mrRule1.length > 0) tokens.push(`mR1×${signals.mrRule1.length}`);
  return tokens.length === 0 ? "—" : tokens.join(" ");
}
