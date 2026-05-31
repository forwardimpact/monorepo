import { join } from "path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { buildSkillEntry, stringifySorted } from "./util.js";

const SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

/** Skill discovery index emitter (.well-known/skills/). */
export class DiscEmitter {
  #fs;

  /** @param {{runtime?: object}} [opts] */
  constructor({ runtime } = {}) {
    const rt = runtime ?? createDefaultRuntime();
    this.#fs = rt.fs;
  }

  /** Emit a per-pack skill discovery repository. */
  async emit(skillsSrcDir, outputPath) {
    const { mkdir, readdir, cp, writeFile } = this.#fs;
    const wellKnownDir = join(outputPath, ".well-known", "skills");
    await mkdir(wellKnownDir, { recursive: true });

    const skillDirs = (
      await readdir(skillsSrcDir, { withFileTypes: true })
    ).filter((e) => e.isDirectory());
    skillDirs.sort((a, b) => a.name.localeCompare(b.name));

    const entries = [];
    for (const dir of skillDirs) {
      const src = join(skillsSrcDir, dir.name);
      const dest = join(wellKnownDir, dir.name);
      await cp(src, dest, { recursive: true });
      entries.push(await buildSkillEntry(dest, dir.name, this.#fs));
    }

    const manifest = { $schema: SCHEMA, skills: entries };
    await writeFile(
      join(wellKnownDir, "index.json"),
      stringifySorted(manifest),
      "utf-8",
    );

    return entries;
  }

  /** Emit a deduplicated aggregate discovery index across all packs. */
  async emitAggregate(packsOutputDir, allPackEntries) {
    const { mkdir, cp, writeFile } = this.#fs;
    const wellKnownDir = join(packsOutputDir, ".well-known", "skills");
    await mkdir(wellKnownDir, { recursive: true });

    const seen = new Map();
    for (const { packName, entries } of allPackEntries) {
      for (const entry of entries) {
        if (seen.has(entry.name)) continue;
        seen.set(entry.name, { packName, entry });
      }
    }

    const skills = [];
    for (const [, { packName, entry }] of seen) {
      const dest = join(wellKnownDir, entry.name);
      const src = join(
        packsOutputDir,
        packName,
        ".well-known",
        "skills",
        entry.name,
      );
      await cp(src, dest, { recursive: true });
      skills.push(entry);
    }

    const manifest = { $schema: SCHEMA, skills };
    await writeFile(
      join(wellKnownDir, "index.json"),
      stringifySorted(manifest),
      "utf-8",
    );
  }
}
