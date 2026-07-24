/**
 * Contract test for the benchmark composite action's trace surface: the
 * `trace-dir` output wiring, the `Upload traces` step's gating and path set,
 * and the `Resolve paths` shell script's observable behaviour — executed with
 * real bash in a temp dir so the trace-dir/manifest/artifact-name contract
 * verifies on the PR, not just post-release.
 */

import { describe, test, before } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const ACTION_PATH = fileURLToPath(
  new URL("../actions/benchmark/action.yml", import.meta.url),
);

let action;
before(() => {
  action = parse(readFileSync(ACTION_PATH, "utf8"));
});

function step(name) {
  return action.runs.steps.find((s) => s.name === name);
}

/**
 * Execute the `Resolve paths` step's script with bash in a temp dir and
 * return the parsed `$GITHUB_OUTPUT` map plus the output dir. Throws on a
 * non-zero exit (execFileSync semantics), which the fail-fast test relies on.
 * @param {Record<string, string>} env - The step's env values.
 * @returns {Promise<{outputs: Record<string, string>, outputDir: string}>}
 */
async function runResolvePaths(env) {
  const dir = await mkdtemp(join(tmpdir(), "benchmark-action-"));
  const outputDir = join(dir, "out");
  const githubOutput = join(dir, "github-output");
  await writeFile(githubOutput, "");
  execFileSync("bash", ["-e", "-c", step("Resolve paths").run], {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      OUTPUT_DIR: outputDir,
      GITHUB_OUTPUT: githubOutput,
      ...env,
    },
  });
  const outputs = {};
  for (const line of (await readFile(githubOutput, "utf8")).split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) outputs[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { outputs, outputDir };
}

const BASE_ENV = {
  SHARD_INDEX: "1",
  SHARD_TOTAL: "1",
  ARTIFACT_NAME: "benchmark-results",
  TRACE_ENABLED: "true",
  FAMILY: "families/demo",
};

describe("benchmark action trace contract (spec criterion 10)", () => {
  test("the trace-dir output wires to the resolve-paths step", () => {
    assert.strictEqual(
      action.outputs["trace-dir"].value,
      "${{ steps.resolve-paths.outputs.trace-dir }}",
    );
  });

  test("the Upload traces step gates on always(), run mode, and the trace input", () => {
    const upload = step("Upload traces");
    assert.ok(upload, "Upload traces step must exist");
    assert.strictEqual(
      upload.if,
      "always() && inputs.mode == 'run' && inputs.trace == 'true'",
    );
    assert.strictEqual(
      upload.with.name,
      "${{ steps.resolve-paths.outputs.trace-artifact-name }}",
    );
    // Exact-depth glob (never **) plus the pre-written manifest anchor.
    assert.strictEqual(
      upload.with.path.trimEnd(),
      "${{ inputs.output }}/runs/*/*/trace--*.ndjson\n${{ inputs.output }}/trace-manifest.txt",
    );
  });

  test("resolve-paths emits an absolute trace-dir and the manifest anchor when enabled", async () => {
    const { outputs, outputDir } = await runResolvePaths(BASE_ENV);
    assert.strictEqual(outputs["trace-dir"], join(outputDir, "runs"));
    assert.ok(outputs["trace-dir"].startsWith("/"), "trace-dir is absolute");
    assert.strictEqual(
      outputs["trace-artifact-name"],
      "trace--benchmark-results",
    );
    const manifest = await readFile(
      join(outputDir, "trace-manifest.txt"),
      "utf8",
    );
    assert.strictEqual(
      manifest,
      "family=families/demo\nshard=1/1\nartifact=trace--benchmark-results\n",
    );
  });

  test("resolve-paths emits an empty trace-dir and no manifest when disabled", async () => {
    const { outputs, outputDir } = await runResolvePaths({
      ...BASE_ENV,
      TRACE_ENABLED: "false",
    });
    assert.strictEqual(outputs["trace-dir"], "");
    assert.strictEqual(
      globSync(join(outputDir, "trace-manifest.txt")).length,
      0,
      "no manifest when trace is disabled",
    );
  });

  test("sharded runs mint trace--<name>-shard-<i> artifact names", async () => {
    const { outputs } = await runResolvePaths({
      ...BASE_ENV,
      SHARD_INDEX: "3",
      SHARD_TOTAL: "4",
    });
    assert.strictEqual(
      outputs["trace-artifact-name"],
      "trace--benchmark-results-shard-3",
    );
  });

  test("an artifact-name containing -- fails fast (delimiter integrity)", async () => {
    await assert.rejects(() =>
      runResolvePaths({ ...BASE_ENV, ARTIFACT_NAME: "bad--name" }),
    );
  });

  test("the upload glob matches convention files beneath trace-dir and not cwd/ plants", async () => {
    const { outputs, outputDir } = await runResolvePaths(BASE_ENV);
    const cell = join(outputDir, "runs", "x", "0");
    await mkdir(join(cell, "cwd"), { recursive: true });
    const lane = join(cell, "trace--x-r0--agent.agent.ndjson");
    await writeFile(lane, "{}\n");
    const decoy = join(cell, "cwd", "trace--planted.raw.ndjson");
    await writeFile(decoy, "{}\n");

    // The same exact-depth pattern the Upload traces step declares.
    const matched = globSync(join(outputDir, "runs/*/*/trace--*.ndjson"));
    assert.deepStrictEqual(matched, [lane]);
    // And the matched file sits beneath the emitted trace-dir — the
    // criterion-10 "read the output and list convention-named files
    // beneath it" assertion.
    assert.ok(matched[0].startsWith(outputs["trace-dir"] + "/"));
  });
});
