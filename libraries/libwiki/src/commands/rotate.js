import fsAsync from "node:fs/promises";
import path from "node:path";
import { Finder } from "@forwardimpact/libutil";
import { rotateIfOverBudget } from "../weekly-log.js";

/** Force-rotate the current weekly log to a sealed part file. */
export function runRotateCommand(values, _args, cli) {
  const agent = values.agent || process.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    cli.usageError("rotate requires --agent or LIBEVAL_AGENT_PROFILE");
    process.exit(2);
  }
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  const projectRoot = finder.findProjectRoot(process.cwd());
  const wikiRoot = values["wiki-root"] || path.join(projectRoot, "wiki");
  const today = values.today || new Date().toISOString().slice(0, 10);

  const result = rotateIfOverBudget(wikiRoot, agent, today, 0, { force: true });
  if (result.rotated) {
    process.stdout.write(`rotated ${result.fromPath} → ${result.toPath}\n`);
  } else {
    process.stdout.write(`no rotation needed for ${agent}\n`);
  }
}
