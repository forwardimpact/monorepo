import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { runInitCommand } from "../src/commands/init.js";

// Real runtime: init writes to the real filesystem inside an isolated tmpdir
// (chdir'd in beforeEach), so this exercises the production fs/proc wiring.
const runtime = createDefaultRuntime();

let testDir;
let prevCwd;
let prevWrite;
let prevErr;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(tmpdir(), "fit-guide-init-"));
  prevCwd = process.cwd();
  process.chdir(testDir);
  prevWrite = process.stdout.write.bind(process.stdout);
  prevErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
});

afterEach(async () => {
  process.chdir(prevCwd);
  process.stdout.write = prevWrite;
  process.stderr.write = prevErr;
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("fit-guide init", () => {
  test("first run materialises config/, .env, and package.json with starter top-level keys", async () => {
    await runInitCommand(runtime);
    const config = JSON.parse(
      await fs.readFile(path.join(testDir, "config", "config.json"), "utf8"),
    );
    // Starter ships init + product + service top-level namespaces.
    assert.deepEqual(Object.keys(config).sort(), [
      "init",
      "product",
      "service",
    ]);
    const env = await fs.readFile(path.join(testDir, ".env"), "utf8");
    for (const key of [
      "SERVICE_SECRET",
      "MCP_TOKEN",
      "SERVICE_SPAN_URL",
      "SERVICE_VECTOR_URL",
      "SERVICE_GRAPH_URL",
      "SERVICE_PATHWAY_URL",
      "SERVICE_MAP_URL",
      "SERVICE_MCP_URL",
      "SERVICE_EMBEDDING_URL",
    ]) {
      assert.ok(env.includes(`${key}=`), `.env missing ${key}`);
    }
    const pkg = JSON.parse(
      await fs.readFile(path.join(testDir, "package.json"), "utf8"),
    );
    assert.equal(pkg.name, "my-guide-project");
    const skillsDir = path.join(testDir, ".claude", "skills");
    const skillStats = await fs.stat(skillsDir);
    assert.equal(skillStats.isDirectory(), true);
  });

  test("re-run is byte-identical across config/, .env, package.json, .claude/skills/", async () => {
    await runInitCommand(runtime);
    const configBefore = await fs.readFile(
      path.join(testDir, "config", "config.json"),
    );
    const envBefore = await fs.readFile(path.join(testDir, ".env"));
    const pkgBefore = await fs.readFile(path.join(testDir, "package.json"));
    const skillsListBefore = await listTree(
      path.join(testDir, ".claude", "skills"),
    );

    // Parse env so we can compare specific secret values byte-for-byte.
    const secretBefore = matchEnvValue(
      envBefore.toString("utf8"),
      "SERVICE_SECRET",
    );
    const tokenBefore = matchEnvValue(envBefore.toString("utf8"), "MCP_TOKEN");

    await runInitCommand(runtime);

    const configAfter = await fs.readFile(
      path.join(testDir, "config", "config.json"),
    );
    const envAfter = await fs.readFile(path.join(testDir, ".env"));
    const pkgAfter = await fs.readFile(path.join(testDir, "package.json"));
    const skillsListAfter = await listTree(
      path.join(testDir, ".claude", "skills"),
    );

    assert.equal(configBefore.equals(configAfter), true);
    assert.equal(envBefore.equals(envAfter), true);
    assert.equal(pkgBefore.equals(pkgAfter), true);
    assert.deepEqual(skillsListBefore, skillsListAfter);

    const secretAfter = matchEnvValue(
      envAfter.toString("utf8"),
      "SERVICE_SECRET",
    );
    const tokenAfter = matchEnvValue(envAfter.toString("utf8"), "MCP_TOKEN");
    assert.equal(secretAfter, secretBefore);
    assert.equal(tokenAfter, tokenBefore);
  });
});

function matchEnvValue(text, key) {
  for (const line of text.split("\n")) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1);
  }
  return undefined;
}

async function listTree(dir) {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
    recursive: true,
  });
  return entries.map((e) => `${e.parentPath ?? e.path}/${e.name}`).sort();
}
