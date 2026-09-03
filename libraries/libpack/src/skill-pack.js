import { basename, join, posix } from "path";

import { APM_AGENTS_DIR, APM_SKILLS_DIR, apmAgentFilename } from "./layout.js";

const LICENSE = "Apache-2.0";
const AUTHOR = "forwardimpact";

/**
 * Publish a monorepo skill pack into a sibling repository's working tree.
 * Use APM's canonical `.apm/` source layout. A bare
 * `apm install <owner>/<repo>` then discovers and installs skills and agents
 * together.
 *
 * This is the single code path for the sibling-pack layout. The publish
 * workflow drives it through the `fit-pack` CLI. The same layout constants
 * back the Pathway git packs (see `PackStager.stageApmGit`).
 *
 * Shared references (`agents/x-*.md`) ship on demand. The publisher parses
 * the markdown links in every staged skill file and profile, follows links
 * between references, and stages only that closure. A pack never carries a
 * reference nothing in it cites.
 */
export class SkillPackPublisher {
  #fs;

  /** @param {{runtime?: object}} [opts] */
  constructor({ runtime } = {}) {
    if (!runtime) throw new Error("runtime is required");
    this.#fs = runtime.fs;
  }

  /**
   * Stage the pack into `targetDir`.
   *
   * @param {object} opts
   * @param {string} opts.sourceDir - Directory with `skills/` and `agents/`
   *   (the monorepo's `.claude` directory).
   * @param {string|string[]} opts.prefix - Skill directory prefix(es) to
   *   select. Each prefix selects `skills/<prefix>-*` plus the exact-name
   *   `skills/<prefix>` (e.g. `gemba` selects both `gemba` and `gemba-*`).
   *   This option has no effect when `all` is set.
   * @param {boolean} [opts.all] - Stage every skill in `sourceDir` regardless of
   *   prefix. Use when the source directory is itself the pack boundary (e.g. a
   *   product-local `.claude` whose skills share no common prefix).
   * @param {string} opts.targetDir - Sibling-repo working tree to write into.
   * @param {string} opts.name - APM package name (short name of the sibling
   *   repo).
   * @param {string} opts.version - Version to stamp into apm.yml and SKILL.md
   *   metadata.
   * @param {boolean} [opts.withAgents] - Also sync agent profiles.
   * @param {string} [opts.description] - apm.yml description.
   * @param {string} [opts.readmeTitle] - README H1.
   * @param {string} [opts.readmeIntro] - README intro paragraph.
   * @returns {Promise<{skills: object[], agents: object[], references: string[]}>}
   *   `references` lists the staged reference filenames (`x-*.md`).
   */
  async publish(opts) {
    await this.#clean(opts.targetDir);
    const { skills, skillDirs } = await this.#stageSkills(opts);
    const { agents, references } = await this.#stageAgentDir(opts, skillDirs);
    await this.#writeManifest(opts);
    await this.#writeReadme(opts, skills, agents);
    return { skills, agents, references };
  }

