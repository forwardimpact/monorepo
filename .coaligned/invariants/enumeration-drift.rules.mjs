// Invariant: enumeration-drift — every registered consumer's fenced enumeration
// block must match its source-of-truth set. The engine (source probes, the
// list/count extractors, the consumer parser, the build/seed orchestration, and
// the rule set) is baked into libcoaligned's invariant kit and injected here as
// `kit.enumDrift` and `kit.enumDriftRules`; this module carries only policy —
// the registry of topics beside it. This file is config (outside the
// ambient-deps src scope), so it stays free of imports: the host binds the kit.
// Registry: enumeration-drift.topics.yml. A 7th topic is a one-file edit there.
// Refresh fence bodies: bunx coaligned invariants --seed enumeration-drift

const TOPICS = "enumeration-drift.topics.yml";

export default {
  name: "enumeration-drift",
  build: (kit) => kit.enumDrift.build(kit.config(TOPICS)),
  seed: (kit) => kit.enumDrift.seed(kit.config(TOPICS)),
  rules: (kit) => kit.enumDriftRules,
};
