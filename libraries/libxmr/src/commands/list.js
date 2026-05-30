import { formatHeader, formatTable } from "@forwardimpact/libcli";

import { listMetrics } from "../csv.js";

/** Run the list command: read a CSV and display all metrics with their point counts and date ranges. */
export function runListCommand(ctx) {
  const {
    options: values,
    args,
    deps: { runtime },
  } = ctx;
  const { fsSync, proc } = runtime;

  const csvPath = args["csv-path"];
  if (!csvPath) {
    return { ok: false, code: 2, error: "list requires a <csv-path> argument" };
  }
  if (!fsSync.existsSync(csvPath)) {
    return {
      ok: false,
      code: 2,
      error: `cannot read CSV "${csvPath}": file not found`,
    };
  }

  const text = fsSync.readFileSync(csvPath, "utf-8");
  const metrics = listMetrics(text);

  if (values.format === "json") {
    proc.stdout.write(
      JSON.stringify({ source: csvPath, metrics }, null, 2) + "\n",
    );
  } else {
    const header = formatHeader(`Metrics — ${csvPath}`);
    const rows = metrics.map((m) => [
      m.metric,
      m.unit,
      String(m.n),
      m.from,
      m.to,
    ]);
    const table = formatTable(["Metric", "Unit", "Points", "From", "To"], rows);
    proc.stdout.write(header + "\n\n" + table + "\n");
  }

  return { ok: true };
}
