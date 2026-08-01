// The enumeration-drift engine: assert that every registered consumer's fenced
// enumeration block matches its source-of-truth set. The invariant kit injects
// this reusable mechanism as `kit.enumDrift.build/seed` and the
// `enumDriftRules` rule set. A repository's rule module then carries only the
// registry (a topics file) and a one-line delegation. The grammar (probes,
// extractors, consumer parser) lives in enum-drift-grammar.js. This module
// re-exports the grammar, so a single import reaches the whole engine. The kit
// passes filesystem access in (`fsSync`), which keeps this module clean under
// the ambient-deps invariant.

import { join } from "node:path";

import { parseConsumer, probeSource } from "./enum-drift-grammar.js";

export {
  bareSlug,
  checkContainment,
  deriveId,
  extractCount,
  extractCounts,
  extractList,
  normalizeToken,
  parseConsumer,
  parseTableRow,
  probeFsGlob,
  probeMdTable,
  probeSource,
  segmentToRegExp,
  VALID_PROPERTIES,
} from "./enum-drift-grammar.js";

// The engine expects a topics file to use this name beside the rule module.
// This label appears only as the display path on a registry-error finding.
const REGISTRY_LABEL = "enumeration-drift.topics.yml";

function expandProperty(property) {
  return property === "both" ? ["count", "list"] : [property];
}

// Index per-consumer required properties from one topic's consumers list.
function indexConsumers(topic, propsByConsumer) {
  for (const consumer of topic.consumers ?? []) {
    if (!propsByConsumer.has(consumer.path)) {
      propsByConsumer.set(consumer.path, new Map());
    }
    const map = propsByConsumer.get(consumer.path);
    for (const p of expandProperty(consumer.property)) {
      if (!map.has(topic.id)) map.set(topic.id, new Set());
      map.get(topic.id).add(p);
    }
  }
}

// Walk the registry topics. Probe each source and index the per-consumer
// required properties. Collect probe errors as registry subjects.
function indexRegistry(topics, root, fsSync, registrySubjects) {
  const expectedByTopic = new Map();
  const propsByConsumer = new Map();
  const knownTopics = new Set();
  for (const topic of topics) {
    if (!topic || typeof topic.id !== "string") {
      registrySubjects.push({
        path: REGISTRY_LABEL,
        error: "topic missing `id`",
      });
      continue;
    }
    knownTopics.add(topic.id);
    const probed = probeSource(topic.source, root, fsSync);
    if (probed.error) {
      registrySubjects.push({
        path: REGISTRY_LABEL,
        error: `topic \`${topic.id}\`: ${probed.error}`,
      });
    }
    expectedByTopic.set(topic.id, probed.error ? null : probed.set);
    indexConsumers(topic, propsByConsumer);
  }
  return { expectedByTopic, propsByConsumer, knownTopics };
}

// Emit assertion subjects for one consumer. The registry property is a
// required minimum. Beyond that, it asserts every well-formed fence it finds.
function consumerAssertions(cp, topicMap, records, expectedByTopic) {
  const out = [];
  for (const [topicId, props] of topicMap) {
    const expected = expectedByTopic.get(topicId);
    for (const property of props) {
      const matches = records.filter(
        (r) => r.topic === topicId && r.property === property && !r.malformed,
      );
      if (matches.length === 0) {
        out.push({
          path: cp,
          topic: topicId,
          property,
          expected,
          fenceAbsent: true,
        });
        continue;
      }
      for (const match of matches) {
        out.push({
          path: cp,
          topic: topicId,
          property,
          expected,
          observed: match.observed,
          fenceAbsent: false,
          lineNo: match.lineNo,
        });
      }
    }
  }
  return out;
}

// Map one consumer's parsed records into fence subjects (unknown/malformed
// detection) under the known-topic set.
function fenceSubjects(cp, records, knownTopics) {
  return records.map((rec) => ({
    path: cp,
    topic: rec.topic ?? null,
    property: rec.property ?? null,
    lineNo: rec.lineNo,
    malformed: rec.malformed,
    known: rec.topic != null && knownTopics.has(rec.topic),
  }));
}

/**
 * Build subjects from a parsed registry: assertions (consumer×property),
 * fences, and registry errors. `registry` is the parsed topics object (e.g. the
 * kit's `config(topicsFile)`). A missing or malformed registry yields a single
 * registry-error subject. It does not throw.
 *
 * @param {{ registry: { topics?: object[] }|null, root: string, fsSync: object }} options
 * @returns {{ subjects: { assertion: object[], fence: object[], registry: object[] } }}
 */
export function buildSubjects({ registry, root, fsSync }) {
  if (!registry || !Array.isArray(registry.topics)) {
    return {
      subjects: {
        assertion: [],
        fence: [],
        registry: [
          {
            path: REGISTRY_LABEL,
            error:
              "cannot read the registry (expected a top-level `topics` list)",
          },
        ],
      },
    };
  }
  const registrySubjects = [];
  const { expectedByTopic, propsByConsumer, knownTopics } = indexRegistry(
    registry.topics,
    root,
    fsSync,
    registrySubjects,
  );
  const assertion = [];
  const fence = [];
  for (const [cp, topicMap] of propsByConsumer) {
    let records;
    try {
      records = parseConsumer(fsSync.readFileSync(join(root, cp), "utf8"));
    } catch (err) {
      registrySubjects.push({
        path: cp,
        error: `cannot read consumer: ${err.message}`,
      });
      continue;
    }
    fence.push(...fenceSubjects(cp, records, knownTopics));
    assertion.push(
      ...consumerAssertions(cp, topicMap, records, expectedByTopic),
    );
  }
  return { subjects: { assertion, fence, registry: registrySubjects } };
}

