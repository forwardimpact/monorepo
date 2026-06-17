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
import { resolveWikiRoot } from "../util/wiki-dir.js";
import { AncestryRefusal } from "../wiki-sync.js";

/** Non-zero envelope returned when the ancestry guard refused publication. */
const NOT_PUBLISHED = {
  ok: false,
  code: 1,
};

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

async function pushWiki(wikiSync, runtime, message) {
  if (!wikiSync) return;
  try {
    await wikiSync.inheritIdentity();
    // claim/release contract is a 1-line MEMORY.md change; the pathspec keeps
    // foreign uncommitted files from parallel writers out of the commit.
    const result = await wikiSync.commitAndPush(message, ["MEMORY.md"]);
    if (result.pushed)
      runtime.proc.stdout.write("push: committed and pushed\n");
  } catch (err) {
    // An ancestry-guard refusal pierces the saved-locally degradation: it must
    // reach a non-zero exit so the session stops rather than scroll past. Every
    // other failure keeps degrading to a saved-locally warning (spec 1750 D2).
    if (err instanceof AncestryRefusal) throw err;
    createLogger("wiki", runtime).warn(
      "claim",
      `push failed (saved locally): ${err.message}`,
    );
  }
}

/**
 * Push a written claim/release row, mapping an ancestry-guard refusal to the
 * not-published non-zero envelope and any other outcome to `{ ok: true }`. The
 * row is already written to MEMORY.md; on refusal it stays as an uncommitted
 * working-tree change (spec 1750 D2).
 */
async function pushRowOrRefuse(wikiSync, runtime, message) {
  try {
    await pushWiki(wikiSync, runtime, message);
  } catch (err) {
    if (err instanceof AncestryRefusal) {
      runtime.proc.stderr.write(notPublishedMessage(err));
      return NOT_PUBLISHED;
    }
    throw err;
  }
  return { ok: true };
}

/** Insert a row into MEMORY.md `## Active Claims`. Refuses if (agent, target) already present. */
export async function runClaimCommand(ctx) {
  const { runtime, wikiSync } = ctx.deps;
  const options = ctx.options;
  const agent = options.agent || runtime.proc.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    return {
      ok: false,
      code: 2,
      error: "claim requires --agent or LIBEVAL_AGENT_PROFILE",
    };
  }
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
  const result = appendClaim(text, {
    agent,
    target: options.target,
    branch: options.branch,
    pr: options.pr || null,
    claimed_at: today,
    expires_at: expires,
  });
  if (!result.inserted) {
    createLogger("wiki", runtime).warn(
      "claim",
      `claim already exists for ${agent}/${options.target}`,
    );
    return { ok: false, code: 2 };
  }
  runtime.fsSync.writeFileSync(memPath, result.text);
  runtime.proc.stdout.write(`claimed ${options.target} (expires ${expires})\n`);
  return pushRowOrRefuse(wikiSync, runtime, `wiki: claim ${options.target}`);
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
    return pushRowOrRefuse(wikiSync, runtime, "wiki: release expired claims");
  }

  const agent = options.agent || runtime.proc.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    return {
      ok: false,
      code: 2,
      error: "release requires --agent or --expired",
    };
  }
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
  } else {
    runtime.proc.stdout.write(`released ${options.target}\n`);
    return pushRowOrRefuse(
      wikiSync,
      runtime,
      `wiki: release ${options.target}`,
    );
  }
  return { ok: true };
}
