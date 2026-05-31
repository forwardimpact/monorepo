import { join } from "path";

/** Recursively collect all paths (files and directories) under `dir`, relative to `dir`. */
export async function collectPaths(dir, prefix = ".", fs) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const rel = prefix + "/" + entry.name;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(rel);
      result.push(...(await collectPaths(abs, rel, fs)));
    } else {
      result.push(rel);
    }
  }
  return result;
}

/** Set mtime and atime to the Unix epoch for every entry under `dir`. */
export async function resetTimestamps(dir, fs) {
  // Epoch 0 (seconds) — a deterministic constant, not the ambient clock, so a
  // packed tree is byte-identical regardless of when it was staged.
  const epoch = 0;
  const paths = await collectPaths(dir, ".", fs);
  for (const rel of paths) {
    await fs.utimes(join(dir, rel), epoch, epoch);
  }
  await fs.utimes(dir, epoch, epoch);
}

/** Stringify JSON with recursively sorted object keys for deterministic output. */
export function stringifySorted(value) {
  const seen = new WeakSet();
  const sort = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) throw new Error("Cannot stringify circular structure");
    seen.add(v);
    if (Array.isArray(v)) return v.map(sort);
    const out = {};
    for (const key of Object.keys(v).sort()) out[key] = sort(v[key]);
    return out;
  };
  return JSON.stringify(sort(value), null, 2) + "\n";
}

/** Collect all file paths (no dirs) under `dir`, relative to `dir`, sorted. */
export async function collectFiles(dir, fs, prefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const rel = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      result.push(...(await collectFiles(join(dir, entry.name), fs, rel)));
    } else {
      result.push(rel);
    }
  }
  return result.sort();
}

/** Parse YAML frontmatter from a SKILL.md file. */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

/** Build a skill index entry from a staged skill directory. */
export async function buildSkillEntry(skillDir, name, fs) {
  const skillMd = await fs.readFile(join(skillDir, "SKILL.md"), "utf-8");
  const fm = parseFrontmatter(skillMd);
  const files = await collectFiles(skillDir, fs);
  return { description: fm.description || "", files, name };
}
