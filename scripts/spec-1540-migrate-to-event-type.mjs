#!/usr/bin/env node
// One-time migration for spec 1540: every CSV under wiki/metrics/*/2026.csv
// moves to the unified seven-column schema ending in `event_type`, and the
// non-metric datasets parked under wiki/metrics/ by directory convention
// relocate to owner-scoped paths. Removed from the repo in the same PR
// series that ships the migration commits — recovery is git-based.
//
// Two-pass design: pass 1 resolves every file to a branch without writing
// and exits non-zero if any file is unrecognised; pass 2 re-reads each
// file, aborts if anything changed between passes, then rewrites
// atomically (tmp + rename).
//
// Staff-engineer tripwire: spec § Problem counts ~21 shift-work rows of
// 435 at obstacle filing; Exp SE 1432-A surfaced 6 boot-note runs that
// are actually shift-work (≈27 expected post-classify). The advisory
// bound is 60 — two weeks of plausible shift-work growth — and a count
// above it warns on stderr without failing, so a reviewer reads the
// per-file summary before committing.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const PRE_MIGRATION_HEADER = "date,metric,value,unit,run,note";
const POST_MIGRATION_HEADER = "date,metric,value,unit,run,note,event_type";
const PRODUCT_ISSUE_HEADER =
  "date,metric,value,unit,run,note,predicate_resolution";
const TRACE_ATTESTATION_HEADER =
  "date,activation_run_id,prior_run_id,p1_header_present," +
  "p2_prior_marked_unverified,p3_was_false_positive,note";
const BOOT_NOTE_RE = /^boot-append from Kata: Dispatch/;
const ZERO_WHEN_BOOT = ["prs_opened", "commits_pushed", "file_writes"];
const STAFF_SHIFT_TRIPWIRE = 60;

// Non-metric datasets relocate off wiki/metrics/ to owner-scoped paths.
// The first two moves are named in design § Outlier CSVs; the last two
// datasets appeared under wiki/metrics/ after the plan merged and get the
// same treatment (relocate, owner concurrence requested on the PR).
const RELOCATIONS = {
  "kata-release-engineer-trace-attestation": {
    dest: ["release-engineer", "trace-attestation-2026.csv"],
    expectHeader: TRACE_ATTESTATION_HEADER,
  },
  "gh-token-sightings": {
    dest: ["release-engineer", "gh-token-sightings-2026.csv"],
    expectHeader: null, // bespoke experiment schema; relocated verbatim
  },
  "pm-exp-42-readset-enumeration": {
    dest: ["product-manager", "exp-42-readset-enumeration-2026.csv"],
    expectHeader: null,
  },
};

const PRODUCT_ISSUE_DIR = "kata-product-issue";
const PREDICATE_DEST = [
  "product-manager",
  "exp-41-predicate-resolutions-2026.csv",
];
const PREDICATE_HEADER = "date,run,predicate_resolution";

// Per-skill default workflow for migrated kata-* rows. Future rows carry
// the true machine name from $GITHUB_WORKFLOW_REF; this only colours the
// migrated tail.
const SKILL_DEFAULTS = {
  "kata-dispatch": "kata-dispatch",
  "kata-coaching": "kata-coaching",
  // Matches the split convention from design § Outlier CSVs so repair-mode
  // stamps on this file agree with the migrated rows.
  "kata-product-issue": "kata-product-issue",
};

function fail(msg) {
  process.stderr.write(`spec-1540-migrate: ${msg}\n`);
  process.exit(1);
}

function parseFlags(argv) {
  const flags = { wikiRoot: "./wiki", dryRun: false, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--apply") flags.apply = true;
    else if (a === "--wiki-root") flags.wikiRoot = argv[++i];
    else fail(`unknown argument "${a}"`);
  }
  if (flags.dryRun === flags.apply) {
    fail("exactly one of --dry-run or --apply is required");
  }
  return flags;
}

