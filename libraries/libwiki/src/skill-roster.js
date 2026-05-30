import path from "node:path";

/**
 * List all kata-prefixed skill directory names under the skills directory,
 * sorted alphabetically.
 * @param {{skillsDir: string}} dirs
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 */
export function listSkills({ skillsDir }, fs) {
  const entries = fs.readdirSync(skillsDir);
  const skills = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    if (!entry.startsWith("kata-")) continue;
    const fullPath = path.join(skillsDir, entry);
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) continue;
    skills.push(entry);
  }

  return skills.sort();
}
