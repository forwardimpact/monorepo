// The invariant authoring kit: the mechanism an invariant rule module needs to
// turn the repository into subjects and findings, so the module itself carries
// only policy. The engine injects a *build kit* into every module's `build`
// (and `seed`), and a *rule kit* into a module's `rules` when it is written as
// a function. Modules never import this file — the host (invariants.js) binds a
// kit per run and passes it in, the same way the rest of the monorepo threads
// the `runtime` bag instead of importing ambient collaborators.
//
// Filesystem and subprocess access route through the injected `runtime`
// (`runtime.fsSync`, `runtime.subprocess`) so this module — which lives under
// libraries/<pkg>/src — stays clean under the repo's own ambient-deps invariant.

import { isAbsolute, join, relative, resolve } from "node:path";

import { parse as acornParse } from "acorn";
import { parse as parseYaml } from "yaml";

// -- AST -----------------------------------------------------------------

/**
 * Parse an ES module, wrapping acorn's error with the offending path.
 *
 * @param {string} source - Module source text.
 * @param {string} filePath - Path used in parse-error messages.
 * @param {{ locations?: boolean }} [options]
 * @returns {object} The acorn AST.
 */
export function parse(source, filePath, { locations = false } = {}) {
  try {
    return acornParse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations,
      allowAwaitOutsideFunction: true,
    });
  } catch (err) {
    throw new Error(`failed to parse ${filePath}: ${err.message}`);
  }
}

/**
 * Depth-first visit of every typed node in an acorn AST.
 *
 * @param {object|object[]} node - AST node (or array of nodes).
 * @param {(node: object) => void} visit - Called once per typed node.
 */
export function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    walk(node[key], visit);
  }
}

// -- Small pure utilities ------------------------------------------------

/**
 * The 1-based line number a character offset falls on.
 *
 * @param {string} text - The source text.
 * @param {number} offset - A character offset into `text`.
 * @returns {number} The 1-based line number.
 */
export function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Compile a minimal path glob to a `RegExp`. `**` matches any path segments;
 * `*` matches a non-slash run.
 *
 * @param {string} pattern - The glob.
 * @returns {RegExp} An anchored regular expression.
 */
