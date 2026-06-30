import { basename, join } from "path";

import { APM_AGENTS_DIR, APM_SKILLS_DIR, apmAgentFilename } from "./layout.js";

const LICENSE = "Apache-2.0";
const AUTHOR = "forwardimpact";

/**
 * Publish a monorepo skill pack into a sibling repository's working tree using
 * APM's canonical `.apm/` source layout, so a bare `apm install <owner>/<repo>`
 * discovers and installs skills and agents together.
 *
 * This is the single code path for the sibling-pack layout: the publish
 * workflow drives it through the `fit-pack` CLI, and the same layout constants
 * back the Pathway git packs (see `PackStager.stageApmGit`).
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
   * @param {string} opts.sourceDir - Directory holding `skills/` and `agents/`
   *   (the monorepo's `.claude` directory).
   * @param {string} opts.prefix - Skill directory prefix to select (e.g. `kata`
   *   selects `skills/kata-*`).
   * @param {string} opts.targetDir - Sibling repo working tree to write into.
   * @param {string} opts.name - APM package name (sibling repo short name).
   * @param {string} opts.version - Stamped into apm.yml and SKILL.md metadata.
   * @param {boolean} [opts.withAgents] - Also sync agent profiles.
   * @param {string} [opts.description] - apm.yml description.
   * @param {string} [opts.readmeTitle] - README H1.
   * @param {string} [opts.readmeIntro] - README intro paragraph.
   * @returns {Promise<{skills: object[], agents: object[]}>}
   */
  async publish(opts) {
    await this.#clean(opts.targetDir);
    const skills = await this.#stageSkills(opts);
    const agents = await this.#stageAgentDir(opts);
    await this.#writeManifest(opts);
    await this.#writeReadme(opts, skills, agents);
    return { skills, agents };
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

  /** Copy `skills/<prefix>-*` into `.apm/skills/`, injecting frontmatter. */
  async #stageSkills({ sourceDir, prefix, targetDir, version }) {
    const { mkdir, readdir, cp, readFile, writeFile } = this.#fs;
    const srcDir = join(sourceDir, "skills");
    const destDir = join(targetDir, APM_SKILLS_DIR);
    await mkdir(destDir, { recursive: true });

    const dirs = (await readdir(srcDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name.startsWith(`${prefix}-`))
      .map((e) => e.name)
      .sort();

    const staged = [];
    for (const name of dirs) {
      const skillDest = join(destDir, name);
      await cp(join(srcDir, name), skillDest, { recursive: true });

      const skillMd = join(skillDest, "SKILL.md");
      const original = await readFile(skillMd, "utf-8");
      await writeFile(skillMd, injectFrontmatter(original, version), "utf-8");

      staged.push({
        name: frontmatterField(original, "name") || name,
        description: foldedField(original, "description"),
      });
    }
    return staged;
  }

  /**
   * Stage the flat `agents/*.md` directory into `.apm/agents/`, partitioning
   * each file by frontmatter.
   *
   * A file is a **profile** when it carries both `name` and `description`
   * frontmatter — the same test Claude Code's agent loader applies — and a
   * **reference** otherwise. Profiles ship as `<stem>.agent.md` and feed the
   * agents table, but only when `withAgents` is set (non-agent packs ship no
   * profiles). References always ship flat as `<stem>.md` and never enter the
   * agents table, so every pack carries the references skills and profiles
   * cite, agent-syncing or not.
   *
   * @returns {Promise<object[]>} the staged profiles (empty without agents).
   */
  async #stageAgentDir({ sourceDir, targetDir, withAgents }) {
    const { mkdir, readdir, readFile, writeFile } = this.#fs;
    const srcDir = join(sourceDir, "agents");
    const destDir = join(targetDir, APM_AGENTS_DIR);
    await mkdir(destDir, { recursive: true });

    const files = (await readdir(srcDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();

    const staged = [];
    for (const file of files) {
      const content = await readFile(join(srcDir, file), "utf-8");
      const stem = basename(file, ".md");
      if (isProfile(content)) {
        if (!withAgents) continue;
        await writeFile(join(destDir, apmAgentFilename(stem)), content, "utf-8");
        staged.push({
          name: frontmatterField(content, "name") || stem,
          description: foldedField(content, "description"),
        });
      } else {
        await writeFile(join(destDir, `${stem}.md`), content, "utf-8");
      }
    }
    return staged;
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

  /** Write the README with install command and skill/agent tables. */
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
 * closing `---` of a SKILL.md's YAML frontmatter. Content without frontmatter
 * is returned unchanged.
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
 * and `description` frontmatter — the test Claude Code's agent loader applies
 * to decide what loads as an agent — and a **reference** otherwise.
 * @param {string} content
 * @returns {boolean}
 */
function isProfile(content) {
  return Boolean(
    frontmatterField(content, "name") && frontmatterField(content, "description"),
  );
}

/** Read a single-line frontmatter field value (first match), or "". */
function frontmatterField(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

/**
 * Read a frontmatter field that may be a folded block scalar (`>-`), joining
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
