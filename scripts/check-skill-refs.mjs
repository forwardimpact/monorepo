#!/usr/bin/env node
// Skill ref lint driver (spec 1720). Walks the skill content under
// `.claude/skills/`, extracts GitHub Action references, and validates each
// against reality with `git ls-remote` behind the two-stage reachability gate.
//
// Wires the pure libskill modules (extractor, allowlist, anchoring, linter)
// into a real resolver built on two libutil GitClients — a token-bearing one
// for internal skills and an anonymous one for published (`fit-*`/`kata-*`)
// skills and the reachability gate. `GH_TOKEN` is optional; absent (e.g. a
// fork PR) means internal private refs read as findings, per design § Risks.
//
// Usage: check-skill-refs.mjs [--root <dir>]
// Exit codes: 0 clean, 1 findings, 2 reality unreachable.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

import { createDefaultRuntime, GitClient } from "@forwardimpact/libutil";
import {
  extractRefs,
  buildPlaceholderAllowlist,
  createGitResolver,
  lintActionRefs,
} from "@forwardimpact/libskill";

function parseArgs(argv) {
  let root = resolve(import.meta.dirname, "..");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") root = resolve(argv[++i]);
  }
  return { root };
}

// Collect the skill content files: each skill directory's `SKILL.md` plus every
// markdown file under its `references/`.
function collectSkillFiles(root) {
  const skillsDir = join(root, ".claude", "skills");
  if (!existsSync(skillsDir)) return [];
  const files = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(skillsDir, entry.name);
    const skillMd = join(dir, "SKILL.md");
    if (existsSync(skillMd)) {
      files.push({
        path: `.claude/skills/${entry.name}/SKILL.md`,
        text: readFileSync(skillMd, "utf8"),
      });
    }
    const refsDir = join(dir, "references");
    if (existsSync(refsDir)) {
      walkMarkdown(refsDir, `.claude/skills/${entry.name}/references`, files);
    }
  }
  return files;
}

function walkMarkdown(absDir, relDir, files) {
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      walkMarkdown(abs, rel, files);
    } else if (entry.name.endsWith(".md")) {
      files.push({ path: rel, text: readFileSync(abs, "utf8") });
    }
  }
}

async function main() {
  const { root } = parseArgs(process.argv.slice(2));

  const files = collectSkillFiles(root);
  const refs = extractRefs(files);
  const allowlist = buildPlaceholderAllowlist(refs);

  // A runtime whose proc.env disables git's terminal prompt, preserving the
  // injection seam (the client reads env from the runtime, not process.env).
  const runtime = createDefaultRuntime({
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const authedGit = new GitClient({ runtime, token: process.env.GH_TOKEN });
  const anonGit = new GitClient({ runtime });
  const { resolve: resolver } = createGitResolver({ authedGit, anonGit });

  const findings = await lintActionRefs({ refs, allowlist, resolve: resolver });

  if (findings.length === 1 && findings[0].kind === "unreachable") {
    process.stderr.write(
      "skill ref lint: reality unreachable (GitHub could not be reached); not a pass\n",
    );
    process.exit(2);
  }

  if (findings.length === 0) {
    process.stdout.write("skill ref lint: 0 findings\n");
    process.exit(0);
  }

  for (const f of findings) {
    process.stdout.write(`${f.file}:${f.line} — ${f.ref} — ${f.reason}\n`);
  }
  process.stderr.write(`skill ref lint: ${findings.length} finding(s)\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`skill ref lint: ${err.stack || err}\n`);
  process.exit(2);
});
