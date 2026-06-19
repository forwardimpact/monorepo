/**
 * Posture — read/write the adoption-posture record and resolve the
 * draft-side deny set from the skill-posture manifest.
 *
 * The two committed posture strings are the only valid values; they appear
 * verbatim in CLI flags, `status` output, and landing-page copy.
 */

/** The two adoption postures, in the order the spec commits them. */
export const POSTURES = ["brief", "brief+draft"];

/** Default for a posture-less read (interim window / fresh-read fallback). */
export const DEFAULT_POSTURE = "brief";

/**
 * Read the recorded posture from disk.
 * @param {import("@forwardimpact/libutil/runtime").Runtime["fs"]} fs
 * @param {string} posturePath - Path to `posture.json`.
 * @returns {Promise<"brief"|"brief+draft"|null>} The recorded posture, or
 *   `null` when the file is absent or its contents are not a committed string.
 */
export async function readPosture(fs, posturePath) {
  try {
    const raw = JSON.parse(await fs.readFile(posturePath, "utf8"));
    return POSTURES.includes(raw?.posture) ? raw.posture : null;
  } catch {
    return null;
  }
}

/**
 * Persist a posture to disk. The record is its own file so the wake path can
 * open it read-only and never alter the recorded posture.
 * @param {import("@forwardimpact/libutil/runtime").Runtime["fs"]} fs
 * @param {string} posturePath - Path to `posture.json`.
 * @param {string} value - Must be one of {@link POSTURES}.
 * @returns {Promise<void>}
 */
export async function writePosture(fs, posturePath, value) {
  if (!POSTURES.includes(value)) {
    throw new Error(
      `invalid posture "${value}"; expected one of ${POSTURES.join(", ")}`,
    );
  }
  await fs.writeFile(posturePath, JSON.stringify({ posture: value }) + "\n");
}

/**
 * Resolve the effective posture, applying the default when no posture has been
 * recorded so a posture-less install behaves as `brief`.
 * @param {"brief"|"brief+draft"|null} stored
 * @returns {"brief"|"brief+draft"}
 */
export function effectivePosture(stored) {
  return stored ?? DEFAULT_POSTURE;
}

/**
 * Load the skill-posture membership manifest.
 * @param {import("@forwardimpact/libutil/runtime").Runtime["fs"]} fs
 * @param {string} manifestPath - Path to `skill-postures.json`.
 * @returns {Promise<Record<string, "brief"|"draft">>}
 */
export async function loadManifest(fs, manifestPath) {
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

/**
 * The skills the manifest classifies as draft-side.
 * @param {Record<string, "brief"|"draft">} manifest
 * @returns {string[]} Skill names whose class is `"draft"`.
 */
export function draftSkills(manifest) {
  return Object.entries(manifest)
    .filter(([, cls]) => cls === "draft")
    .map(([name]) => name);
}
