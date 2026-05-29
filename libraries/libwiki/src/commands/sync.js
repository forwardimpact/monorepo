import { WikiPullConflict } from "../wiki-repo.js";
import { buildRepo } from "../build-repo.js";

/** Commit all wiki changes and push them to the remote wiki repository. */
export async function runPushCommand(values, _args, cli) {
  const repo = await buildRepo(values);
  repo.inheritIdentity();

  const result = repo.commitAndPush("wiki: update from session");
  if (result.pushed) {
    process.stdout.write("push: committed and pushed\n");
  } else {
    process.stdout.write("push: nothing to push\n");
  }
}

/** Fetch and rebase the local wiki on origin/master; on rebase conflict, exit the process with code 1 and a message to resolve manually or push first. */
export async function runPullCommand(values, _args, cli) {
  const repo = await buildRepo(values);
  repo.inheritIdentity();

  try {
    repo.pull();
    process.stdout.write("pull: up to date\n");
  } catch (err) {
    if (err instanceof WikiPullConflict) {
      process.stderr.write(
        "fit-wiki pull: rebase conflict — local divergence detected; resolve manually or push first\n",
      );
      process.exit(1);
    }
    throw err;
  }
}