  /** Remove the pre-`.apm/` flat layout and any prior `.apm/` tree. */
  async #clean(targetDir) {
    const { rm } = this.#fs;
    const stale = [
      join(targetDir, "skills"),
      join(targetDir, "agents"),
      join(targetDir, APM_SKILLS_DIR),
      join(targetDir, APM_AGENTS_DIR),
    ];
    for (const path of stale) {
      await rm(path, { recursive: true, force: true });
    }
  }

  /**
   * Copy skills into `.apm/skills/` and inject frontmatter. Select
   * `skills/<prefix>` and `skills/<prefix>-*` for each prefix by default.
   * Select every skill when `all` is set.
   * @returns {Promise<{skills: object[], skillDirs: string[]}>} the README
   *   table rows and the staged skill directories.
   */
  async #stageSkills({ sourceDir, prefix, all, targetDir, version }) {
    const { mkdir, readdir, cp, readFile, writeFile } = this.#fs;
    const srcDir = join(sourceDir, "skills");
    const destDir = join(targetDir, APM_SKILLS_DIR);
    await mkdir(destDir, { recursive: true });

    const prefixes = [prefix ?? []].flat();
    const selected = (name) =>
      prefixes.some((p) => name === p || name.startsWith(`${p}-`));
    const dirs = (await readdir(srcDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && (all || selected(e.name)))
      .map((e) => e.name)
      .sort();

    const staged = [];
    const skillDirs = [];
    for (const name of dirs) {
      const skillDest = join(destDir, name);
      skillDirs.push(skillDest);
      await cp(join(srcDir, name), skillDest, { recursive: true });

      const skillMd = join(skillDest, "SKILL.md");
      const original = await readFile(skillMd, "utf-8");
      await writeFile(skillMd, injectFrontmatter(original, version), "utf-8");

      staged.push({
        name: frontmatterField(original, "name") || name,
        description: foldedField(original, "description"),
      });
    }
    return { skills: staged, skillDirs };
  }

  /**
   * Stage the flat `agents/*.md` directory into `.apm/agents/`. Partition
   * each file by frontmatter.
   *
   * A file is a **profile** when it carries both `name` and `description`
   * frontmatter. Claude Code's agent loader applies the same test. Every
   * other file is a **reference**. Profiles ship as `<stem>.agent.md` and
   * feed the agents table, but only when `withAgents` is set. A non-agent
   * pack ships no profiles.
   *
   * References ship flat as `<stem>.md` and never enter the agents table.
   * Only the references the pack cites ship. The publisher parses the
   * markdown links in every staged skill file and every staged profile, then
   * follows links between references to a fixpoint. So a skills-only pack
   * still carries the references its skills cite, and no pack carries a
   * reference nothing in it links.
   *
   * @param {object} opts - The publish options.
   * @param {string[]} skillDirs - The staged skill directories.
   * @returns {Promise<{agents: object[], references: string[]}>} the staged
   *   profiles (empty without agents) and the staged reference filenames.
   */
  async #stageAgentDir({ sourceDir, targetDir, withAgents }, skillDirs) {
    const { mkdir, writeFile } = this.#fs;
    const destDir = join(targetDir, APM_AGENTS_DIR);
    const { profiles, references } = await this.#readAgentDir(
      join(sourceDir, "agents"),
    );
    const roots = await this.#closureRoots(skillDirs);
    if (withAgents) {
      for (const content of profiles.values()) {
        roots.push({ content, inAgentsDir: true });
      }
    }
    const shipped = [...referenceClosure(roots, references)].sort();

    if (withAgents || shipped.length > 0) {
      await mkdir(destDir, { recursive: true });
    }
    const staged = [];
    if (withAgents) {
      for (const [file, content] of profiles) {
        const stem = basename(file, ".md");
        await writeFile(
          join(destDir, apmAgentFilename(stem)),
          content,
          "utf-8",
        );
        staged.push({
          name: frontmatterField(content, "name") || stem,
          description: foldedField(content, "description"),
        });
      }
    }
    for (const file of shipped) {
      await writeFile(join(destDir, file), references.get(file), "utf-8");
    }
    return { agents: staged, references: shipped };
  }

  /**
   * Read every `*.md` in `srcDir` and partition by frontmatter.
   * @param {string} srcDir
   * @returns {Promise<{profiles: Map<string, string>, references: Map<string, string>}>}
   *   filename → content, in sorted filename order.
   */
  async #readAgentDir(srcDir) {
    const { readdir, readFile } = this.#fs;
    const files = (await readdir(srcDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
    const profiles = new Map();
    const references = new Map();
    for (const file of files) {
      const content = await readFile(join(srcDir, file), "utf-8");
      (isProfile(content) ? profiles : references).set(file, content);
    }
    return { profiles, references };
  }

  /**
   * Read every markdown file under the staged skill directories. These are
   * the roots the reference closure starts from.
   * @param {string[]} skillDirs
   * @returns {Promise<Array<{content: string, inAgentsDir: boolean}>>}
   */
  async #closureRoots(skillDirs) {
    const roots = [];
    for (const dir of skillDirs) {
      for (const rel of await collectMarkdown(dir, this.#fs)) {
        roots.push({
          content: await this.#fs.readFile(join(dir, rel), "utf-8"),
          inAgentsDir: false,
        });
      }
    }
    return roots;
  }

  /** Write the APM package manifest. */
  async #writeManifest({ targetDir, name, version, description }) {
    const lines = [
      `name: ${name}`,
      `version: ${version}`,
      `description: >-`,
      `  ${description || ""}`,
      `author: ${AUTHOR}`,
      `license: ${LICENSE}`,
      `includes: auto`,
      ``,
    ];
    await this.#fs.writeFile(
      join(targetDir, "apm.yml"),
      lines.join("\n"),
      "utf-8",
    );
  }

  /** Write the README with the install command and the skill/agent tables. */
  async #writeReadme(opts, skills, agents) {
    const { targetDir, name, readmeTitle, readmeIntro, withAgents } = opts;
    const lines = [
      `# ${readmeTitle || name}`,
      ``,
      readmeIntro || "",
      ``,
      `## Install`,
      ``,
      `With [APM](https://microsoft.github.io/apm/):`,
      ``,
      "```bash",
      `apm install forwardimpact/${name}`,
      "```",
      ``,
      `## Available Skills`,
      ``,
      `| Skill | Description |`,
      `| --- | --- |`,
      ...skills.map((s) => `| **${s.name}** | ${s.description} |`),
    ];

    if (withAgents) {
      lines.push(
        ``,
        `## Available Agents`,
        ``,
        `| Agent | Description |`,
        `| --- | --- |`,
        ...agents.map((a) => `| **${a.name}** | ${a.description} |`),
      );
    }
    lines.push(``);
    await this.#fs.writeFile(
      join(targetDir, "README.md"),
      lines.join("\n"),
      "utf-8",
    );
  }
}

