/**
 * Integration tests for `fit-pathway agent --level=<id>`.
 *
 * Stages a copy of products/map/starter into a temp data dir, removes the
 * organizational-context slot so byte-comparisons are scoped to the
 * teamInstructions / level-expectations layer, then invokes runAgentCommand
 * with various combinations of `--level`. Covers SC1 (level changes output),
 * SC3 (unknown-level error shape), and the `--list` short-circuit (C-5).
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, cpSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createDataLoader } from "@forwardimpact/map/loader";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { runAgentCommand } from "../src/commands/agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const starterDir = join(__dirname, "..", "..", "map", "starter");
const templatesDir = join(__dirname, "..", "templates");

function silent(fn) {
  const original = console.log;
  console.log = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original;
    });
}

function stageDataDir({ stripOrgContext = true } = {}) {
  const work = mkdtempSync(join(tmpdir(), "agent-level-"));
  const dataDir = join(work, "data");
  cpSync(starterDir, dataDir, { recursive: true });
  if (stripOrgContext) {
    const slotPath = join(dataDir, "organizational-context.yaml");
    if (existsSync(slotPath)) rmSync(slotPath);
  }
  return { work, dataDir };
}

async function runAgent({ dataDir, args, options, outputDir = null }) {
  const loader = createDataLoader();
  const templateLoader = createTemplateLoader(templatesDir);
  const data = await loader.loadAllData(dataDir);
  const opts = { ...options };
  if (outputDir) opts.output = outputDir;
  await runAgentCommand({
    data,
    args,
    options: opts,
    dataDir,
    templateLoader,
    loader,
  });
}

function captureWrite(stream) {
  const original = stream.write.bind(stream);
  const chunks = [];
  stream.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  return {
    restore: () => {
      stream.write = original;
    },
    text: () => chunks.join(""),
  };
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require the ESC control character.
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

function stubProcessExit() {
  const original = process.exit;
  process.exit = (code) => {
    throw new Error(`exit ${code}`);
  };
  return () => {
    process.exit = original;
  };
}

describe("agent --level integration", () => {
  test("SC1-file — two levels produce different CLAUDE.md outputs", async () => {
    const { work, dataDir } = stageDataDir();
    try {
      const outJ040 = join(work, "out-j040");
      const outJ060 = join(work, "out-j060");
      await silent(() =>
        runAgent({
          dataDir,
          args: ["software_engineering"],
          options: { track: "platform", level: "J040" },
          outputDir: outJ040,
        }),
      );
      await silent(() =>
        runAgent({
          dataDir,
          args: ["software_engineering"],
          options: { track: "platform", level: "J060" },
          outputDir: outJ060,
        }),
      );

      const renderedJ040 = readFileSync(
        join(outJ040, ".claude", "CLAUDE.md"),
        "utf-8",
      );
      const renderedJ060 = readFileSync(
        join(outJ060, ".claude", "CLAUDE.md"),
        "utf-8",
      );

      assert.notStrictEqual(
        renderedJ040,
        renderedJ060,
        "level=J040 and level=J060 must produce different CLAUDE.md output",
      );
      assert.ok(
        renderedJ060.includes(
          "- **Impact scope:** Features and small projects",
        ),
        "J060 output should carry its impact-scope expectation",
      );
      assert.ok(
        renderedJ040.includes(
          "- **Impact scope:** Individual tasks with guidance",
        ),
        "J040 output should carry its impact-scope expectation",
      );

      // Composition-order guard: track teamInstructions anchor must precede
      // the new ## Level Expectations heading in the rendered file.
      const anchor = "Treat the platform as a";
      const headingIdx = renderedJ060.indexOf("## Level Expectations");
      const anchorIdx = renderedJ060.indexOf(anchor);
      assert.ok(
        anchorIdx !== -1,
        "J060 output should include the platform teamInstructions anchor",
      );
      assert.ok(
        headingIdx !== -1,
        "J060 output should include the ## Level Expectations heading",
      );
      assert.ok(
        anchorIdx < headingIdx,
        "## Level Expectations must appear AFTER the teamInstructions anchor",
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("SC1-stdout — populated level expectations appear on stdout with Team Instructions umbrella label", async () => {
    const { work, dataDir } = stageDataDir();
    const stdout = captureWrite(process.stdout);
    try {
      await silent(() =>
        runAgent({
          dataDir,
          args: ["software_engineering"],
          options: { track: "platform", level: "J060" },
        }),
      );
      const text = stripAnsi(stdout.text());
      assert.ok(
        text.includes("## Level Expectations"),
        "stdout should include the ## Level Expectations heading",
      );
      assert.ok(
        text.includes("# Team Instructions (CLAUDE.md)"),
        "stdout should carry the Team Instructions umbrella label",
      );
      assert.ok(
        !text.includes("# Team Instructions + Organizational Context"),
        "org-context was removed; combined header must not appear",
      );
    } finally {
      stdout.restore();
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("SC3a — unknown --level rejected with shared error shape", async () => {
    const { work, dataDir } = stageDataDir({ stripOrgContext: false });
    const stderr = captureWrite(process.stderr);
    const restoreExit = stubProcessExit();
    try {
      await assert.rejects(
        () =>
          silent(() =>
            runAgent({
              dataDir,
              args: ["software_engineering"],
              options: { track: "platform", level: "BOGUS" },
            }),
          ),
        /exit 1/,
      );
      const text = stripAnsi(stderr.text());
      assert.match(text, /Unknown level: BOGUS/);
      assert.match(text, /Available levels:/);
      assert.match(text, /J040/);
      assert.match(text, /J060/);
    } finally {
      stderr.restore();
      restoreExit();
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("SC3b — unknown --track error shape regressions: shared requireEntity helper still works", async () => {
    const { work, dataDir } = stageDataDir({ stripOrgContext: false });
    const stderr = captureWrite(process.stderr);
    const restoreExit = stubProcessExit();
    try {
      await assert.rejects(
        () =>
          silent(() =>
            runAgent({
              dataDir,
              args: ["software_engineering"],
              options: { track: "BOGUS" },
            }),
          ),
        /exit 1/,
      );
      const text = stripAnsi(stderr.text());
      assert.match(text, /Unknown track: BOGUS/);
      assert.match(text, /Available tracks:/);
    } finally {
      stderr.restore();
      restoreExit();
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("LIST — --list short-circuits before --level resolution (C-5)", async () => {
    const { work, dataDir } = stageDataDir({ stripOrgContext: false });
    try {
      const baselineCapture = captureWrite(process.stdout);
      try {
        await silent(() =>
          runAgent({
            dataDir,
            args: [],
            options: { list: true },
          }),
        );
      } finally {
        baselineCapture.restore();
      }
      const baseline = baselineCapture.text();

      const bogusCapture = captureWrite(process.stdout);
      try {
        await silent(() =>
          runAgent({
            dataDir,
            args: [],
            options: { list: true, level: "BOGUS" },
          }),
        );
      } finally {
        bogusCapture.restore();
      }
      const bogus = bogusCapture.text();

      assert.strictEqual(
        bogus,
        baseline,
        "--list with --level=BOGUS must match --list baseline byte-for-byte",
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
