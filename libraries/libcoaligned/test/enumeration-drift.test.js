import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import mod from "../../../.coaligned/invariants/enumeration-drift.rules.mjs";
import { buildSubjects, ENUM_DRIFT_RULES } from "../src/enum-drift.js";
import { fsSync } from "./helpers.js";

// --- Rule firing over crafted subjects --------------------------------------

function ruleById(id) {
  return ENUM_DRIFT_RULES.find((r) => r.id === id);
}

function fires(rule, subject, ctx = {}) {
  if (rule.when && !rule.when(subject, ctx)) return null;
  return rule.check(subject, ctx);
}

describe("rules fire on drift and stay silent on clean", () => {
  test("enum.registry-invalid", () => {
    const rule = ruleById("enum.registry-invalid");
    assert.ok(fires(rule, { error: "boom" }));
    assert.equal(fires(rule, {}), null);
  });

  test("enum.fence-missing", () => {
    const rule = ruleById("enum.fence-missing");
    assert.ok(fires(rule, { fenceAbsent: true, topic: "t", property: "list" }));
    assert.equal(fires(rule, { fenceAbsent: false }), null);
  });

  test("enum.unknown-topic", () => {
    const rule = ruleById("enum.unknown-topic");
    assert.ok(fires(rule, { topic: "typo", known: false }));
    assert.equal(fires(rule, { topic: "services-tree", known: true }), null);
    assert.equal(
      fires(rule, { topic: "x", known: false, malformed: "bad" }),
      null,
    );
  });

  test("enum.malformed-fence", () => {
    const rule = ruleById("enum.malformed-fence");
    assert.ok(fires(rule, { malformed: "unclosed fence" }));
    assert.equal(fires(rule, { malformed: undefined }), null);
  });

  test("enum.list-drift symmetric difference", () => {
    const rule = ruleById("enum.list-drift");
    const expected = new Set(["a", "b"]);
    const clean = fires(rule, {
      property: "list",
      fenceAbsent: false,
      observed: new Set(["a", "b"]),
      expected,
    });
    assert.equal(clean, null);
    const drift = fires(rule, {
      property: "list",
      fenceAbsent: false,
      observed: new Set(["a", "c"]),
      expected,
    });
    assert.deepEqual(drift.missing, ["b"]);
    assert.deepEqual(drift.extra, ["c"]);
  });

  test("enum.count-drift integer delta", () => {
    const rule = ruleById("enum.count-drift");
    const expected = new Set(["a", "b", "c"]);
    assert.equal(
      fires(rule, {
        property: "count",
        fenceAbsent: false,
        observed: 3,
        expected,
      }),
      null,
    );
    const drift = fires(rule, {
      property: "count",
      fenceAbsent: false,
      observed: 2,
      expected,
    });
    assert.equal(drift.actual, 2);
    assert.equal(drift.expected, 3);
  });
});

describe("module shape + engine over the live repo", () => {
  test("default export satisfies the host contract", () => {
    assert.equal(mod.name, "enumeration-drift");
    assert.equal(typeof mod.build, "function");
    assert.equal(typeof mod.seed, "function");
    // rules is a function that returns the injected rule set.
    assert.equal(typeof mod.rules, "function");
    assert.equal(
      mod.rules({ enumDriftRules: ENUM_DRIFT_RULES }),
      ENUM_DRIFT_RULES,
    );
  });

  test("build delegates to kit.config + kit.enumDrift.build", () => {
    let configArg;
    let buildArg;
    const sentinel = { subjects: { assertion: [], fence: [], registry: [] } };
    const kit = {
      config: (name) => {
        configArg = name;
        return { topics: [] };
      },
      enumDrift: {
        build: (registry) => {
          buildArg = registry;
          return sentinel;
        },
      },
    };
    const out = mod.build(kit);
    assert.equal(configArg, "enumeration-drift.topics.yml");
    assert.deepEqual(buildArg, { topics: [] });
    assert.equal(out, sentinel);
  });

  test("engine over the live repo produces no drift findings", () => {
    const root = join(import.meta.dirname, "../../..");
    const registry = parseYaml(
      readFileSync(
        join(root, ".coaligned/invariants/enumeration-drift.topics.yml"),
        "utf8",
      ),
    );
    assert.equal(registry.topics.length, 6);
    const { subjects } = buildSubjects({ registry, root, fsSync });
    // Every assertion subject must have a present, matching fence.
    for (const s of subjects.assertion) {
      assert.equal(
        s.fenceAbsent,
        false,
        `missing fence: ${s.path} ${s.topic}:${s.property}`,
      );
      if (s.property === "count") {
        assert.equal(s.observed, s.expected.size, `${s.path} ${s.topic} count`);
      } else {
        assert.deepEqual(
          [...s.observed].sort(),
          [...s.expected].sort(),
          `${s.path} ${s.topic} list`,
        );
      }
    }
    // No malformed / unknown-topic fences in registered consumers.
    for (const f of subjects.fence) {
      assert.equal(f.malformed, undefined, `malformed fence: ${f.path}`);
      assert.equal(f.known, true, `unknown topic: ${f.path} ${f.topic}`);
    }
    assert.equal(subjects.registry.length, 0);
  });
});
