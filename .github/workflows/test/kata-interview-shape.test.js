/**
 * Workflow/action-shape assertions for the reusable kata-interview action and
 * its thin wrapper.
 *
 * The interview capability moved into a composite action whose substrate steps
 * are gated on a non-empty `substrate-setup-command` (no hardcoded product
 * name). This guards two invariants:
 *   1. Substrate-only action steps and the substrate-selecting env keys gate on
 *      `substrate-setup-command != ''` — so a file-only interview skips
 *      bring-up, persona selection, and the log scan — and no
 *      `product == 'landmark'` literal survives in the action.
 *   2. The wrapper job declares a `timeout-minutes` strictly under 60 (the
 *      composite action cannot), so a stalled run cannot outlive its 1-hour App
 *      token.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = join(__dirname, "..", "kata-interview.yml");
const ACTION_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "products",
  "kata",
  "actions",
  "kata-interview",
  "action.yml",
);

const actionSrc = readFileSync(ACTION_PATH, "utf8");
const action = parse(actionSrc);
const actionSteps = action.runs.steps;
const wf = parse(readFileSync(WORKFLOW_PATH, "utf8"));

// Substrate-only steps in the action — present only on the substrate path.
const SUBSTRATE_STEPS = ["Substrate setup", "Scan logs for sensitive values"];
// Every `Run interview` env key that selects the substrate path. SUPABASE_URL
// is propagated via $GITHUB_ENV from the setup command, not this env: map.
const SUBSTRATE_RUN_ENV_KEYS = [
  "PERSONA_SELECT_COMMAND",
  "JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const GATE = /inputs\.substrate-setup-command\s*!=\s*''/;

describe("kata-interview action substrate gating", () => {
  it("every substrate-only step gates on substrate-setup-command != ''", () => {
    for (const name of SUBSTRATE_STEPS) {
      const step = actionSteps.find((s) => s.name === name);
      assert.ok(step, `expected action step "${name}"`);
      assert.match(
        String(step.if),
        GATE,
        `step "${name}" missing substrate-setup-command gate`,
      );
    }
  });

  it("every substrate-selecting Run interview env key carries the ternary", () => {
    const run = actionSteps.find((s) => s.name === "Run interview");
    assert.ok(run, "expected 'Run interview' step");
    for (const key of SUBSTRATE_RUN_ENV_KEYS) {
      assert.match(
        String(run.env[key]),
        /inputs\.substrate-setup-command\s*!=\s*''\s*&&[^|]+\|\|\s*''/,
        `${key} missing substrate-setup-command ternary`,
      );
    }
  });

  it("carries no product == 'landmark' literal", () => {
    assert.doesNotMatch(
      actionSrc,
      /product\s*==\s*'landmark'/,
      "action must not hardcode the landmark product predicate",
    );
  });

  it("emits a trace-file output", () => {
    assert.ok(action.outputs?.["trace-file"], "expected trace-file output");
  });
});

describe("kata-interview.yml wrapper", () => {
  it("delegates to the local composite action", () => {
    const step = wf.jobs.interview.steps.find(
      (s) => s.uses === "./products/kata/actions/kata-interview",
    );
    assert.ok(step, "wrapper must call ./products/kata/actions/kata-interview");
  });

  it("interview job declares timeout-minutes < 60", () => {
    const m = wf.jobs.interview["timeout-minutes"];
    assert.ok(
      typeof m === "number" && m < 60,
      `timeout-minutes expected < 60, got ${m}`,
    );
  });
});