export function glob(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped
      .replace(/\*\*/g, "DOUBLESTAR")
      .replace(/\*/g, "[^/]*")
      .replace(/DOUBLESTAR/g, ".*")}$`,
  );
}

// -- Filesystem walking (over runtime.fsSync) ----------------------------

function collectFiles(fsSync, dir, skip, match) {
  const out = [];
  if (!fsSync.existsSync(dir)) return out;
  for (const entry of fsSync.readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    if (fsSync.statSync(full).isDirectory()) {
      out.push(...collectFiles(fsSync, full, skip, match));
    } else if (match(entry)) {
      out.push(full);
    }
  }
  return out;
}

function readTextOrNull(fsSync, abs) {
  try {
    return fsSync.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

// -- ripgrep (over runtime.subprocess.runSync) ---------------------------

function normalizePatterns(pattern, patterns) {
  const list = patterns ?? (pattern === undefined ? [] : [pattern]);
  return list.map((p) => (typeof p === "string" ? { pattern: p } : p));
}

function parseRgLine(raw) {
  const i = raw.indexOf(":");
  const j = raw.indexOf(":", i + 1);
  return {
    rel: raw.slice(0, i),
    lineNo: Number.parseInt(raw.slice(i + 1, j), 10),
    text: raw.slice(j + 1),
    raw,
  };
}

// Keep the first row per key. `dedupe` is `false`, `true` (key on the raw
// line), or a key function over the row.
function dedupeRows(rows, dedupe) {
  if (!dedupe) return rows;
  const keyOf = typeof dedupe === "function" ? dedupe : (m) => m.raw;
  const seen = new Set();
  return rows.filter((r) => {
    const k = keyOf(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// A grep row carries `rel`/`raw` for dedupe; the subject keeps only the
// reportable fields (plus `reason` when the matching entry supplied one).
function toGrepSubject({ path, lineNo, text, reason }) {
  const subject = { path, lineNo, text };
  if (reason !== undefined) subject.reason = reason;
  return subject;
}

// -- The build kit -------------------------------------------------------

/**
 * Build the kit injected into a rule module's `build` and `seed`. Every
 * collaborator is bound to `root` (the repository root), `dir` (the module's
 * own directory, for co-located config), and `runtime` (the ambient bag).
 *
 * @param {{ root: string, dir: string, runtime: import('@forwardimpact/libutil/runtime').Runtime }} options
 * @returns {object} The build kit.
 */
export function createBuildKit({ root, dir, runtime }) {
  const { fsSync, subprocess } = runtime;
  const abs = (p) => (isAbsolute(p) ? p : resolve(root, p));

  /**
   * Collect files under one or more directories as subjects.
   *
   * @param {object} options
   * @param {string[]} options.dirs - Root directories, relative to the repo.
   * @param {(name: string) => boolean} options.match - File-name predicate.
   * @param {Iterable<string>} [options.skip] - Directory names to prune.
   * @param {string} [options.under] - Restrict to `<dir>/<child>/<under>/**`,
   *   the per-package `src`/`test` shape.
   * @param {boolean} [options.read] - Attach file `text` (default true).
   * @returns {Array<{ path: string, rel: string, text?: string }>}
   */
  function scan({ dirs, match, skip = [], under, read = true }) {
    const skipSet = new Set(skip);
    const files = [];
    for (const d of dirs) {
      const base = resolve(root, d);
      const roots = under
        ? (fsSync.existsSync(base) ? fsSync.readdirSync(base) : []).map((n) =>
            join(base, n, under),
          )
        : [base];
      for (const r of roots)
        files.push(...collectFiles(fsSync, r, skipSet, match));
    }
    return files.map((path) => {
      const subject = { path, rel: relative(root, path) };
      if (read) subject.text = readTextOrNull(fsSync, path) ?? "";
      return subject;
    });
  }

  /**
   * Like `scan`, but parse each file and merge `extract(ast)` into the subject.
   * A file that fails to parse becomes `{ path, rel, parseError }` instead, so
   * the module pairs it with the rule kit's `parseError(scope, …)`.
   *
   * @param {object} options - `scan` options plus the two below.
   * @param {(ast: object) => object} options.extract - Subject fields from the AST.
   * @param {boolean} [options.locations] - Pass `locations` to the parser.
   * @returns {Array<object>}
   */
  function scanAst({ extract, locations = false, ...scanOpts }) {
    return scan({ ...scanOpts, read: true }).map(({ path, rel, text }) => {
      try {
        return { path, rel, ...extract(parse(text, rel, { locations })) };
      } catch (err) {
        return { path, rel, parseError: err.message };
      }
    });
  }

  function assertRg() {
    if (subprocess.runSync("rg", ["--version"]).exitCode !== 0) {
      throw new Error("ripgrep (rg) is required by the invariant rule modules");
    }
  }

  function rgOnce({ pattern, paths, globs, caseSensitive, onlyMatching }) {
    const args = [
      "--hidden",
      "--no-messages",
      "--line-number",
      "--color",
      "never",
    ];
    if (!caseSensitive) args.push("-i");
    if (onlyMatching) args.push("--only-matching");
    for (const g of globs) args.push("--glob", g);
    args.push("-e", pattern, ...paths);
    const { stdout, exitCode } = subprocess.runSync("rg", args, { cwd: root });
    if (exitCode === 2)
      throw new Error(`ripgrep failed for pattern: ${pattern}`);
    return (stdout || "").split("\n").filter(Boolean).map(parseRgLine);
  }

  /**
   * Scan the repo with ripgrep and return matches as subjects. Accepts one
   * `pattern` or a list of `patterns` (strings, or `{ pattern, reason?, globs?,
   * caseSensitive?, onlyMatching?, exclude? }`); per-entry options override the
   * call defaults, and a per-entry `exclude` RegExp drops matches whose raw
   * line it tests true (a false-positive filter). `dedupe` is `false`, `true`
   * (key on the raw line), or a key function over `{ path, rel, lineNo, text,
   * raw, reason }`.
   *
   * Each subject is `{ path, lineNo, text }`, plus `reason` when the matching
   * entry carries one. The repo-relative `rel` and full `raw` line are
   * available to the `dedupe` key function but are not part of the subject.
   *
   * @param {object} options
   * @returns {Array<{ path: string, lineNo: number, text: string, reason?: string }>}
   */
  function grep({
    pattern,
    patterns,
    paths = ["."],
    globs = [],
    caseSensitive = false,
    onlyMatching = false,
    dedupe = false,
  }) {
    assertRg();
    const rows = [];
    for (const entry of normalizePatterns(pattern, patterns)) {
      const matches = rgOnce({
        pattern: entry.pattern,
        paths,
        globs: [...globs, ...(entry.globs ?? [])],
        caseSensitive: entry.caseSensitive ?? caseSensitive,
        onlyMatching: entry.onlyMatching ?? onlyMatching,
      });
      for (const m of matches) {
        if (entry.exclude && entry.exclude.test(m.raw)) continue;
        rows.push({ ...m, path: resolve(root, m.rel), reason: entry.reason });
      }
    }
    return dedupeRows(rows, dedupe).map(toGrepSubject);
  }

  /**
   * Read a repo file's text (path relative to the repo root, or absolute).
   *
   * @param {string} path
   * @returns {string|null} The text, or `null` when missing.
   */
  function readText(path) {
    return readTextOrNull(fsSync, abs(path));
  }

  /**
   * Read and parse a repo JSON file, returning `null` when missing or invalid.
   *
   * @param {string} path - Relative to the repo root, or absolute.
   * @returns {object|null}
   */
  function readJson(path) {
    const text = readTextOrNull(fsSync, abs(path));
    if (text == null) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Read a config file co-located with the rule module (`<dir>/<name>`),
   * parsed by extension (`.json` / `.yml` / `.yaml`). Returns `fallback` when
   * the file is missing, empty, or unparseable.
   *
   * @param {string} name - File name beside the module.
   * @param {*} [fallback] - Value when absent or unreadable (default `null`).
   * @returns {*}
   */
  function config(name, fallback = null) {
    const text = readTextOrNull(fsSync, join(dir, name));
    if (text == null || text.trim() === "") return fallback;
    try {
      const parsed = name.endsWith(".json")
        ? JSON.parse(text)
        : parseYaml(text);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * The shared "single source restated across consumers" check. For every
   * registry `entry` (`{ key, expected, consumers: [{ path, pattern }] }`),
   * scan each consumer file line by line for `pattern` and emit one subject
   * per match: the restated value (capture group 1, else the whole match,
   * trimmed) paired with the entry's `expected` value and an `ok` verdict from
   * `equal(restated, expected, key)`. The module supplies the domain pieces
   * (how `expected` is computed, what `equal` means); the kit owns the scan.
   *
   * Native line-by-line matching, not ripgrep: the surfaces carry URLs and
   * other colon-bearing values that ripgrep's single-file output corrupts, and
   * look-around is sometimes needed.
   *
   * @param {object} options
   * @param {Array<{ key: string, expected: *, consumers: Array<{ path: string, pattern: RegExp|string }> }>} options.entries
   * @param {(restated: string, expected: *, key: string) => boolean} options.equal
   * @returns {Array<{ key: string, path: string, lineNo: number, restated: string, expected: *, ok: boolean }>}
   */
  function restatementDrift({ entries, equal }) {
    const subjects = [];
    for (const { key, expected, consumers } of entries) {
      for (const consumer of consumers) {
        const text = readTextOrNull(fsSync, abs(consumer.path));
        if (text == null) continue;
        const re =
          typeof consumer.pattern === "string"
            ? new RegExp(consumer.pattern)
            : consumer.pattern;
        text.split("\n").forEach((line, i) => {
          const m = line.match(re);
          if (!m) return;
          const restated = (m[1] ?? m[0]).trim();
          subjects.push({
            key,
            path: consumer.path,
            lineNo: i + 1,
            restated,
            expected,
            ok: equal(restated, expected, key),
          });
        });
      }
    }
    return subjects;
  }

  /**
   * List the entries of a repo directory by name, returning `[]` when missing.
   *
   * @param {string} path - Relative to the repo root, or absolute.
   * @param {{ dirsOnly?: boolean, filesOnly?: boolean }} [options]
   * @returns {string[]}
   */
  function listDir(path, { dirsOnly = false, filesOnly = false } = {}) {
    let entries;
    try {
      entries = fsSync.readdirSync(abs(path), { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((e) =>
        dirsOnly ? e.isDirectory() : filesOnly ? e.isFile() : true,
      )
      .map((e) => e.name);
  }

  return {
    root,
    dir,
    runtime,
    scan,
    scanAst,
    parse,
    walk,
    grep,
    restatementDrift,
    readText,
    readJson,
    config,
    listDir,
    lineAt,
    glob,
  };
}

// -- The rule kit --------------------------------------------------------

/**
 * Helpers a rule module receives when it exports `rules` as a function. They
 * build the two recurring rule shapes so the module declares only policy.
 */
export const RULE_KIT = {
  /**
   * The standard parse-error rule: fails any subject carrying a `parseError`
   * string (as produced by the build kit's `scanAst`).
   *
   * @param {string} scope - The subject scope to guard.
   * @param {{ id?: string, hint?: string }} [options]
   * @returns {object} A rule for the rules engine.
   */
  parseError(scope, { id = `${scope}.parse-error`, hint } = {}) {
    return {
      id,
      scope,
      severity: "fail",
      check: (s) => (s.parseError ? { msg: s.parseError } : null),
      message: (_s, r) => r.msg,
      hint: hint ?? "fix the syntax error so the file can be parsed",
    };
  },

  /**
   * A rule that fails every subject in `scope` (optionally gated by `when`).
   * The build step has already decided each subject is a violation; the rule
   * only renders it.
   *
   * @param {string} scope
   * @param {{ id: string, message: (s: object, r: object, c: object) => string, hint?: string, when?: (s: object, c: object) => boolean }} options
   * @returns {object} A rule for the rules engine.
   */
  failAll(scope, { id, message, hint, when }) {
    const rule = { id, scope, severity: "fail", check: () => ({}), message };
    if (hint !== undefined) rule.hint = hint;
    if (when !== undefined) rule.when = when;
    return rule;
  },
};
