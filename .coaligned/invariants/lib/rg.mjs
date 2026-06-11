// Shared ripgrep adapter for the pattern-scanning invariant rule modules.

import { spawnSync } from "node:child_process";

/** Throw when ripgrep is not on PATH — the scanning modules require it. */
export function assertRgAvailable() {
  const probe = spawnSync("rg", ["--version"], { stdio: "pipe" });
  if (probe.status !== 0) {
    throw new Error("ripgrep (rg) is required by the invariant rule modules");
  }
}

/**
 * Run ripgrep and return its matches parsed into structured entries.
 *
 * @param {object} options
 * @param {string} options.cwd - Directory rg runs in; paths are relative to it.
 * @param {string} options.pattern - The rg regex.
 * @param {string[]} [options.globs] - `--glob` filters, in precedence order
 *   (rg gives the last matching glob precedence).
 * @param {string[]} [options.paths] - Search roots (default the whole cwd).
 * @param {boolean} [options.caseSensitive] - Omit rg's `-i` flag when true.
 * @param {boolean} [options.onlyMatching] - Emit only the matched text.
 * @returns {{ path: string, lineNo: number, text: string, raw: string }[]}
 */
export function rgMatches({
  cwd,
  pattern,
  globs = [],
  paths = ["."],
  caseSensitive = false,
  onlyMatching = false,
}) {
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

  const { stdout, status } = spawnSync("rg", args, {
    cwd,
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (status === 2) {
    throw new Error(`ripgrep failed for pattern: ${pattern}`);
  }

  const out = [];
  for (const raw of (stdout || "").split("\n").filter(Boolean)) {
    const i = raw.indexOf(":");
    const j = raw.indexOf(":", i + 1);
    out.push({
      path: raw.slice(0, i),
      lineNo: Number.parseInt(raw.slice(i + 1, j), 10),
      text: raw.slice(j + 1),
      raw,
    });
  }
  return out;
}
