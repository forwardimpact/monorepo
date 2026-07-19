import path from "node:path";
import { createLogger } from "@forwardimpact/libtelemetry";
import { ensureMetricsCsvMergeAttribute } from "../gitattributes.js";
import { listSkills } from "../skill-roster.js";
import { resolveProjectRoot, resolveWikiRoot } from "../util/wiki-dir.js";
import {
  ACTIVE_CLAIMS_HEADING,
  ACTIVE_CLAIMS_TABLE_HEADER,
  ACTIVE_CLAIMS_TABLE_SEPARATOR,
} from "../constants.js";

/** Resolve the wiki clone URL. Honors the FIT_WIKI_URL env var as an explicit override (for sandboxed environments where `origin` is rewritten to a local proxy that does not serve wiki repos); otherwise derives the URL by appending `.wiki.git` to the parent repo's `origin` remote. */
export async function deriveWikiUrl(gitClient, parentDir, env) {
  if (env.FIT_WIKI_URL) return env.FIT_WIKI_URL;
  try {
    const origin = await gitClient.remoteGetUrl("origin", { cwd: parentDir });
    if (!origin) return null;
    const base = origin.replace(/\.git$/, "");
    return base + ".wiki.git";
  } catch {
    return null;
  }
}

function scaffoldActiveClaims(runtime, memoryPath) {
  if (!runtime.fsSync.existsSync(memoryPath)) return false;
  const text = runtime.fsSync.readFileSync(memoryPath, "utf-8");
  if (new RegExp(`^${ACTIVE_CLAIMS_HEADING}$`, "m").test(text)) return false;

  const block = [
    "",
    ACTIVE_CLAIMS_HEADING,
    "",
    "In-flight work claimed by an agent. Row present = active; row absent = settled.",
    "Writers: `gemba-wiki claim`, `gemba-wiki release`. Reader: `gemba-wiki boot`.",
    "",
    ACTIVE_CLAIMS_TABLE_HEADER,
    ACTIVE_CLAIMS_TABLE_SEPARATOR,
    "| *None* | — | — | — | — | — |",
    "",
  ].join("\n");

  const lines = text.split("\n");
  const storyboardIdx = lines.findIndex((l) => l.trim() === "## Storyboard");
  if (storyboardIdx === -1) {
    runtime.fsSync.writeFileSync(
      memoryPath,
      text.replace(/\n*$/, "") + "\n" + block + "\n",
    );
    return true;
  }
  lines.splice(storyboardIdx, 0, ...block.split("\n"), "");
  runtime.fsSync.writeFileSync(memoryPath, lines.join("\n"));
  return true;
}

async function maybeCloneWiki(wikiSync, gitClient, projectRoot, runtime) {
  const logger = createLogger("wiki", runtime);
  const wikiUrl = await deriveWikiUrl(gitClient, projectRoot, runtime.proc.env);
  if (!wikiUrl) {
    logger.warn("init", "could not determine wiki URL from origin remote");
    return;
  }
  const cloneResult = await wikiSync.ensureCloned(wikiUrl);
  if (cloneResult.cloned) {
    await wikiSync.inheritIdentity();
  } else {
    logger.warn(
      "init",
      "could not clone wiki, continuing with local-only steps",
    );
  }
}

/** Clone the wiki if not already present, scaffold Active Claims in MEMORY.md, and create per-skill metric directories. */
export async function runInitCommand(ctx) {
  const { runtime, wikiSync, gitClient } = ctx.deps;
  const options = ctx.options;
  const projectRoot = resolveProjectRoot(runtime);

  const wikiDir = resolveWikiRoot(runtime, options);
  const skillsDir = path.resolve(
    projectRoot,
    options["skills-dir"] ?? path.join(".claude", "skills"),
  );

  await maybeCloneWiki(wikiSync, gitClient, projectRoot, runtime);

  if (runtime.fsSync.existsSync(skillsDir)) {
    for (const slug of listSkills({ skillsDir }, runtime.fsSync)) {
      runtime.fsSync.mkdirSync(path.join(wikiDir, "metrics", slug), {
        recursive: true,
      });
    }
  }

  if (runtime.fsSync.existsSync(wikiDir)) {
    const memoryPath = path.join(wikiDir, "MEMORY.md");
    if (scaffoldActiveClaims(runtime, memoryPath)) {
      runtime.proc.stdout.write(
        `init: scaffolded ${ACTIVE_CLAIMS_HEADING} in ${memoryPath}\n`,
      );
    }
    if (ensureMetricsCsvMergeAttribute(wikiDir, runtime.fsSync).changed) {
      runtime.proc.stdout.write(
        "init: declared metrics-CSV union merge in .gitattributes\n",
      );
    }
  }

  runtime.proc.stdout.write(`init: wiki ready at ${wikiDir}\n`);
  return { ok: true };
}
