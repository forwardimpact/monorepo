import path from "node:path";
import { addDays } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import {
  appendClaim,
  removeClaim,
  parseClaims,
  filterExpired,
} from "../active-claims.js";
import { currentDayIso } from "../util/clock.js";
import { requireAgentFlag } from "../util/agent-flag.js";
import { resolveWikiRoot } from "../util/wiki-dir.js";
import { refusalEnvelope } from "../secret-gate.js";
import {
  AncestryRefusal,
  PUSH_REASONS,
  WikiPushFailure,
} from "../wiki-sync.js";

/** Non-zero envelope returned when the ancestry guard refused publication. */
const NOT_PUBLISHED = {
  ok: false,
  code: 1,
};

// Failure reasons that, on the claim/release surfaces, are an unsafe-state
// refusal (D7/D9 family) rather than a saved-locally success (D1): the refusal
// fires before the local write is publishable, or leaves the tree unsafe for a
// later whole-tree sweep, so the surface must exit non-zero.
const UNSAFE_STATE_REASONS = new Set([
  PUSH_REASONS.PRECONDITION,
  PUSH_REASONS.RESIDUE_CONFLICT,
  PUSH_REASONS.CONSERVATION,
]);

/** Build the not-published refusal message for the given guard refusal. */
function notPublishedMessage(err) {
  return (
    `${err.message}\n` +
    "The row was written to MEMORY.md but is NOT published — it remains an " +
    "uncommitted working-tree change.\n"
  );
}

function readMemory(runtime, memPath) {
  if (!runtime.fsSync.existsSync(memPath)) return "";
  return runtime.fsSync.readFileSync(memPath, "utf-8");
}

function memoryPath(runtime, options) {
  return path.join(resolveWikiRoot(runtime, options), "MEMORY.md");
}

/**
 * Push the claim/release MEMORY.md change and translate the honest outcome
 * (spec 1780 D1) into a command envelope, composed with the singleton merge
 * discipline (spec 1920) and the secret/ancestry guards:
 * - landed (grounded or re-applied) ⇒ `{ ok: true }`, success message printed;
 * - `rejected`/`transport` ⇒ `{ ok: true }` with a saved-locally warning (the
 *   landed-locally row is complete; the session-end push is its retry);
 * - `precondition`/`residue-conflict`/`conservation` ⇒ `{ ok: false, code: 1 }`
 *   (D7/D9 unsafe-state family — the row is not published and the tree may be
 *   left unsafe for a later whole-tree sweep);
 * - a secret-gate refusal ⇒ `{ ok: false, code: 1 }` ({@link refusalEnvelope});
 * - an {@link AncestryRefusal} is rethrown so `pushRowOrRefuse` maps it to the
 *   not-published non-zero envelope;
 * - any other thrown error is a network/credential failure that degrades to
 *   "saved locally" (`{ ok: true }`).
 *
 * The `reapply` closure re-derives this row against the fresh tip if the
 * landing contends, so a parallel writer's row is never erased.
 *
 * @param {object} wikiSync - The WikiSync collaborator (may be absent in tests).
 * @param {object} runtime - The runtime bag (for stdout/stderr).
 * @param {string} message - The commit message.
 * @param {(freshText: string) => string | null} [reapply] - Re-derives the row
 *   against the fresh tip when the landing contends.
 * @returns {Promise<{ok: boolean, code?: number}>}
 */
async function pushWiki(wikiSync, runtime, message, reapply) {
  if (!wikiSync) return { ok: true };
  let result;
  try {
    await wikiSync.inheritIdentity();
    // claim/release contract is a 1-line MEMORY.md change; the pathspec keeps
    // foreign uncommitted files from parallel writers out of the commit. The
    // `reapply` closure re-derives this row against the fresh tip if the landing
    // contends (spec 1920), so a parallel writer's row is never erased.
    result = await wikiSync.commitAndPush(message, ["MEMORY.md"], { reapply });
  } catch (err) {
    // An ancestry-guard refusal pierces the saved-locally degradation: rethrow
    // so pushRowOrRefuse maps it to the not-published non-zero envelope.
    if (err instanceof AncestryRefusal) throw err;
    if (err instanceof WikiPushFailure) {
      // D7/D9 unsafe-state family: the row is not published and the tree may be
      // left unsafe for a later sweep — fail the command closed (non-zero).
      if (UNSAFE_STATE_REASONS.has(err.reason)) {
        runtime.proc.stderr.write(`${err.message}\n`);
        return { ok: false, code: 1 };
      }
      // rejected / transport: the local row landed; warn and keep zero exit.
      runtime.proc.stderr.write(
        `saved locally — not yet visible to parallel sessions (${err.reason}): ${err.message}\n`,
      );
      return { ok: true };
    }
    // Any other failure: preserve fire-and-forget "saved locally" — the change
    // is on disk and the command still succeeds.
    createLogger("wiki", runtime).warn(
      "claim",
      `push failed (saved locally): ${err.message}`,
    );
    return { ok: true };
  }
  // A secret-gate refusal fails the command closed; a grounded-landed or a
  // re-applied push reports success.
  const refusal = refusalEnvelope(runtime, result);
  if (refusal) return refusal;
  if (result.landed || result.pushed) {
    runtime.proc.stdout.write("push: committed and pushed\n");
  }
  return { ok: true };
}

