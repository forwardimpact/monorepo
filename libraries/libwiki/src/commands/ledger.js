import path from "node:path";
import { resolveWikiRoot } from "../util/wiki-dir.js";
import { renderAnchorBody, ANCHOR_KINDS } from "../ledger/anchor.js";
import { readAnchors, DEFAULT_ANCHOR_ISSUE } from "../ledger/reader.js";
import {
  foldAnchors,
  renderLedgerPage,
  renderMemoryRow,
  writeMemoryRowRegion,
  readMemoryRowRegion,
  extractProse,
} from "../ledger/projection.js";

const KIND_PREFIX = { occ: "#", nm: "NM", fold: "n=", meta: "M" };
const LEDGER_FILE = "parallel-collision-ledger.md";
const MEMORY_FILE = "MEMORY.md";

/** Parse `owner/repo` from a remote URL (https or ssh form). */
export function parseOwnerRepo(url) {
  const m = url
    .trim()
    .replace(/\.wiki$/, "")
    .match(/[/:]([^/:]+)\/([^/]+?)(?:\.wiki)?(?:\.git)?\/?$/);
  if (!m) throw new Error(`ledger: cannot parse owner/repo from "${url}"`);
  return { owner: m[1], repo: m[2].replace(/\.wiki$/, "") };
}

