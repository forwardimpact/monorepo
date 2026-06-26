import path from "node:path";
import { isoDate } from "@forwardimpact/libutil";
import { analyze } from "../analyze.js";
import { HEADER } from "../constants.js";
import {
  formatRouteContext,
  isKnownRoute,
  ROUTE_BEARING_METRICS,
} from "../routes.js";

const csvField = (v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function parseRecordOptions(values, runtime) {
  const skill = values.skill || runtime.proc.env.LIBHARNESS_SKILL;
  if (!skill) {
    return {
      error: {
        ok: false,
        code: 2,
        error: "record requires --skill <name> or LIBHARNESS_SKILL env var",
      },
    };
  }

  if (!values.metric) {
    return {
      error: { ok: false, code: 2, error: "record requires --metric <name>" },
    };
  }

  if (values.value === undefined || values.value === null) {
    return {
      error: { ok: false, code: 2, error: "record requires --value <number>" },
    };
  }

  const eventType =
    values["event-type"] || workflowName(runtime.proc.env.GITHUB_WORKFLOW_REF);
  if (!eventType) {
    return {
      error: {
        ok: false,
        code: 2,
        error: "record requires --event-type <name> or $GITHUB_WORKFLOW_REF",
      },
    };
  }

  const noteResult = buildNote(values);
  if (noteResult.error) return { error: noteResult.error };

  // A CI session knows its own host workflow run id; a local session does not.
  // Record the run id when present, the explicit `local` marker otherwise —
  // never a silent empty field. Lets a deferred backfill resolve a
  // row to its host run with a keyed lookup instead of a forensic sweep.
  const hostRun = runtime.proc.env.GITHUB_RUN_ID || "local";

  return {
    opts: {
      skill,
      metric: values.metric,
      numValue: Number(values.value),
      date: values.date || isoDate(runtime.clock.now()),
      unit: values.unit || "count",
      run: values.run || "",
      note: noteResult.note,
      eventType,
      hostRun,
      wikiRootOverride: values["wiki-root"],
    },
  };
}

// A route-bearing metric must carry a known route; the route-decision
// grammar is prepended to the note so a downstream reader partitions the
// row without parsing free text. Non-route-bearing metrics pass through.
function buildNote(values) {
  const note = values.note || "";
  if (!ROUTE_BEARING_METRICS.includes(values.metric)) return { note };

  const routeTaken = values.route;
  if (!routeTaken) {
    return {
      error: {
        ok: false,
        code: 2,
        error: `record of "${values.metric}" requires --route <id>`,
      },
    };
  }
  if (!isKnownRoute(routeTaken)) {
    return {
      error: { ok: false, code: 2, error: `unknown route "${routeTaken}"` },
    };
  }
  const routesEligible = (values["routes-eligible"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const prefix = formatRouteContext({ routeTaken, routesEligible });
  return { note: note ? `${prefix}; ${note}` : `${prefix};` };
}

// $GITHUB_WORKFLOW_REF looks like
// `owner/repo/.github/workflows/kata-shift.yml@refs/heads/main`; the
// workflow's machine name is the filename without its extension.
function workflowName(ref) {
  if (!ref) return "";
  const base = path.basename(ref.split("@")[0]);
  return base.replace(/\.ya?ml$/, "");
}

function printSummary(csvPath, metric, eventType, runtime) {
  const { fsSync, proc } = runtime;
  try {
    const text = fsSync.readFileSync(csvPath, "utf-8");
    const report = analyze(text, { eventType });
    const m = report.metrics.find((r) => r.metric === metric);

    if (m) {
      const latest = m.latest ? m.latest.value : m.values[m.values.length - 1];
      proc.stdout.write(
        `metric=${m.metric} n=${m.n} status=${m.status} latest=${latest}\n`,
      );
    }
  } catch (err) {
    proc.stderr.write(`warning: analyze failed: ${err.message}\n`);
  }
}

/** Append a metric data point to `wiki/metrics/<skill>/<year>.csv` (creating the directory and header if absent) and print a one-line XmR status summary for the recorded metric. */
export function runRecordCommand(ctx) {
  const {
    options: values,
    deps: { runtime },
  } = ctx;
  const { fsSync, proc, finder } = runtime;

  const parsed = parseRecordOptions(values, runtime);
  if (parsed.error) return parsed.error;
  const opts = parsed.opts;

  const projectRoot = finder.findProjectRoot(proc.cwd());

  const wikiRoot = opts.wikiRootOverride || path.join(projectRoot, "wiki");
  const year = opts.date.slice(0, 4);
  const csvDir = path.join(wikiRoot, "metrics", opts.skill);
  const csvPath = path.join(csvDir, `${year}.csv`);

  if (!fsSync.existsSync(csvDir)) {
    fsSync.mkdirSync(csvDir, { recursive: true });
  }

  if (!fsSync.existsSync(csvPath)) {
    fsSync.writeFileSync(csvPath, HEADER + "\n");
  }

  const row = [
    opts.date,
    opts.metric,
    opts.numValue,
    opts.unit,
    opts.run,
    opts.note,
    opts.eventType,
    opts.hostRun,
  ]
    .map(csvField)
    .join(",");
  fsSync.writeFileSync(
    csvPath,
    fsSync.readFileSync(csvPath, "utf-8") + row + "\n",
  );

  printSummary(csvPath, opts.metric, opts.eventType, runtime);

  return { ok: true };
}
