import { test, describe } from "node:test";
import assert from "node:assert";

import {
  createTestRuntime,
  createMockSubprocess,
} from "@forwardimpact/libmock";

import { GhClient, GhError } from "../src/gh-client.js";

function clientWith(responses = {}) {
  const subprocess = createMockSubprocess({ responses });
  const runtime = createTestRuntime({ subprocess });
  return { client: new GhClient({ runtime }), subprocess };
}

describe("GhClient", () => {
  test("requires a runtime", () => {
    assert.throws(() => new GhClient({}), { message: /runtime is required/ });
  });

  test("prCreate returns the trimmed stdout URL", async () => {
    const { client, subprocess } = clientWith({
      gh: { stdout: "https://example.test/pr/1\n", exitCode: 0 },
    });
    const url = await client.prCreate({ title: "t", body: "b", base: "main" });
    assert.strictEqual(url, "https://example.test/pr/1");
    assert.strictEqual(subprocess.calls.at(-1).cmd, "gh");
    assert.deepStrictEqual(subprocess.calls.at(-1).args, [
      "pr",
      "create",
      "--title",
      "t",
      "--body",
      "b",
      "--base",
      "main",
    ]);
  });

  test("apiGet parses JSON stdout", async () => {
    const { client } = clientWith({
      gh: { stdout: '{"login":"octocat"}', exitCode: 0 },
    });
    assert.deepStrictEqual(await client.apiGet("/user"), { login: "octocat" });
  });

  test("apiPost forwards -f fields", async () => {
    const { client, subprocess } = clientWith({
      gh: { stdout: "{}", exitCode: 0 },
    });
    await client.apiPost("/repos/x/y/issues", { title: "hi" });
    assert.deepStrictEqual(subprocess.calls.at(-1).args, [
      "api",
      "--method",
      "POST",
      "/repos/x/y/issues",
      "-f",
      "title=hi",
    ]);
  });

  test("throws GhError on a non-zero exit", async () => {
    const { client } = clientWith({ gh: { stderr: "no", exitCode: 1 } });
    await assert.rejects(() => client.prMerge(5), GhError);
  });
});