// Quote-aware split of one CSV line into raw field substrings plus the
// start offset of each field, so callers can slice the original line
// byte-for-byte instead of re-serialising.
function splitFields(line) {
  const fields = [];
  const starts = [0];
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      starts.push(i + 1);
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return { fields, starts };
}

function readLines(file) {
  const text = readFileSync(file, "utf-8");
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return { text, lines: body.split("\n") };
}

// Group data lines by run id and classify each group: kata-dispatch iff
// the duration_seconds note carries the boot-append prefix AND the three
// work-signal rows are present and all zero; anything else (including a
// group missing a signal row) stays kata-shift.
function classifyAgentLines(lines) {
  const groups = new Map();
  const parsed = lines.map((line) => {
    const { fields } = splitFields(line);
    return {
      metric: fields[1] ?? "",
      value: fields[2] ?? "",
      run: fields[4] ?? "",
      note: fields[5] ?? "",
    };
  });
  for (const row of parsed) {
    if (!groups.has(row.run)) groups.set(row.run, []);
    groups.get(row.run).push(row);
  }
  const verdicts = new Map();
  for (const [run, rows] of groups) {
    const duration = rows.find((r) => r.metric === "duration_seconds");
    const bootNote = duration ? BOOT_NOTE_RE.test(duration.note) : false;
    const allZero = ZERO_WHEN_BOOT.every((metric) => {
      const row = rows.find((r) => r.metric === metric);
      return row !== undefined && Number(row.value) === 0;
    });
    verdicts.set(run, bootNote && allZero ? "kata-dispatch" : "kata-shift");
  }
  return parsed.map((row) => verdicts.get(row.run));
}

