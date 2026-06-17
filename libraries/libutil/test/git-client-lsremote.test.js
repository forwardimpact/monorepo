import { test, describe } from "node:test";
import assert from "node:assert";

import {
  createTestRuntime,
  createMockSubprocess,
} from "@forwardimpact/libmock";

import { GitClient } from "../src/git-client.js";

function clientWith(responses = {}, token) {
  const subprocess = createMockSubprocess({ responses });
  const runtime = createTestRuntime({ subprocess });
  return { client: new GitClient({ runtime, token }), subprocess };
}

describe("GitClient.lsRemote", () => {
  test("invokes git ls-remote --tags --heads with the url", async () => {
    const { client, subprocess } = clientWith({
      git: {
        stdout: "deadbeef\trefs/tags/v1.0.0\nabc123\trefs/heads/main\n",
        exitCode: 0,
      },
    });
    const result = await client.lsRemote(
      "https://github.com/forwardimpact/kata-agent",
    );
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /refs\/tags\/v1.0.0/);
    assert.deepStrictEqual(subprocess.calls.at(-1).args, [
      "ls-remote",
      "--tags",
      "--heads",
      "https://github.com/forwardimpact/kata-agent",
    ]);
  });

  test("returns the raw result on a non-zero exit (allowFailure)", async () => {
    const { client } = clientWith({
      git: {
        stderr: "fatal: could not read Username: terminal prompts disabled",
        exitCode: 128,
      },
    });
    const result = await client.lsRemote(
      "https://github.com/forwardimpact/does-not-exist",
    );
    assert.strictEqual(result.exitCode, 128);
    assert.match(result.stderr, /terminal prompts disabled/);
  });

  test("threads a token into the git env header when present", async () => {
    const { client, subprocess } = clientWith({}, "tok-123");
    await client.lsRemote("https://github.com/forwardimpact/internal");
    const call = subprocess.calls.at(-1);
    assert.strictEqual(call.args[0], "-c");
    assert.match(call.args[1], /^http\.extraHeader=Authorization: Basic /);
  });

  test("transports anonymously when the client carries no token", async () => {
    const { client, subprocess } = clientWith();
    await client.lsRemote("https://github.com/forwardimpact/kata-agent");
    assert.strictEqual(subprocess.calls.at(-1).args[0], "ls-remote");
  });

  test("sources env from the runtime's proc.env", async () => {
    const subprocess = createMockSubprocess();
    const runtime = createTestRuntime({ subprocess });
    runtime.proc.env.GIT_TERMINAL_PROMPT = "0";
    const client = new GitClient({ runtime });
    await client.lsRemote("https://github.com/forwardimpact/kata-agent");
    assert.strictEqual(
      subprocess.calls.at(-1).opts.env.GIT_TERMINAL_PROMPT,
      "0",
    );
  });
});
