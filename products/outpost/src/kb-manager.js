/**
 * KBManager — knowledge base init/update operations.
 */

import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "@forwardimpact/libtelemetry";

/** Manage knowledge base lifecycle including initialization, updates, and settings merging. */
export class KBManager {
  #fs;
  #logger;

  /**
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
   *   Injected runtime bag (uses `fs` (async)).
   * @param {Function} logFn
   */
  constructor(runtime, logFn) {
    if (!runtime?.fs) throw new Error("runtime.fs is required");
    if (!logFn) throw new Error("logFn is required");
    this.#fs = runtime.fs;
    this.#logger = createLogger("outpost", runtime);
  }

  /**
   * Resolve a knowledge-base name to its path under the XDG data home,
   * `~/.local/share/fit/outpost/<name>`. The argument is a single path segment,
   * never an arbitrary filesystem path, so a provisioned KB always lands outside
   * TCC-protected folders. The name is validated — not sanitised — against the
   * same rule as `agent-path.js`: a name carrying `/`, `\`, `..`, NUL, or a
   * leading `~` could steer the KB back inside `~/Documents`, reopening the TCC
   * hole, so it is rejected rather than rewritten.
   * @param {string} name - The KB name (e.g. `Team`, `personal`).
   * @returns {string} Absolute path under the data home.
   * @throws {Error} when `name` is empty, non-string, or an unsafe segment.
   */
  static kbPathForName(name) {
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      name.includes("/") ||
      name.includes("\\") ||
      name.includes("..") ||
      name.includes("\0") ||
      name.startsWith("~")
    ) {
      throw new Error(`unsafe KB name: ${JSON.stringify(name)}`);
    }
    return join(homedir(), ".local/share/fit/outpost", name);
  }

  /**
   * Test whether a path exists, via the async fs surface.
   * @param {string} p
   * @returns {Promise<boolean>}
   */
  async #exists(p) {
    return this.#fs.access(p).then(
      () => true,
      () => false,
    );
  }

  /**
   * @param {string} dir
   * @returns {Promise<void>}
   */
  async #ensureDir(dir) {
    await this.#fs.mkdir(dir, { recursive: true });
  }

  /**
   * @param {string} path
   * @param {*} fallback
   * @returns {Promise<*>}
   */
  async #readJSON(path, fallback) {
    try {
      return JSON.parse(await this.#fs.readFile(path, "utf8"));
    } catch {
      return fallback;
    }
  }

  /**
   * @param {string} path
   * @param {*} data
   * @returns {Promise<void>}
   */
  async #writeJSON(path, data) {
    await this.#ensureDir(dirname(path));
    await this.#fs.writeFile(path, JSON.stringify(data, null, 2) + "\n");
  }

  /**
   * Copy bundled files (CLAUDE.md, skills, agents) from template to a KB.
   * @param {string} tpl - Path to the template directory
   * @param {string} dest - Path to the target knowledge base
   * @returns {Promise<void>}
   */
  async copyBundledFiles(tpl, dest) {
    await this.#fs.copyFile(join(tpl, "CLAUDE.md"), join(dest, "CLAUDE.md"));
    this.#logger.info(`  Updated CLAUDE.md`);

    const apmSrc = join(tpl, "apm.yml");
    if (await this.#exists(apmSrc)) {
      await this.#fs.copyFile(apmSrc, join(dest, "apm.yml"));
      this.#logger.info(`  Updated apm.yml`);
    }

    await this.mergeSettings(tpl, dest);

    for (const sub of ["skills", "agents"]) {
      const src = join(tpl, ".claude", sub);
      if (!(await this.#exists(src))) continue;
      await this.#fs.cp(src, join(dest, ".claude", sub), { recursive: true });
      const entries = (
        await this.#fs.readdir(src, { withFileTypes: true })
      ).filter((d) =>
        sub === "skills" ? d.isDirectory() : d.name.endsWith(".md"),
      );
      const names = entries.map((d) =>
        sub === "agents" ? d.name.replace(".md", "") : d.name,
      );
      this.#logger.info(
        `  Updated ${names.length} ${sub}: ${names.join(", ")}`,
      );
    }
  }

  /**
   * Merge new entries from a template permission list into an existing one.
   * @param {Object} templatePerms - Template permissions object
   * @param {Object} existingPerms - Existing permissions object (mutated)
   * @returns {number} Number of entries added
   */
  #mergePermissionLists(templatePerms, existingPerms) {
    let added = 0;
    for (const key of ["allow", "deny", "additionalDirectories"]) {
      if (!templatePerms[key]?.length) continue;
      const set = new Set((existingPerms[key] ||= []));
      for (const entry of templatePerms[key]) {
        if (!set.has(entry)) {
          existingPerms[key].push(entry);
          set.add(entry);
          added++;
        }
      }
    }
    if (templatePerms.defaultMode && !existingPerms.defaultMode) {
      existingPerms.defaultMode = templatePerms.defaultMode;
      added++;
    }
    return added;
  }

  /**
   * Merge template settings.json into the destination's settings.json.
   * @param {string} tpl - Template directory
   * @param {string} dest - Knowledge base directory
   * @returns {Promise<void>}
   */
  async mergeSettings(tpl, dest) {
    const src = join(tpl, ".claude", "settings.json");
    if (!(await this.#exists(src))) return;

    const destPath = join(dest, ".claude", "settings.json");

    if (!(await this.#exists(destPath))) {
      await this.#ensureDir(join(dest, ".claude"));
      await this.#fs.copyFile(src, destPath);
      this.#logger.info(`  Created settings.json`);
      return;
    }

    const template = await this.#readJSON(src, {});
    const existing = await this.#readJSON(destPath, {});
    const added = this.#mergePermissionLists(
      template.permissions || {},
      (existing.permissions ||= {}),
    );

    if (added > 0) {
      await this.#writeJSON(destPath, existing);
      this.#logger.info(`  Updated settings.json (${added} new entries)`);
    } else {
      this.#logger.info(`  Settings up to date`);
    }
  }

  /**
   * Initialize a new knowledge base.
   * @param {string} targetPath
   * @param {string} templateDir
   * @returns {Promise<{ok: true, value: {dest: string}} | {ok: false, code: number, error: string}>}
   */
  async init(targetPath, templateDir) {
    const dest = this.#expandPath(targetPath);
    if (await this.#exists(join(dest, "CLAUDE.md"))) {
      return {
        ok: false,
        code: 1,
        error: `Knowledge base already exists at ${dest}`,
      };
    }

    await this.#ensureDir(dest);
    // Create the top-level roots only. `Knowledge/` is the shared graph (synced
    // with the team); `Drafts/` and `Briefings/` are personal and local. Entity
    // subdirectories (People, Organizations, ...) are created on demand by the
    // skills that write into them.
    for (const d of ["Knowledge", "Drafts", "Briefings"])
      await this.#ensureDir(join(dest, d));

    await this.copyBundledFiles(templateDir, dest);

    this.#logger.info(
      `Knowledge base initialized at ${dest}\n\nNext steps:\n  1. cd ${dest} && npx apm install\n  2. claude\n  3. Run the person-identify skill to populate your identity`,
    );
    return { ok: true, value: { dest } };
  }

  /**
   * Update an existing knowledge base with the latest bundled files.
   * @param {string} targetPath
   * @param {string} templateDir
   * @returns {Promise<{ok: true, value: {dest: string}} | {ok: false, code: number, error: string}>}
   */
  async update(targetPath, templateDir) {
    const dest = this.#expandPath(targetPath);
    if (!(await this.#exists(join(dest, "CLAUDE.md")))) {
      return {
        ok: false,
        code: 1,
        error: `No knowledge base found at ${dest}`,
      };
    }
    await this.copyBundledFiles(templateDir, dest);
    this.#logger.info(`\nKnowledge base updated: ${dest}`);
    return { ok: true, value: { dest } };
  }

  /**
   * @param {string} p
   * @returns {string}
   */
  #expandPath(p) {
    return p.startsWith("~/") ? join(homedir(), p.slice(2)) : resolve(p);
  }
}
