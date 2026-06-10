import path from "node:path";
import { isoDate } from "@forwardimpact/libutil";
import { analyze } from "../analyze.js";
import { HEADER } from "../constants.js";

const csvField = (v) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function parseRecordOptions(values, runtime) {
  const skill = values.skill || runtime.proc.env.LIBEVAL_SKILL;
  if (!skill) {
    return {
      error: {
        ok: false,
        code: 2,
        error: "record requires --skill <name> or LIBEVAL_SKILL env var",
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

  return {
    opts: {
      skill,
      metric: values.metric,
      numValue: Number(values.value),
      date: values.date || isoDate(runtime.clock.now()),
      unit: values.unit || "count",
      run: values.run || "",
      note: values.note || "",
      eventType,
      wikiRootOverride: values["wiki-root"],
    },
  };
}

// $GITHUB_WORKFLOW_REF looks like
// `owner/repo/.github/workflows/kata-shift.yml@refs/heads/main`; the
// workflow's machine name is the filename without `.yml`.
function workflowName(ref) {
  if (!ref) return "";
  return path.basename(ref.split("@")[0], ".yml");
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
