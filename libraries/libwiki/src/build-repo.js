import path from "node:path";
import fsAsync from "node:fs/promises";
import { Finder } from "@forwardimpact/libutil";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { WikiRepo } from "./wiki-repo.js";

/** Construct a WikiRepo from CLI values and the working directory. */
export async function buildRepo(values, cwd = process.cwd()) {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, { cwd: () => cwd });
  const projectRoot = finder.findProjectRoot(cwd);
  const wikiDir = path.resolve(projectRoot, values["wiki-root"] ?? "wiki");

  const config = await createScriptConfig("wiki");
  return new WikiRepo({
    wikiDir,
    parentDir: projectRoot,
    resolveToken: () => config.ghToken(),
  });
}
