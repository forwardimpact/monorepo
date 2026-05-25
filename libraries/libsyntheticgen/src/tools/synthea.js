/**
 * Synthea tool — generates FHIR R4 patient data via Java subprocess.
 */

import { join } from "path";

/** Generate synthetic FHIR R4 patient data by running the Synthea JAR via a Java subprocess. */
export class SyntheaTool {
  /**
   * @param {object} deps
   * @param {object} deps.logger
   * @param {string} deps.syntheaJar - Absolute path to synthea-with-dependencies.jar
   * @param {Function} deps.execFileFn - async (cmd, args) => { stdout }
   * @param {object} deps.fsFns - { readFile, readdir, mkdtemp, rm }
   */
  constructor({ logger, syntheaJar, execFileFn, fsFns }) {
    if (!logger) throw new Error("SyntheaTool requires logger");
    if (!syntheaJar) throw new Error("SyntheaTool requires syntheaJar");
    if (!execFileFn) throw new Error("SyntheaTool requires execFileFn");
    if (!fsFns) throw new Error("SyntheaTool requires fsFns");
    this.logger = logger;
    this.syntheaJar = syntheaJar;
    this.execFileFn = execFileFn;
    this.fsFns = fsFns;
  }

  /**
   * Check that Java and the Synthea jar are available.
   * @returns {Promise<boolean>}
   */
  async checkAvailability() {
    try {
      await this.execFileFn("java", ["-version"]);
      await this.fsFns.readFile(this.syntheaJar);
      return true;
    } catch {
      throw new Error(
        `Synthea requires Java and ${this.syntheaJar}. ` +
          "Run 'just synthea-install' to download the JAR, " +
          "or set SYNTHEA_JAR to a custom path.",
      );
    }
  }

  /**
   * Generate FHIR patient data, returning one dataset per resource type.
   * @param {object} config
   * @param {string} config.name - Dataset name from DSL
   * @param {number} [config.population=100] - Number of patients
   * @param {string[]} [config.modules] - Synthea modules to enable
   * @param {string[]} [config.conditions] - Clinical condition IDs to filter
   *   patients by, matched against `Condition.code.coding[].code` exactly or
   *   `.display` normalized to `lowercase_underscored` form (the DSL
   *   condition-id convention).
   * @param {number} config.seed - RNG seed
   * @returns {Promise<Dataset[]>}
   */
  async generate(config) {
    const tmpDir = await this.fsFns.mkdtemp("synthea-");
    const args = [
      "-jar",
      this.syntheaJar,
      "-p",
      String(config.population || 100),
      "-s",
      String(config.seed),
      "--exporter.fhir.export",
      "true",
      "--exporter.baseDirectory",
      tmpDir,
    ];
    if (config.modules) {
      for (const mod of config.modules) {
        args.push("-m", mod);
      }
    }

    this.logger.info(
      "synthea",
      `Running Synthea: population=${config.population || 100}`,
    );
    await this.execFileFn("java", args);

    // Read FHIR bundles from output
    const fhirDir = join(tmpDir, "fhir");
    const bundleFiles = (await this.fsFns.readdir(fhirDir)).filter((f) =>
      f.endsWith(".json"),
    );
    const bundles = await Promise.all(
      bundleFiles.map(async (f) =>
        JSON.parse(await this.fsFns.readFile(join(fhirDir, f), "utf-8")),
      ),
    );

    // Flatten bundles into datasets by resource type
    const byType = new Map();
    for (const bundle of bundles) {
      for (const entry of bundle.entry || []) {
        const resource = entry.resource;
        const type = resource.resourceType;
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type).push(resource);
      }
    }

    filterByConditions(byType, config.conditions);

    // Return one dataset per resource type
    const datasets = [];
    for (const [type, records] of byType) {
      datasets.push({
        name: `${config.name}_${type.toLowerCase()}`,
        schema: null,
        records,
        metadata: { tool: "synthea", resourceType: type },
      });
    }

    // Clean up
    await this.fsFns.rm(tmpDir, { recursive: true });

    return datasets;
  }
}

/**
 * Restrict the flattened FHIR resources to patients whose Condition entries
 * match one of the supplied clinical condition IDs. Matches on `code.coding[].code`
 * exactly, or `code.coding[].display` normalized to lowercase-underscored form
 * (the DSL convention).
 *
 * Mutates `byType` in place. No-op when conditions is empty/undefined, when
 * there are no FHIR Condition resources, or when no patients match (so a
 * mis-spelled condition does not silently drop the entire dataset).
 */
function filterByConditions(byType, conditions) {
  if (!conditions?.length) return;
  const patientType = byType.get("Patient");
  const conditionType = byType.get("Condition");
  if (!patientType || !conditionType) return;

  const matchedPatientIds = new Set();
  for (const cond of conditionType) {
    const coding = cond.code?.coding || [];
    const matches = coding.some(
      (c) =>
        conditions.includes(c.code) ||
        conditions.includes(c.display?.toLowerCase().replace(/\s+/g, "_")),
    );
    if (!matches) continue;
    const patientId = normalizePatientRef(cond.subject?.reference);
    if (patientId) matchedPatientIds.add(patientId);
  }
  if (matchedPatientIds.size === 0) return;

  for (const [type, records] of byType) {
    byType.set(
      type,
      records.filter((r) => {
        // Patient resources carry their own UUID in `id`. All other FHIR
        // resources (Condition, Encounter, Observation, ...) also carry their
        // own UUID in `id` — the link back to the patient lives on
        // `subject.reference`. Prefer the patient reference when present.
        const subjectId = normalizePatientRef(r.subject?.reference);
        if (subjectId) return matchedPatientIds.has(subjectId);
        if (type === "Patient") return matchedPatientIds.has(r.id);
        return true;
      }),
    );
  }
}

/**
 * Strip the `urn:uuid:` or `Patient/` prefix from a FHIR reference so
 * the bare patient id can be matched against records elsewhere in the
 * bundle. Exported so `buildFhirCrossRef` in `libsyntheticrender` keys
 * patients by the same id `filterByConditions` does.
 *
 * @param {string|undefined|null} ref - A FHIR reference (e.g.
 *   `Patient/<id>` or `urn:uuid:<id>`)
 * @returns {string|null} the bare id, or `null` when `ref` is empty
 */
export function normalizePatientRef(ref) {
  if (!ref) return null;
  return ref.replace(/^urn:uuid:/, "").replace(/^Patient\//, "");
}

/**
 * @param {object} deps
 * @returns {SyntheaTool}
 */
export function createSyntheaTool(deps) {
  return new SyntheaTool(deps);
}