function nextFreeIds(fold, kind, count) {
  const prefix = KIND_PREFIX[kind];
  let max = 0;
  for (const [label, record] of fold.assignments) {
    if (record.anchor.kind !== kind) continue;
    const n = Number.parseInt(label.replace(prefix, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const ids = [];
  for (let i = 1; i <= count; i++) ids.push(`${prefix}${max + i}`);
  return ids;
}

/** Read the ordered anchor sequence and fold it, resolving the repo slug. */
async function loadFold({ gitClient, ghClient, wikiDir, issue }) {
  const url = await gitClient.remoteGetUrl("origin", { cwd: wikiDir });
  const { owner, repo } = parseOwnerRepo(url);
  const anchors = await readAnchors(ghClient, {
    owner,
    repo,
    issue,
    cwd: wikiDir,
  });
  return { fold: foldAnchors(anchors), owner, repo };
}

async function allocate(env, options) {
  const { runtime, ghClient } = env;
  const kind = options.kind;
  if (!ANCHOR_KINDS.has(kind)) {
    return {
      ok: false,
      code: 2,
      error: `ledger allocate: --kind must be one of ${[...ANCHOR_KINDS].join(", ")}`,
    };
  }
  const event = options.event;
  if (!event) {
    return {
      ok: false,
      code: 2,
      error: "ledger allocate: --event (SHA or anchor id) is required",
    };
  }
  const { fold, owner, repo } = await loadFold(env);
  // Backfill registers an anchor for ids that predate the anchor surface, named
  // explicitly via --ids; their event keys already exist in history. A plain
  // allocate mints the next free ids of the kind. The conflict detector at
  // rebuild guards against double-registering an id that already has an anchor.
  let ids;
  if (options.ids) {
    ids = options.ids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const already = ids.filter((id) => fold.assignments.has(id));
    if (already.length > 0) {
      return {
        ok: false,
        code: 1,
        error: `ledger allocate --backfill: already anchored: ${already.join(", ")}`,
      };
    }
  } else {
    const count = options.count ? Number.parseInt(options.count, 10) : 1;
    ids = nextFreeIds(fold, kind, count);
  }
  const body = renderAnchorBody({ kind, ids, event, note: options.note ?? "" });
  // The anchor publication is the allocation; no projection is written here.
  // The printed ids are provisional — a rebuild over the published sequence is
  // authoritative and resolves any concurrent interleave first-published-wins.
  await ghClient.apiPost(
    `repos/${owner}/${repo}/issues/${env.issue}/comments`,
    { body },
    { cwd: env.wikiDir },
  );
  runtime.proc.stdout.write(`${ids.join(" ")}\n`);
  return { ok: true };
}

function readFileOrEmpty(runtime, filePath) {
  return runtime.fsSync.existsSync(filePath)
    ? runtime.fsSync.readFileSync(filePath, "utf-8")
    : "";
}

function readLedgerPage(runtime, wikiDir) {
  const ledgerPath = path.join(wikiDir, LEDGER_FILE);
  return runtime.fsSync.existsSync(ledgerPath)
    ? runtime.fsSync.readFileSync(ledgerPath, "utf-8")
    : "";
}

/** Project the anchor record onto the ledger-page body, preserving cited prose. */
async function project(env, options) {
  const { runtime, wikiDir } = env;
  const labelMode = options.gapped ? "gapped" : "renumber";
  const { fold } = await loadFold(env);
  const existing = readLedgerPage(runtime, wikiDir);
  const prose = extractProse(existing);
  const { body, missingProse } = renderLedgerPage(fold, prose, { labelMode });
  return { fold, body, missingProse, existing };
}

async function rebuild(env, options) {
  const { runtime, wikiDir } = env;
  const { fold, body, missingProse } = await project(env, options);
  runtime.fsSync.writeFileSync(path.join(wikiDir, LEDGER_FILE), body);
  const memoryPath = path.join(wikiDir, MEMORY_FILE);
  const memoryBody = readFileOrEmpty(runtime, memoryPath);
  runtime.fsSync.writeFileSync(
    memoryPath,
    writeMemoryRowRegion(memoryBody, fold),
  );
  runtime.proc.stdout.write(
    `rebuilt: ${fold.assignments.size} ids, ${fold.conflicts.length} double-allocation(s)\n`,
  );
  if (missingProse.length > 0) {
    runtime.proc.stderr.write(
      `warning: prose cites missing anchors: ${missingProse.join(", ")}\n`,
    );
  }
  return { ok: true };
}

async function verify(env, options) {
  const { runtime, wikiDir } = env;
  const { fold, body, missingProse, existing } = await project(env, options);
  const problems = [];
  if (fold.conflicts.length > 0) {
    problems.push(`${fold.conflicts.length} double-allocation(s)`);
  }
  if (missingProse.length > 0) {
    problems.push(`prose citing missing anchors: ${missingProse.join(", ")}`);
  }
  if (existing.trim() !== body.trim()) {
    problems.push("ledger page diverges from the anchor record");
  }
  const memoryBody = readFileOrEmpty(runtime, path.join(wikiDir, MEMORY_FILE));
  const memoryRegion = readMemoryRowRegion(memoryBody);
  if (memoryRegion === null) {
    problems.push("MEMORY row region absent (run rebuild)");
  } else if (memoryRegion.trim() !== renderMemoryRow(fold).trim()) {
    problems.push("MEMORY row diverges from the anchor record");
  }
  if (problems.length === 0) {
    runtime.proc.stdout.write("verify: clean\n");
    return { ok: true };
  }
  runtime.proc.stderr.write(`verify: ${problems.join("; ")}\n`);
  return { ok: false, code: 1 };
}

const SUBS = { allocate, rebuild, verify };

/**
 * `gemba-wiki ledger <allocate|rebuild|verify>` — the allocation procedure that
 * keeps identity off the merge-contested page. Allocation publishes an anchor
 * comment to the obstacle issue with no projection write at allocation time;
 * rebuild and verify project the anchor record onto the ledger page and MEMORY
 * row, preserving anchor-cited prose.
 */
export async function runLedgerCommand(ctx) {
  const { runtime, gitClient, ghClient } = ctx.deps;
  const options = ctx.options ?? {};
  const sub = ctx.args?.subcommand;
  const handler = SUBS[sub];
  if (!handler) {
    return {
      ok: false,
      code: 2,
      error: "ledger requires subcommand: allocate | rebuild | verify",
    };
  }
  const wikiDir = resolveWikiRoot(runtime, options);
  const issue = options.issue
    ? Number.parseInt(options.issue, 10)
    : DEFAULT_ANCHOR_ISSUE;
  const env = { runtime, gitClient, ghClient, wikiDir, issue };
  return handler(env, options);
}
