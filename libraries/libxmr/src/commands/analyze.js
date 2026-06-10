import { isoDate } from "@forwardimpact/libutil";
import {
  formatHeader,
  formatSection,
  formatTable,
  formatBullet,
} from "@forwardimpact/libcli";

import { analyze, roundStats } from "../analyze.js";
import { renderChart } from "../chart.js";
import { fmt1, round1 } from "../format.js";
import { resolveSlice } from "./slice.js";

/** Read a CSV, optionally filter to a single metric, and print a full report (chart + stats table + signals) in text mode or a stamped JSON object with source path and generation date. */
export function runAnalyzeCommand(ctx) {
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
      error: "analyze requires a <csv-path> argument",
    };
  }
  if (!fsSync.existsSync(csvPath)) {
    return {
      ok: false,
      code: 2,
      error: `cannot read CSV "${csvPath}": file not found`,
    };
  }

  const { eventType, label } = resolveSlice(values["event-type"]);
  const text = fsSync.readFileSync(csvPath, "utf-8");
  const report = analyze(text, { eventType });
  report.source = csvPath;
  report.generated = isoDate(clock.now());
  report.eventType = eventType;
  report.eventTypeLabel = label;

  if (values.metric) {
    report.metrics = report.metrics.filter((m) => m.metric === values.metric);
  }

  if (values.format === "json") {
    proc.stdout.write(JSON.stringify(jsonReport(report), null, 2) + "\n");
  } else {
    proc.stdout.write(formatText(report, { ascii: !!values.ascii }) + "\n");
  }

  return { ok: true };
}

// Strip raw values/dates and round stats for human/agent JSON consumption.
function jsonReport(report) {
  return {
    source: report.source,
    generated: report.generated,
    event_type: report.eventType,
    metrics: report.metrics.map(toJsonMetric),
  };
}

/** Convert an analyzed metric to a JSON-safe object with rounded stats and without raw series data. */
export function toJsonMetric(m) {
  const out = {
    metric: m.metric,
    unit: m.unit,
    n: m.n,
    from: m.from,
    to: m.to,
    status: m.status,
    classification: m.classification,
  };
  if (m.latest) {
    out.latest = {
      date: m.latest.date,
      value: m.latest.value,
      mr: round1(m.latest.mr),
    };
  }
  if (m.stats) out.stats = roundStats(m.stats);
  if (m.signals) out.signals = m.signals;
  return out;
}

function formatText(report, { ascii }) {
  const parts = [
    `event_type: ${report.eventTypeLabel}\n` +
      formatHeader(`XmR Analysis — ${report.source}`),
  ];

  for (const m of report.metrics) {
    const header = `${m.metric} (${m.unit})`;
    const lines = [
      `${m.n} points from ${m.from} to ${m.to}`,
      `Classification: ${m.classification}`,
    ];

    if (m.stats) {
      const display = roundStats(m.stats);
      lines.push("");
      lines.push(renderChart(m.values, m.stats, m.signals, { ascii }));
      lines.push("");

      const rows = [
        ["μ", fmt1(display.mu)],
        ["R", fmt1(display.R)],
        ["σ̂", display.sigmaHat.toFixed(2)],
        ["UPL", fmt1(display.UPL)],
        ["LPL", fmt1(display.LPL)],
        ["+1.5σ̂", fmt1(display.zoneUpper)],
        ["-1.5σ̂", fmt1(display.zoneLower)],
        ["URL", fmt1(display.URL)],
      ];
      lines.push(formatTable(["Statistic", "Value"], rows, { compact: true }));

      lines.push(
        `Latest: ${m.latest.value} on ${m.latest.date} (mR=${fmt1(m.latest.mr)})`,
      );

      const signalLines = formatSignalList(m.signals);
      if (signalLines.length > 0) {
        lines.push("");
        lines.push("Signals:");
        for (const s of signalLines) lines.push(formatBullet(s));
      }
    }

    parts.push(formatSection(header, lines.join("\n")));
  }

  return parts.join("\n\n");
}

function formatSignalList(signals) {
  const out = [];
  for (const s of signals.xRule1) {
    out.push(`X Rule 1 @ slot ${s.slots[0]} — ${s.description}`);
  }
  for (const s of signals.xRule2) {
    out.push(
      `X Rule 2 @ slots ${s.slots[0]}–${s.slots[s.slots.length - 1]} — ${s.description}`,
    );
  }
  for (const s of signals.xRule3) {
    out.push(`X Rule 3 @ slots ${s.slots.join(", ")} — ${s.description}`);
  }
  for (const s of signals.mrRule1) {
    out.push(`mR Rule 1 @ slot ${s.slots[0]} — ${s.description}`);
  }
  return out;
}