/**
 * Push a written claim/release row, mapping an ancestry-guard refusal to the
 * not-published non-zero envelope and any other outcome to `pushWiki`'s
 * envelope. The row is already written to MEMORY.md; on refusal it stays as an
 * uncommitted working-tree change. The `reapply` closure re-derives the same
 * row against the fresh tip when the landing contends.
 */
async function pushRowOrRefuse(wikiSync, runtime, message, reapply) {
  try {
    // Propagate pushWiki's envelope so a secret-gate or unsafe-state refusal
    // ({ ok: false }) fails the command closed; a clean push returns { ok: true }.
    return await pushWiki(wikiSync, runtime, message, reapply);
  } catch (err) {
    if (err instanceof AncestryRefusal) {
      runtime.proc.stderr.write(notPublishedMessage(err));
      return NOT_PUBLISHED;
    }
    throw err;
  }
}

/** Insert a row into MEMORY.md `## Active Claims`. Refuses if (agent, target) already present. */
export async function runClaimCommand(ctx) {
  const { runtime, wikiSync } = ctx.deps;
  const options = ctx.options;
  const resolved = requireAgentFlag(options, {
    command: "claim",
    example:
      "fit-wiki claim --agent staff-engineer --target spec-NNNN --branch claude/...",
  });
  if (!resolved.ok) return resolved;
  const agent = resolved.agent;
  if (!options.target || !options.branch) {
    return {
      ok: false,
      code: 2,
      error: "claim requires --target and --branch",
    };
  }
  const today = options.today || currentDayIso(runtime);
  const expires = options["expires-at"] || addDays(today, 7);
  const memPath = memoryPath(runtime, options);
  const text = readMemory(runtime, memPath);
  const claim = {
    agent,
    target: options.target,
    branch: options.branch,
    pr: options.pr || null,
    claimed_at: today,
    expires_at: expires,
  };
  const result = appendClaim(text, claim);
  if (!result.inserted) {
    createLogger("wiki", runtime).warn(
      "claim",
      `claim already exists for ${agent}/${options.target}`,
    );
    return { ok: false, code: 2 };
  }
  runtime.fsSync.writeFileSync(memPath, result.text);
  runtime.proc.stdout.write(`claimed ${options.target} (expires ${expires})\n`);
  // Re-apply the same append against the fresh tip if the landing contends.
  const reapply = (fresh) => {
    const r = appendClaim(fresh, claim);
    return r.inserted ? r.text : null;
  };
  return pushRowOrRefuse(
    wikiSync,
    runtime,
    `wiki: claim ${options.target}`,
    reapply,
  );
}

/** Remove a claim row. `--expired` cleans every row past expires_at. */
export async function runReleaseCommand(ctx) {
  const { runtime, wikiSync } = ctx.deps;
  const options = ctx.options;
  const memPath = memoryPath(runtime, options);
  const text = readMemory(runtime, memPath);

  if (options.expired) {
    const today = options.today || currentDayIso(runtime);
    const claims = parseClaims(text);
    const { expired } = filterExpired(claims, today);
    let current = text;
    let count = 0;
    for (const c of expired) {
      const result = removeClaim(current, { agent: c.agent, target: c.target });
      if (result.removed) {
        current = result.text;
        count++;
      }
    }
    runtime.fsSync.writeFileSync(memPath, current);
    runtime.proc.stdout.write(`released ${count} expired claim(s)\n`);
    // Re-derive expiry against the fresh tip so a renewal landed since the stale
    // read survives; only still-expired rows are removed.
    const reapply = (fresh) => {
      const freshExpired = filterExpired(parseClaims(fresh), today).expired;
      let next = fresh;
      let anyRemoved = false;
      for (const c of freshExpired) {
        const r = removeClaim(next, { agent: c.agent, target: c.target });
        if (r.removed) {
          next = r.text;
          anyRemoved = true;
        }
      }
      return anyRemoved ? next : null;
    };
    return pushRowOrRefuse(
      wikiSync,
      runtime,
      "wiki: release expired claims",
      reapply,
    );
  }

  const resolved = requireAgentFlag(options, {
    command: "release",
    example: "fit-wiki release --agent staff-engineer --target spec-NNNN",
  });
  if (!resolved.ok) return resolved;
  const agent = resolved.agent;
  if (!options.target) {
    return {
      ok: false,
      code: 2,
      error: "release requires --target (or --expired)",
    };
  }
  const result = removeClaim(text, { agent, target: options.target });
  runtime.fsSync.writeFileSync(memPath, result.text);
  if (!result.removed) {
    runtime.proc.stdout.write(
      `no matching claim for ${agent}/${options.target}\n`,
    );
    return { ok: true };
  }
  runtime.proc.stdout.write(`released ${options.target}\n`);
  // Re-apply the same removal against the fresh tip if the landing contends;
  // re-removing an absent row is a no-op, so a re-release never resurrects it.
  const reapply = (fresh) => {
    const r = removeClaim(fresh, { agent, target: options.target });
    return r.removed ? r.text : null;
  };
  return pushRowOrRefuse(
    wikiSync,
    runtime,
    `wiki: release ${options.target}`,
    reapply,
  );
}
