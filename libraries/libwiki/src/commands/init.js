import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fsAsync from "node:fs/promises";
import { Finder } from "@forwardimpact/libutil";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { WikiRepo } from "../wiki-repo.js";
import { listSkills } from "../skill-roster.js";

/** Resolve the wiki clone URL. Honors the FIT_WIKI_URL env var as an explicit override (for sandboxed environments where `origin` is rewritten to a local proxy that does not serve wiki repos); otherwise derives the URL by appending `.wiki.git` to the parent repo's `origin` remote. */
export function deriveWikiUrl(parentDir) {
  if (process.env.FIT_WIKI_URL) return process.env.FIT_WIKI_URL;

  const r = spawnSync("git", ["-C", parentDir, "remote", "get-url", "origin"], {
    encoding: "utf-8",
    stdio: "pipe",
  });
  if (r.status !== 0) return null;
  const origin = r.stdout.trim();
  const base = origin.replace(/\.git$/, "");
  return base + ".wiki.git";
}

/** Clone the wiki if not already present (URL derived from origin remote), copy git identity from the parent repo, and create metric directories for each kata skill. */
export async function runInitCommand(values, _args, cli) {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  const projectRoot = finder.findProjectRoot(process.cwd());

  const wikiDir = path.resolve(projectRoot, values["wiki-root"] ?? "wiki");
  const skillsDir = path.resolve(
    projectRoot,
    values["skills-dir"] ?? path.join(".claude", "skills"),
  );

  const wikiUrl = deriveWikiUrl(projectRoot);
  if (!wikiUrl) {
    process.stderr.write(
      "init: could not determine wiki URL from origin remote\n",
    );
    return;
  }

  const config = await createScriptConfig("wiki");
  const repo = new WikiRepo({
    wikiDir,
    parentDir: projectRoot,
    resolveToken: () => config.ghToken(),
  });

  const cloneResult = repo.ensureCloned(wikiUrl);
  if (!cloneResult.cloned) {
    process.stderr.write("init: could not clone wiki, skipping\n");
    return;
  }

  repo.inheritIdentity();

  const skills = listSkills({ skillsDir });
  for (const slug of skills) {
    mkdirSync(path.join(wikiDir, "metrics", slug), { recursive: true });
  }

  process.stdout.write(`init: wiki ready at ${wikiDir}\n`);
}
