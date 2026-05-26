/**
 * Workflow-shape assertion guarding the *Non-Landmark interviews are
 * not regressed* invariant. Parses `.github/workflows/kata-interview.yml`
 * as YAML and verifies every Landmark-only step + every Run-interview
 * env key that selects the Landmark path carries a Landmark predicate,
 * and the interview job declares a timeout-minutes strictly less than
 * the JWT's 1-hour default TTL so a stalled run cannot outlive its
 * credentials.
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
// Every key on `Run interview`'s env that selects the Landmark-only
// interview path. SUPABASE_URL is propagated via $GITHUB_ENV from the
// Substrate stage and does not appear in the env: map here.
const ADDED_RUN_ENV_KEYS = [
  "AGENT_CWD",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

describe("kata-interview.yml non-Landmark invariant", () => {
  it("every Landmark-only step carries the Landmark predicate", () => {
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

  it("every Landmark-only Run-interview env key is Landmark-gated", () => {
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

  it("interview job declares timeout-minutes < 60", () => {
    const m = wf.jobs.interview["timeout-minutes"];
    assert.ok(
      typeof m === "number" && m < 60,
      `timeout-minutes expected < 60, got ${m}`,
    );
  });
});