function countBy(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

function summaryLine(rel, counts) {
  const dispatch = counts["kata-dispatch"] ?? 0;
  const shift = counts["kata-shift"] ?? 0;
  const other = Object.entries(counts)
    .filter(([k]) => k !== "kata-dispatch" && k !== "kata-shift")
    .reduce((n, [, c]) => n + c, 0);
  return `${rel} kata-dispatch=${dispatch} kata-shift=${shift} other=${other}`;
}

function resolveRelocate(relocation, wikiRoot, ctx) {
  const { rel, file, text, lines, header } = ctx;
  if (relocation.expectHeader && header !== relocation.expectHeader) {
    fail(
      `${rel}: relocate pre-flight expected header "${relocation.expectHeader}", got "${header}"`,
    );
  }
  const dest = path.join(wikiRoot, ...relocation.dest);
  if (existsSync(dest)) {
    fail(`${rel}: relocate destination already exists: ${dest}`);
  }
  return {
    kind: "relocate",
    file,
    originalText: text,
    dest,
    summary: `${rel} → ${path.relative(wikiRoot, dest)} (relocated verbatim, ${lines.length - 1} rows)`,
  };
}

function resolveSplit(wikiRoot, ctx) {
  const { rel, file, text, lines, header } = ctx;
  if (header !== PRODUCT_ISSUE_HEADER) {
    fail(
      `${rel}: split pre-flight expected header "${PRODUCT_ISSUE_HEADER}", got "${header}"`,
    );
  }
  const dest = path.join(wikiRoot, ...PREDICATE_DEST);
  if (existsSync(dest)) {
    fail(`${rel}: split destination already exists: ${dest}`);
  }
  const out = [POST_MIGRATION_HEADER];
  const predicateRows = [PREDICATE_HEADER];
  lines.slice(1).forEach((line, i) => {
    const { fields, starts } = splitFields(line);
    // Rows appended without the experiment column carry six fields and
    // an implicit n/a predicate. Rows with more carry the predicate as
    // the LAST field — manual appends left unquoted commas in some
    // notes, so position 7 is not trustworthy.
    if (fields.length < 6) {
      fail(`${rel}:${i + 2}: row has ${fields.length} fields; repair it first`);
    }
    if (fields.length === 6) {
      out.push(`${line},kata-product-issue`);
      return;
    }
    const predicate = fields[fields.length - 1];
    if (!/^[\w/-]{1,20}$/.test(predicate)) {
      fail(
        `${rel}:${i + 2}: trailing field "${predicate.slice(0, 30)}" does not look like a predicate_resolution token`,
      );
    }
    if (predicate !== "n/a") {
      predicateRows.push([fields[0], fields[4], predicate].join(","));
    }
    const noteEnd = starts[starts.length - 1] - 1;
    const note = normalizeNote(
      line.slice(starts[5], noteEnd),
      fields.length > 7,
    );
    out.push(`${line.slice(0, starts[5])}${note},kata-product-issue`);
  });
  const counts = { "kata-product-issue": out.length - 1 };
  return {
    kind: "split",
    file,
    originalText: text,
    newText: out.join("\n") + "\n",
    dest,
    destText: predicateRows.join("\n") + "\n",
    summary:
      summaryLine(rel, counts) +
      ` (${predicateRows.length - 1} predicate rows → ${path.relative(wikiRoot, dest)})`,
  };
}

function stampFor(dirName, agentStamps, index) {
  if (agentStamps) return agentStamps[index];
  return SKILL_DEFAULTS[dirName] ?? "kata-shift";
}

// Manual appends left unquoted commas in some legacy notes, so those rows
// split into more than six fields and the new trailing event_type column
// would land mid-note for any downstream parser. Quote-wrap the spillover
// (doubling embedded quotes, the same convention the recorder writes) so
// every migrated row has exactly seven parseable fields.
function normalizeNote(raw, hadSpillover) {
  if (!hadSpillover) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function resolveConformant(dirName, ctx) {
  const { rel, file, text, lines } = ctx;
  const dataLines = lines.slice(1);
  const agentStamps = dirName.startsWith("kata-")
    ? null
    : classifyAgentLines(dataLines);
  const stamps = dataLines.map((_, i) => stampFor(dirName, agentStamps, i));
  const out = [POST_MIGRATION_HEADER];
  dataLines.forEach((line, i) => {
    const { fields, starts } = splitFields(line);
    if (fields.length < 6) {
      fail(`${rel}:${i + 2}: row has ${fields.length} fields; repair it first`);
    }
    const note = normalizeNote(line.slice(starts[5]), fields.length > 6);
    out.push(`${line.slice(0, starts[5])}${note},${stamps[i]}`);
  });
  return {
    kind: "rewrite",
    file,
    dirName,
    originalText: text,
    newText: out.join("\n") + "\n",
    counts: countBy(stamps),
    summary: summaryLine(rel, countBy(stamps)),
  };
}

// Repair mode: rows appended by the pre-migration recorder between the
// wiki rewrite and the runtime merge carry six fields; stamp them with
// the same rules so --apply is safely re-runnable.
function resolveRepair(dirName, ctx) {
  const { rel, file, text, lines } = ctx;
  const dataLines = lines.slice(1);
  const bare = dataLines.filter((line) => splitFields(line).fields.length < 7);
  if (bare.length === 0) {
    return {
      kind: "skip",
      file,
      summary: `${rel} already migrated, no repair needed`,
    };
  }
  const agentStamps = dirName.startsWith("kata-")
    ? null
    : classifyAgentLines(dataLines);
  const out = [POST_MIGRATION_HEADER];
  const stamped = [];
  dataLines.forEach((line, i) => {
    const arity = splitFields(line).fields.length;
    if (arity < 7) {
      if (arity !== 6) {
        fail(`${rel}:${i + 2}: row has ${arity} fields; repair it first`);
      }
      const stamp = stampFor(dirName, agentStamps, i);
      stamped.push(stamp);
      out.push(`${line},${stamp}`);
    } else {
      out.push(line);
    }
  });
  return {
    kind: "rewrite",
    file,
    dirName,
    originalText: text,
    newText: out.join("\n") + "\n",
    counts: countBy(stamped),
    summary: `${rel} repaired ${bare.length} bare rows: ${summaryLine(rel, countBy(stamped))}`,
  };
}

// Resolve one CSV to a planned action. Returns
// { kind, file, ...kind-specific fields, summary }.
function resolveFile(wikiRoot, dirName, file) {
  const rel = path.relative(wikiRoot, file);
  const { text, lines } = readLines(file);
  const ctx = { rel, file, text, lines, header: lines[0] };

  const relocation = RELOCATIONS[dirName];
  if (relocation) return resolveRelocate(relocation, wikiRoot, ctx);
  // Already-migrated files (including a previously split kata-product-issue)
  // go through repair so --apply is safely re-runnable.
  if (ctx.header === POST_MIGRATION_HEADER) return resolveRepair(dirName, ctx);
  if (dirName === PRODUCT_ISSUE_DIR) return resolveSplit(wikiRoot, ctx);
  if (ctx.header === PRE_MIGRATION_HEADER) {
    return resolveConformant(dirName, ctx);
  }
  fail(`${rel}: unrecognised header "${ctx.header}"`);
}

function atomicWrite(file, text) {
  const tmp = `${file}.tmp-1540`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function applyPlan(plan, totals) {
  if (plan.kind === "relocate") {
    mkdirSync(path.dirname(plan.dest), { recursive: true });
    renameSync(plan.file, plan.dest);
    const dir = path.dirname(plan.file);
    if (readdirSync(dir).length === 0) rmdirSync(dir);
    totals.relocations++;
    return;
  }
  if (plan.kind === "split") {
    mkdirSync(path.dirname(plan.dest), { recursive: true });
    atomicWrite(plan.dest, plan.destText);
  }
  atomicWrite(plan.file, plan.newText);
  totals.rewrites++;
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const wikiRoot = path.resolve(flags.wikiRoot);
  const metricsDir = path.join(wikiRoot, "metrics");
  if (!existsSync(metricsDir)) fail(`no metrics directory at ${metricsDir}`);

  const files = readdirSync(metricsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      dirName: entry.name,
      file: path.join(metricsDir, entry.name, "2026.csv"),
    }))
    .filter(({ file }) => existsSync(file));

  // Pass 1 — resolve every file or die without writing.
  const plans = files.map(({ dirName, file }) =>
    resolveFile(wikiRoot, dirName, file),
  );
  for (const plan of plans) process.stdout.write(plan.summary + "\n");

  const staffPlan = plans.find(
    (p) => p.dirName === "staff-engineer" && p.counts,
  );
  const staffShift = staffPlan?.counts["kata-shift"] ?? 0;
  if (staffShift > STAFF_SHIFT_TRIPWIRE) {
    process.stderr.write(
      `warning: staff-engineer kata-shift count ${staffShift} exceeds advisory bound ` +
        `${STAFF_SHIFT_TRIPWIRE} (expected ≈27 per Exp SE 1432-A); review the classifier output\n`,
    );
  }

  const totals = { files: plans.length, rewrites: 0, relocations: 0, skips: 0 };
  if (flags.dryRun) {
    process.stdout.write(
      `dry-run clean: ${plans.length} files resolved, nothing written\n`,
    );
    return;
  }

  // Pass 2 — abort if anything moved underneath us, then write.
  for (const plan of plans) {
    if (plan.kind === "skip") {
      totals.skips++;
      continue;
    }
    const current = readFileSync(plan.file, "utf-8");
    if (current !== plan.originalText) {
      fail(
        `${plan.file} changed between passes; re-run from a clean wiki tree`,
      );
    }
    applyPlan(plan, totals);
  }

  process.stdout.write(
    `applied: ${totals.files} files (${totals.rewrites} rewritten, ` +
      `${totals.relocations} relocated, ${totals.skips} skipped)\n`,
  );
}

main();
