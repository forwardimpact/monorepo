/**
 * Workflow-shape assertion for spec 990 § *Non-Landmark interviews are
 * not regressed*. Parses `.github/workflows/kata-interview.yml` as YAML
 * and verifies every step + every Run-interview env key added by spec
 * 990 carries a Landmark predicate, and the interview job declares a
 * timeout-minutes strictly less than the JWT's 1-hour default TTL.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "kata-interview.yml");

const wf = parse(readFileSync(WORKFLOW_PATH, "utf8"));
const steps = wf.jobs.interview.steps;

const ADDED_STEPS = ["Substrate stage", "Scan logs for sensitive values"];
// AGENT_CWD is the only key still set directly on the Run interview
// env block: it points at the agent's pre-staged workspace and must
// be empty for non-Landmark runs. SUPABASE_JWT_SECRET and
// SUPABASE_SERVICE_ROLE_KEY now flow through from $GITHUB_ENV
// (written by the Landmark-gated Substrate stage step) — see
// `substrate-stage-propagates-supabase-env` below for the equivalent
// invariant.
const ADDED_RUN_ENV_KEYS = ["AGENT_CWD"];
const SUBSTRATE_PROPAGATED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

describe("kata-interview.yml spec 990 non-Landmark invariant", () => {
  it("every step added by spec 990 carries the Landmark predicate", () => {
    for (const name of ADDED_STEPS) {
      const step = steps.find((s) => s.name === name);
      assert.ok(step, `expected step "${name}"`);
      assert.match(
        String(step.if),
        /inputs\.product\s*==\s*'landmark'/,
        `step "${name}" missing Landmark gating`,
      );
    }
  });

  it("every Run-interview env key added by spec 990 is Landmark-gated", () => {
    const run = steps.find((s) => s.name === "Run interview");
    assert.ok(run, "expected 'Run interview' step");
    for (const key of ADDED_RUN_ENV_KEYS) {
      assert.match(
        String(run.env[key]),
        /inputs\.product\s*==\s*'landmark'\s*&&[^|]+\|\|\s*''/,
        `${key} missing Landmark ternary`,
      );
    }
  });

  it("substrate-stage CLI propagates supabase env keys via $GITHUB_ENV", () => {
    // The supabase env keys flow through from $GITHUB_ENV rather than
    // sitting on the Run interview env: block — the substrate stage
    // Node process (which is Landmark-gated by the workflow step's
    // if-predicate) reads the values from `supabase status -o json`
    // inside the package root and writes them via $GITHUB_ENV. This
    // keeps the Run interview env identical between Landmark and
    // non-Landmark runs.
    const substrateStageJs = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "products",
        "map",
        "src",
        "commands",
        "substrate-stage.js",
      ),
      "utf8",
    );
    for (const key of SUBSTRATE_PROPAGATED_KEYS) {
      assert.match(
        substrateStageJs,
        new RegExp(`\\b${key}\\b`),
        `substrate-stage.js should propagate ${key}`,
      );
    }
    // The propagation goes through GITHUB_ENV, not stdout.
    assert.match(
      substrateStageJs,
      /GITHUB_ENV/,
      "substrate-stage.js should append to GITHUB_ENV",
    );
  });

  it("interview job declares timeout-minutes < 60", () => {
    const m = wf.jobs.interview["timeout-minutes"];
    assert.ok(
      typeof m === "number" && m < 60,
      `timeout-minutes expected < 60, got ${m}`,
    );
  });
});
