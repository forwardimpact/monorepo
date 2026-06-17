import { createLogger } from "@forwardimpact/libtelemetry";
import { AncestryRefusal, WikiPullConflict } from "../wiki-sync.js";

/** Commit all wiki changes and push them to the remote wiki repository. */
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
  return { ok: true };
}

/** Fetch and rebase the local wiki on origin/master; on rebase conflict, return a non-zero envelope with a message to resolve manually or push first. */
export async function runPullCommand(ctx) {
  const { runtime, wikiSync } = ctx.deps;
  await wikiSync.inheritIdentity();

  try {
    await wikiSync.pull();
    runtime.proc.stdout.write("pull: up to date\n");
    return { ok: true };
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
}
