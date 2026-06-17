import { createLogger } from "@forwardimpact/libtelemetry";
import { AncestryRefusal, WikiPullConflict } from "../wiki-sync.js";
import { sweepTier2, renderDetections } from "../integrity.js";
import { resolveWikiRoot } from "../util/wiki-dir.js";

/** Commit all wiki changes and push them to the remote wiki repository. The post-push tier-1 integrity detections (spec 1960) surface in the output; they never gate the push. */
export async function runPushCommand(ctx) {
  const { runtime, wikiSync } = ctx.deps;
  await wikiSync.inheritIdentity();

  let result;
  try {
    result = await wikiSync.commitAndPush("wiki: update from session");
  } catch (err) {
    if (err instanceof AncestryRefusal) {
      runtime.proc.stderr.write(`${err.message}\n`);
      return { ok: false, code: 1 };
    }
    throw err;
  }
  if (result.pushed) {
    runtime.proc.stdout.write("push: committed and pushed\n");
  } else {
    runtime.proc.stdout.write("push: nothing to push\n");
  }
  if (result.detections?.length) {
    runtime.proc.stdout.write(renderDetections(result.detections));
  }
  return { ok: true };
}

/** Fetch and rebase the local wiki on origin/master; on rebase conflict, return a non-zero envelope with a message to resolve manually or push first. After a clean pull, the tier-2 lane-record sweep (spec 1960) surfaces any previous-session content absent at the fetched tip; it never gates the boot. */
export async function runPullCommand(ctx) {
  const { runtime, wikiSync, gitClient } = ctx.deps;
  await wikiSync.inheritIdentity();

  try {
    await wikiSync.pull();
    runtime.proc.stdout.write("pull: up to date\n");
  } catch (err) {
    if (err instanceof WikiPullConflict) {
      createLogger("wiki", runtime).error(
        "pull",
        "rebase conflict — local divergence detected; resolve manually or push first",
      );
      return { ok: false, code: 1 };
    }
    throw err;
  }

  // Tier-2 sweep on the just-rebased tree. Detection-only: any failure degrades
  // to no detections, never throws into the flow, never changes the exit code.
  try {
    const wikiDir = resolveWikiRoot(runtime, ctx.options);
    // `--today` (ISO date) overrides the wall clock for deterministic tests;
    // otherwise the binding stamp is the runtime clock.
    const now = ctx.options.today
      ? Date.parse(ctx.options.today)
      : runtime.clock.now();
    const detections = await sweepTier2({
      runtime,
      gitClient,
      wikiDir,
      agent: ctx.options.agent,
      now,
    });
    if (detections.length)
      runtime.proc.stdout.write(renderDetections(detections));
  } catch {
    // Detection-only instrument: a sweep error never gates the boot flow.
  }
  return { ok: true };
}