/**
 * Insert `license` and a `metadata` block (version + author) just before the
 * closing `---` of a SKILL.md's YAML frontmatter. Return the content
 * unchanged when it has no frontmatter.
 * @param {string} content
 * @param {string} version
 * @returns {string}
 */
export function injectFrontmatter(content, version) {
  const lines = content.split("\n");
  if (lines[0] !== "---") return content;
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) return content;
  lines.splice(
    close,
    0,
    `license: ${LICENSE}`,
    `metadata:`,
    `  version: "${version}"`,
    `  author: ${AUTHOR}`,
  );
  return lines.join("\n");
}

/**
 * A `.claude/agents/*.md` file is a **profile** when it carries both `name`
 * and `description` frontmatter. Claude Code's agent loader applies the same
 * test to decide what loads as an agent. Every other file is a **reference**.
 * @param {string} content
 * @returns {boolean}
 */
function isProfile(content) {
  return (
    /^name:[ \t]*\S/m.test(content) && /^description:[ \t]*\S/m.test(content)
  );
}

/**
 * Extract the targets of every markdown link in `content`. Cover inline
 * links (`[text](target)`) and reference definitions (`[label]: target`).
 * Strip a trailing `#fragment`, `?query`, and an optional `"title"`.
 * @param {string} content
 * @returns {string[]}
 */
export function markdownLinkTargets(content) {
  const targets = [];
  const inline = /\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g;
  const definition = /^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/gm;
  for (const re of [inline, definition]) {
    for (const match of content.matchAll(re)) {
      targets.push(match[1].replace(/[#?].*$/, ""));
    }
  }
  return targets;
}

/**
 * Resolve a link target to the shared reference it names, or `null`.
 *
 * References live flat in one `agents/` directory, but three link shapes
 * reach them: `.claude/agents/x-foo.md` (repo-root-relative, from a
 * profile), `../../agents/x-foo.md` (relative, from a skill), and
 * `x-foo.md` (bare, from a sibling reference or profile). The rule that
 * covers all three: the target's directory ends in `agents`, or the target
 * is a bare filename and the citing file itself lives in the agents dir. A
 * URL with a scheme never resolves. A skill-local `references/x-foo.md`
 * never resolves either.
 *
 * @param {string} target - A link target, fragment already stripped.
 * @param {boolean} inAgentsDir - Whether the citing file lives in `agents/`.
 * @returns {string|null} the reference filename (`x-foo.md`), or `null`.
 */
export function referenceTarget(target, inAgentsDir) {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  const file = posix.basename(target);
  if (!file.endsWith(".md")) return null;
  const dir = posix.dirname(target);
  if (dir === ".") return inAgentsDir ? file : null;
  return posix.basename(dir) === "agents" ? file : null;
}

/**
 * Compute the set of references the roots cite, transitively.
 *
 * Start from the links in every root. Each cited reference then contributes
 * its own links. Stop at the fixpoint. Only names present in `references`
 * enter the set, so a broken link never stages a file.
 *
 * @param {Array<{content: string, inAgentsDir: boolean}>} roots
 * @param {Map<string, string>} references - filename → content.
 * @returns {Set<string>}
 */
export function referenceClosure(roots, references) {
  const cited = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const { content, inAgentsDir } = queue.shift();
    for (const target of markdownLinkTargets(content)) {
      const file = referenceTarget(target, inAgentsDir);
      if (!file || cited.has(file) || !references.has(file)) continue;
      cited.add(file);
      queue.push({ content: references.get(file), inAgentsDir: true });
    }
  }
  return cited;
}

/** Recursively list every `.md` file under `dir`, relative to `dir`. */
async function collectMarkdown(dir, fs, prefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...(await collectMarkdown(join(dir, entry.name), fs, rel)));
    } else if (entry.name.endsWith(".md")) {
      result.push(rel);
    }
  }
  return result.sort();
}

/** Read a single-line frontmatter field value (first match), or "". */
function frontmatterField(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

/**
 * Read a frontmatter field that may be a folded block scalar (`>-`). Join
 * 2-space-indented continuation lines into one space-separated string.
 * @param {string} content
 * @param {string} key
 * @returns {string}
 */
function foldedField(content, key) {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(new RegExp(`^${key}:\\s*>?-?\\s*(.*)$`));
    if (!match) continue;
    let value = match[1];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s{2}\S/.test(lines[j])) {
        value += (value ? " " : "") + lines[j].trim();
      } else {
        break;
      }
    }
    return value.trim();
  }
  return "";
}
