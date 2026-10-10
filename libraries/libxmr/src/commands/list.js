import { formatHeader, formatTable } from "@forwardimpact/libcli";

import { sliceLabel } from "../format.js";
import { listSliceMetrics } from "../slice.js";
import { withReadGuard } from "./guard.js";

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
  const guarded = withReadGuard(csvPath, () =>
    listSliceMetrics(text, { eventType: values["event-type"] }),
  );
  if (!guarded.ok) return guarded;
  const { metrics, eventType } = guarded.value;
  const label = sliceLabel(eventType);

  if (values.format === "json") {
    proc.stdout.write(
      JSON.stringify(
        { source: csvPath, event_type: eventType, metrics },
        null,
        2,
      ) + "\n",
    );
  } else {
    const header =
      formatHeader(`Metrics — ${csvPath}`) + `\nevent_type: ${label}`;
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
