import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

let testDir;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(tmpdir(), "libconfig-stderr-"));
});

afterEach(async () => {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("bootstrapProject — refusal stderr greppability", () => {
  test("child process exit non-zero; stderr names leaf path and overwrite surface", async () => {
    await fs.mkdir(path.join(testDir, "config"));
    await fs.writeFile(
      path.join(testDir, "config", "config.json"),
      JSON.stringify({ product: { x: { foo: "a" } } }, null, 2) + "\n",
    );

    const script = `
      import { bootstrapProject } from "${pathToFileUrl(
        path.join(repoRoot, "libraries", "libconfig", "src", "bootstrap.js"),
      )}";
      import { createDefaultRuntime } from "${pathToFileUrl(
        path.join(repoRoot, "libraries", "libutil", "src", "runtime.js"),
      )}";
      try {
        await bootstrapProject({
          target: ${JSON.stringify(testDir)},
          fragment: { product: { x: { foo: "b" } } },
          deps: { runtime: createDefaultRuntime() },
        });
        process.exit(0);
      } catch (err) {
        process.stderr.write(err.message + "\\n");
        process.exit(1);
      }
    `;

    const { code, stderr } = await runNode(script);
    assert.equal(code, 1);
    assert.ok(
      stderr.includes("product.x.foo"),
      `stderr did not include leaf path: ${stderr}`,
    );
    assert.ok(
      stderr.includes("overwrites.config"),
      `stderr did not include overwrite surface: ${stderr}`,
    );
  });
});

function pathToFileUrl(p) {
  return new URL(`file://${p}`).toString();
}

function runNode(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: repoRoot,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
