/**
 * KBManager — knowledge base init/update operations.
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("outpost");

/** Manage knowledge base lifecycle including initialization, updates, and settings merging. */
export class KBManager {
  #fs;

  /**
   * @param {{ existsSync: Function, mkdirSync: Function, copyFileSync: Function, cpSync: Function, readFileSync: Function, writeFileSync: Function, readdirSync: Function }} fs
   * @param {Function} logFn
   */
  constructor(fs, logFn) {
    if (!fs) throw new Error("fs is required");
    if (!logFn) throw new Error("logFn is required");
    this.#fs = fs;
  }

  /**
   * @param {string} dir
   */
  #ensureDir(dir) {
    this.#fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * @param {string} path
   * @param {*} fallback
   * @returns {*}
   */
  #readJSON(path, fallback) {
    try {
      return JSON.parse(this.#fs.readFileSync(path, "utf8"));
    } catch {
      return fallback;
    }
  }

  /**
   * @param {string} path
   * @param {*} data
   */
  #writeJSON(path, data) {
    this.#ensureDir(dirname(path));
    this.#fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  }

  /**
   * Copy bundled files (CLAUDE.md, skills, agents) from template to a KB.
   * @param {string} tpl - Path to the template directory
   * @param {string} dest - Path to the target knowledge base
   */
  copyBundledFiles(tpl, dest) {
    this.#fs.copyFileSync(join(tpl, "CLAUDE.md"), join(dest, "CLAUDE.md"));
    logger.info(`  Updated CLAUDE.md`);

    const lockSrc = join(tpl, "skills-lock.json");
    if (this.#fs.existsSync(lockSrc)) {
      this.#fs.copyFileSync(lockSrc, join(dest, "skills-lock.json"));
      logger.info(`  Updated skills-lock.json`);
    }

    this.mergeSettings(tpl, dest);

    for (const sub of ["skills", "agents"]) {
      const src = join(tpl, ".claude", sub);
      if (!this.#fs.existsSync(src)) continue;
      this.#fs.cpSync(src, join(dest, ".claude", sub), { recursive: true });
      const entries = this.#fs
        .readdirSync(src, { withFileTypes: true })
        .filter((d) =>
          sub === "skills" ? d.isDirectory() : d.name.endsWith(".md"),
        );
      const names = entries.map((d) =>
        sub === "agents" ? d.name.replace(".md", "") : d.name,
      );
      logger.info(`  Updated ${names.length} ${sub}: ${names.join(", ")}`);
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
   */
  mergeSettings(tpl, dest) {
    const src = join(tpl, ".claude", "settings.json");
    if (!this.#fs.existsSync(src)) return;

    const destPath = join(dest, ".claude", "settings.json");

    if (!this.#fs.existsSync(destPath)) {
      this.#ensureDir(join(dest, ".claude"));
      this.#fs.copyFileSync(src, destPath);
      logger.info(`  Created settings.json`);
      return;
    }

    const template = this.#readJSON(src, {});
    const existing = this.#readJSON(destPath, {});
    const added = this.#mergePermissionLists(
      template.permissions || {},
      (existing.permissions ||= {}),
    );

    if (added > 0) {
      this.#writeJSON(destPath, existing);
      logger.info(`  Updated settings.json (${added} new entries)`);
    } else {
      logger.info(`  Settings up to date`);
    }
  }

  /**
   * Initialize a new knowledge base
   * @param {string} targetPath
   * @param {string} templateDir
   */
  init(targetPath, templateDir) {
    const dest = this.#expandPath(targetPath);
    if (this.#fs.existsSync(join(dest, "CLAUDE.md"))) {
      console.error(`Knowledge base already exists at ${dest}`);
      process.exit(1);
    }

    this.#ensureDir(dest);
    for (const d of [
      "knowledge/People",
      "knowledge/Organizations",
      "knowledge/Projects",
      "knowledge/Topics",
      "knowledge/Briefings",
    ])
      this.#ensureDir(join(dest, d));

    this.#fs.copyFileSync(join(templateDir, "USER.md"), join(dest, "USER.md"));

    this.copyBundledFiles(templateDir, dest);

    logger.info(
      `Knowledge base initialized at ${dest}\n\nNext steps:\n  1. Edit ${dest}/USER.md with your name, email, and domain\n  2. cd ${dest} && npx skills experimental_install\n  3. claude`,
    );
  }

  /**
   * Update an existing knowledge base with the latest bundled files.
   * @param {string} targetPath
   * @param {string} templateDir
   */
  update(targetPath, templateDir) {
    const dest = this.#expandPath(targetPath);
    if (!this.#fs.existsSync(join(dest, "CLAUDE.md"))) {
      console.error(`No knowledge base found at ${dest}`);
      process.exit(1);
    }
    this.copyBundledFiles(templateDir, dest);
    logger.info(`\nKnowledge base updated: ${dest}`);
  }

  /**
   * @param {string} p
   * @returns {string}
   */
  #expandPath(p) {
    return p.startsWith("~/") ? join(homedir(), p.slice(2)) : resolve(p);
  }
}

/**
 * Create a KBManager with real fs dependencies
 * @param {Function} logFn
 * @returns {KBManager}
 */
export function createKBManager(logFn) {
  return new KBManager(
    {
      existsSync,
      mkdirSync,
      copyFileSync,
      cpSync,
      readFileSync,
      writeFileSync,
      readdirSync,
    },
    logFn,
  );
}
