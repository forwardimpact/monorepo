import path from "node:path";

// Shared ESLint-style emitter for structured Finding objects. A Finding is
// `{ id, level, path?, lineNo?, message, hint? }` where `level` is "fail" or
// "warn"; everything else is optional. Both libwiki's audit and libcoaligned's
// instruction/JTBD checks emit Finding objects and render through these
// functions for consistency.

function partition(findings) {
  const failures = [];
  const warnings = [];
  for (const f of findings) {
    if (f.level === "warn") warnings.push(f);
    else failures.push(f);
  }
  return { failures, warnings };
}

function relPath(p, cwd) {
  if (!p) return "(no path)";
  if (!cwd) return p;
  const rel = path.relative(cwd, p);
  return rel.startsWith("..") ? p : rel;
}

function groupByPath(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = f.path ?? "(no path)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return groups;
}

function levelLabel(level) {
  return level === "warn" ? "warning" : "error";
}

function widths(group) {
  return {
    loc: Math.max(
      0,
      ...group.map((f) => (f.lineNo != null ? String(f.lineNo).length : 0)),
    ),
    level: Math.max(...group.map((f) => levelLabel(f.level).length)),
    msg: Math.max(...group.map((f) => f.message.length)),
  };
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function renderFinding(f, w) {
  const loc =
    f.lineNo != null ? String(f.lineNo).padStart(w.loc) : " ".repeat(w.loc);
  const level = levelLabel(f.level).padEnd(w.level);
  const msg = f.message.padEnd(w.msg);
  const lines = [`  ${loc}  ${level}  ${msg}  ${f.id}`];
  if (f.hint) {
    const pad = 2 + w.loc + 2 + w.level + 2;
    lines.push(`${" ".repeat(pad)}→ ${f.hint}`);
  }
  return lines;
}

function renderGroup(filePath, group, cwd) {
  const w = widths(group);
  const lines = [relPath(filePath, cwd)];
  for (const f of group) lines.push(...renderFinding(f, w));
  return lines;
}

function renderTrailer(findings) {
  const { failures, warnings } = partition(findings);
  const symbol = failures.length === 0 ? "⚠" : "✖";
  return `${symbol} ${plural(findings.length, "problem")} (${plural(failures.length, "error")}, ${plural(warnings.length, "warning")})`;
}

/** Render findings as ESLint-style grouped output with rule IDs and hints. */
export function emitFindingsText(findings, options = {}) {
  if (findings.length === 0) {
    const label = options.passMessage ?? "all checks passed";
    return `✓ ${label}\n`;
  }
  const cwd = options.cwd ?? null;
  const blocks = [];
  for (const [filePath, group] of groupByPath(findings)) {
    blocks.push(renderGroup(filePath, group, cwd).join("\n"));
  }
  blocks.push(renderTrailer(findings));
  return `${blocks.join("\n\n")}\n`;
}

/** Render findings as a JSON document. */
export function emitFindingsJson(findings) {
  const { failures, warnings } = partition(findings);
  return (
    JSON.stringify(
      {
        result: failures.length === 0 ? "pass" : "fail",
        failures,
        warnings,
      },
      null,
      2,
    ) + "\n"
  );
}
