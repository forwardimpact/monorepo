import { test, describe } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Smoke tests: spawn the real server.js with each short-circuit token under an
// env with every SERVICE_* variable stripped (the env a freshly-installed cask
// user has). Each token must print output and exit 0 without binding a port —
// the "listening" log line is written via the telemetry logger to stderr, so
// the capture merges stdout and stderr to make the no-port-bind guard real.
const serverJs = join(dirname(fileURLToPath(import.meta.url)), "..", "server.js");
const TOKENS = ["--help", "-h", "--version", "-V"];

function run(token) {
  const env = { ...process.env, LIBCLI_PACKAGE_VERSION: "9.9.9-smoke" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("SERVICE_")) delete env[key];
  }
  const result = spawnSync("node", [serverJs, token], {
    encoding: "utf8",
    env,
    timeout: 30_000,
  });
  return {
    code: result.status,
    signal: result.signal,
    out: `${result.stdout}${result.stderr}`,
  };
}

describe("fit-svcgraph bin smoke", () => {
  for (const token of TOKENS) {
    test(`${token} exits 0, prints output, binds no port`, () => {
      const { code, signal, out } = run(token);
      assert.equal(signal, null, `${token} timed out or was killed`);
      assert.equal(code, 0, `${token} exited ${code}`);
      assert.ok(out.length > 0, `${token} produced no output`);
      assert.ok(!/listening/i.test(out), `${token} bound a port`);
      if (token === "--version" || token === "-V") {
        assert.ok(
          out.includes("9.9.9-smoke"),
          `${token} did not print the injected version`,
        );
      }
    });
  }
});
