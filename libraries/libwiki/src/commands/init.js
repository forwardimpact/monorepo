import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fsAsync from "node:fs/promises";
import { Finder } from "@forwardimpact/libutil";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { WikiRepo } from "../wiki-repo.js";
import { listSkills } from "../skill-roster.js";
import {
  ACTIVE_CLAIMS_HEADING,
  ACTIVE_CLAIMS_TABLE_HEADER,
  ACTIVE_CLAIMS_TABLE_SEPARATOR,
} from "../constants.js";

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

function scaffoldActiveClaims(memoryPath) {
  if (!existsSync(memoryPath)) return false;
  const text = readFileSync(memoryPath, "utf-8");
  if (new RegExp(`^${ACTIVE_CLAIMS_HEADING}$`, "m").test(text)) return false;

  const block = [
    "",
    ACTIVE_CLAIMS_HEADING,
    "",
    "In-flight work claimed by an agent. Row present = active; row absent = settled.",
    "Writers: `fit-wiki claim`, `fit-wiki release`. Reader: `fit-wiki boot`.",
    "",
    ACTIVE_CLAIMS_TABLE_HEADER,
    ACTIVE_CLAIMS_TABLE_SEPARATOR,
    "| *None* | — | — | — | — | — |",
    "",
  ].join("\n");

  const lines = text.split("\n");
  const storyboardIdx = lines.findIndex((l) => l.trim() === "## Storyboard");
  if (storyboardIdx === -1) {
    writeFileSync(memoryPath, text.replace(/\n*$/, "") + "\n" + block + "\n");
    return true;
  }
  lines.splice(storyboardIdx, 0, ...block.split("\n"), "");
  writeFileSync(memoryPath, lines.join("\n"));
  return true;
}

const AUDIT_HOOK_COMMAND = "bunx fit-wiki audit";

function readSettings(settingsPath) {
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    process.stderr.write(
      `init: ${settingsPath} is not valid JSON; skipping stop-hook install\n`,
    );
    return null;
  }
}

function hasAuditHook(settings) {
  if (!settings.hooks || !Array.isArray(settings.hooks.Stop)) return false;
  for (const group of settings.hooks.Stop) {
    if (!group || !Array.isArray(group.hooks)) continue;
    if (
      group.hooks.some(
        (h) =>
          h &&
          typeof h.command === "string" &&
          h.command.includes("fit-wiki audit"),
      )
    ) {
      return true;
    }
  }
  return false;
}

function addAuditHook(settings) {
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];
  if (settings.hooks.Stop.length === 0) {
    settings.hooks.Stop.push({
      hooks: [{ type: "command", command: AUDIT_HOOK_COMMAND }],
    });
    return;
  }
  if (!Array.isArray(settings.hooks.Stop[0].hooks)) {
    settings.hooks.Stop[0].hooks = [];
  }
  settings.hooks.Stop[0].hooks.push({
    type: "command",
    command: AUDIT_HOOK_COMMAND,
  });
}

function installStopHook(settingsPath) {
  const settings = readSettings(settingsPath);
  if (settings === null) return false;
  if (hasAuditHook(settings)) return false;
  addAuditHook(settings);
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  return true;
}

async function maybeCloneWiki(projectRoot, wikiDir) {
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
  if (cloneResult.cloned) {
    repo.inheritIdentity();
  } else {
    process.stderr.write(
      "init: could not clone wiki, continuing with local-only steps\n",
    );
  }
}

/** Clone the wiki if not already present, scaffold Active Claims in MEMORY.md, install the audit Stop-hook, and create per-skill metric directories. */
export async function runInitCommand(values, _args, _cli) {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  const projectRoot = finder.findProjectRoot(process.cwd());

  const wikiDir = path.resolve(projectRoot, values["wiki-root"] ?? "wiki");
  const skillsDir = path.resolve(
    projectRoot,
    values["skills-dir"] ?? path.join(".claude", "skills"),
  );
  const settingsPath = path.resolve(projectRoot, ".claude", "settings.json");

  await maybeCloneWiki(projectRoot, wikiDir);

  if (existsSync(skillsDir)) {
    for (const slug of listSkills({ skillsDir })) {
      mkdirSync(path.join(wikiDir, "metrics", slug), { recursive: true });
    }
  }

  if (existsSync(wikiDir)) {
    const memoryPath = path.join(wikiDir, "MEMORY.md");
    if (scaffoldActiveClaims(memoryPath)) {
      process.stdout.write(
        `init: scaffolded ${ACTIVE_CLAIMS_HEADING} in ${memoryPath}\n`,
      );
    }
  }

  if (installStopHook(settingsPath)) {
    process.stdout.write(
      `init: installed Stop-hook audit entry in ${settingsPath}\n`,
    );
  }

  process.stdout.write(`init: wiki ready at ${wikiDir}\n`);
}
