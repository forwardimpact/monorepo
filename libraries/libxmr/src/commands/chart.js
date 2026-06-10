import { analyze } from "../analyze.js";
import { renderChart } from "../chart.js";
import { MIN_POINTS } from "../constants.js";
import { resolveSlice } from "./slice.js";

/** Run the chart command: read a CSV, select a metric, and print its XmR control chart to stdout. */
export function runChartCommand(ctx) {
  const {
    options: values,
    args,
    deps: { runtime },
  } = ctx;
  const { fsSync, proc } = runtime;

  const csvPath = args["csv-path"];
  if (!csvPath) {
    return {
      ok: false,
      code: 2,
      error: "chart requires a <csv-path> argument",
    };
  }
  if (values.format === "json") {
    return {
      ok: false,
      code: 2,
      error: "chart does not support --format json",
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

  if (report.metrics.length === 0) {
    return {
      ok: false,
      code: 2,
      error: `no metrics found in "${csvPath}" (event_type: ${label})`,
    };
  }

  // If --metric is given, pick that one. If not given but the CSV carries
  // exactly one metric, use it implicitly — the user couldn't have meant
  // anything else.
  let target;
  if (values.metric) {
    target = report.metrics.find((m) => m.metric === values.metric);
    if (!target) {
      return {
        ok: false,
        code: 2,
        error: `no rows for metric "${values.metric}"`,
      };
    }
  } else if (report.metrics.length === 1) {
    target = report.metrics[0];
  } else {
    const names = report.metrics.map((m) => m.metric).join(", ");
    return {
      ok: false,
      code: 2,
      error: `chart requires --metric when CSV has multiple metrics (found: ${names})`,
    };
  }

  proc.stdout.write(`# event_type: ${label}\n\n`);

  if (target.status === "insufficient_data") {
    proc.stdout.write(
      `Insufficient data: ${target.n} points (need at least ${MIN_POINTS}).\n`,
    );
    return { ok: true };
  }

  const chart = renderChart(target.values, target.stats, target.signals, {
    ascii: !!values.ascii,
  });
  proc.stdout.write(chart + "\n");
  return { ok: true };
}