// --- seed() -----------------------------------------------------------------

function seedIndex(topics, root, fsSync) {
  const byConsumer = new Map();
  const expected = new Map();
  for (const topic of topics) {
    const probed = probeSource(topic.source, root, fsSync);
    expected.set(topic.id, probed.error ? null : probed.set);
    for (const consumer of topic.consumers ?? []) {
      if (!byConsumer.has(consumer.path)) byConsumer.set(consumer.path, []);
      for (const property of expandProperty(consumer.property)) {
        byConsumer.get(consumer.path).push({ topic: topic.id, property });
      }
    }
  }
  return { byConsumer, expected };
}

function seedBody(set, property) {
  if (set == null) return ["# (source probe failed)"];
  if (property === "count") return [`${set.size}`];
  return [...set].sort().map((id) => `- ${id}`);
}

/**
 * Render canonical fence bodies per consumer from current probe output, so an
 * author can paste a refreshed enumeration.
 *
 * @param {{ registry: { topics?: object[] }|null, root: string, fsSync: object }} options
 * @returns {string} The seed text.
 */
export function seedBodies({ registry, root, fsSync }) {
  if (!registry || !Array.isArray(registry.topics)) {
    return "# registry error: expected a top-level `topics` list\n";
  }
  const { byConsumer, expected } = seedIndex(registry.topics, root, fsSync);
  const out = [];
  for (const [path, claims] of byConsumer) {
    out.push(`# ${path}`);
    for (const { topic, property } of claims) {
      out.push(
        `<!-- enum:${topic}:${property} -->`,
        ...seedBody(expected.get(topic), property),
        "<!-- /enum -->",
      );
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

// --- rules ------------------------------------------------------------------

function symDiff(observed, expected) {
  const obs = observed instanceof Set ? observed : new Set();
  return {
    missing: [...expected].filter((x) => !obs.has(x)).sort(),
    extra: [...obs].filter((x) => !expected.has(x)).sort(),
  };
}

/**
 * The enumeration-drift rule set. The rule kit injects it into a rule module
 * as `enumDriftRules`. The rules render the subjects `buildSubjects` produces.
 */
export const ENUM_DRIFT_RULES = [
  {
    id: "enum.registry-invalid",
    scope: "registry",
    severity: "fail",
    check: (s) => (s.error ? { error: s.error } : null),
    message: (s, r) => `enumeration-drift registry/probe error :: ${r.error}`,
    hint: "fix the enumeration-drift topics file (or the source/consumer it points at) so the probe can resolve",
  },
  {
    id: "enum.fence-missing",
    scope: "assertion",
    severity: "fail",
    when: (s) => s.fenceAbsent,
    check: (s) => ({ topic: s.topic, property: s.property }),
    message: (s, r) => `${r.topic}:${r.property} :: required fence not found`,
    hint: "wrap the enumeration in <!-- enum:TOPIC:PROPERTY --> … <!-- /enum -->, and seed the body with `jidoka invariants --seed enumeration-drift`",
  },
  {
    id: "enum.unknown-topic",
    scope: "fence",
    severity: "fail",
    when: (s) => !s.malformed && s.topic !== null,
    check: (s) => (s.known ? null : { topic: s.topic }),
    message: (s, r) =>
      `${r.topic} :: unknown topic, so remove the fence or add the topic to the registry`,
    hint: "fence TOPIC must be one of the registry topic ids in the enumeration-drift topics file",
  },
  {
    id: "enum.malformed-fence",
    scope: "fence",
    severity: "fail",
    when: (s) => Boolean(s.malformed),
    check: (s) => ({ reason: s.malformed }),
    message: (s, r) => `malformed fence (${r.reason})`,
    hint: "write fences as <!-- enum:TOPIC:count|list --> … <!-- /enum -->, close every open fence, and put a number in a count span",
  },
  {
    id: "enum.list-drift",
    scope: "assertion",
    severity: "fail",
    when: (s) =>
      s.property === "list" && !s.fenceAbsent && s.expected instanceof Set,
    check: (s) => {
      const { missing, extra } = symDiff(s.observed, s.expected);
      return missing.length === 0 && extra.length === 0
        ? null
        : { topic: s.topic, missing, extra };
    },
    message: (s, r) =>
      `${r.topic}:list :: missing=[${r.missing.join(", ")}] extra=[${r.extra.join(", ")}]`,
    hint: "update the fenced list to match the source set, and seed with `jidoka invariants --seed enumeration-drift`",
  },
  {
    id: "enum.count-drift",
    scope: "assertion",
    severity: "fail",
    when: (s) =>
      s.property === "count" && !s.fenceAbsent && s.expected instanceof Set,
    check: (s) =>
      s.observed === s.expected.size
        ? null
        : { topic: s.topic, actual: s.observed, expected: s.expected.size },
    message: (s, r) =>
      `${r.topic}:count :: actual=${r.actual} expected=${r.expected}`,
    hint: "update the fenced count to match the source set size, and seed with `jidoka invariants --seed enumeration-drift`",
  },
];
