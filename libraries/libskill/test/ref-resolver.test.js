import { test, describe } from "node:test";
import assert from "node:assert";

import { createGitResolver, parseLsRemote } from "../src/ref-resolver.js";

// A fake GitClient whose `lsRemote` returns a canned result keyed by the url
// arg, so the anchor and the target return different results in one run —
// libmock's subprocess keys on `cmd` only, which cannot distinguish them.
function fakeGit(table) {
  const calls = [];
  return {
    calls,
    lsRemote(url) {
      calls.push(url);
      const entry = table[url] ?? { stdout: "", stderr: "", exitCode: 128 };
      return Promise.resolve({ stdout: "", stderr: "", ...entry });
    },
  };
}

const ANCHOR = "https://github.com/actions/checkout";

describe("parseLsRemote", () => {
  test("uses the peel SHA for annotated tags, bare SHA for lightweight", () => {
    const parsed = parseLsRemote(
      [
        "bare111\trefs/tags/v1.0.0", // lightweight tag
        "anno222\trefs/tags/v2.0.0", // annotated tag object
        "peel333\trefs/tags/v2.0.0^{}", // its peel line
        "head444\trefs/heads/main",
      ].join("\n"),
    );
    assert.strictEqual(parsed.tagSha.get("v1.0.0"), "bare111");
    assert.strictEqual(parsed.tagSha.get("v2.0.0"), "peel333");
    assert.ok(parsed.tags.has("v1.0.0"));
    assert.ok(parsed.heads.has("main"));
  });
});

describe("createGitResolver", () => {
  test("ok when the target lists refs (gate green)", async () => {
    const git = fakeGit({
      [ANCHOR]: { exitCode: 0 },
      "https://github.com/forwardimpact/kata-agent": {
        stdout: "deadbeef\trefs/tags/v1.0.0\n",
        exitCode: 0,
      },
    });
    const { resolve } = createGitResolver({ authedGit: git, anonGit: git });
    const r = await resolve({
      owner: "forwardimpact",
      repo: "kata-agent",
      anonymous: true,
    });
    assert.strictEqual(r.state, "ok");
    assert.ok(r.refs.tags.has("v1.0.0"));
  });

  test("absent on exit 128 when the gate is green", async () => {
    const git = fakeGit({
      [ANCHOR]: { exitCode: 0 },
      "https://github.com/forwardimpact/kata-action-agent": { exitCode: 128 },
    });
    const { resolve } = createGitResolver({ authedGit: git, anonGit: git });
    const r = await resolve({
      owner: "forwardimpact",
      repo: "kata-action-agent",
      anonymous: true,
    });
    assert.strictEqual(r.state, "absent");
  });

  test("unreachable when the anchor gate is red — never a pass", async () => {
    const git = fakeGit({
      [ANCHOR]: { exitCode: 128 },
      "https://github.com/forwardimpact/kata-agent": { exitCode: 0 },
    });
    const { resolve } = createGitResolver({ authedGit: git, anonGit: git });
    const r = await resolve({
      owner: "forwardimpact",
      repo: "kata-agent",
      anonymous: true,
    });
    assert.strictEqual(r.state, "unreachable");
    assert.strictEqual(r.refs, undefined);
  });

  test("a non-128 transport fault re-probes the gate and demotes to unreachable", async () => {
    // The anchor first succeeds (gate green), then a later call fails (mid-run
    // outage). The target returns a non-128 fault, re-probing the gate.
    let anchorCalls = 0;
    const git = {
      lsRemote(url) {
        if (url === ANCHOR) {
          anchorCalls += 1;
          return Promise.resolve({
            stdout: "",
            stderr: "",
            exitCode: anchorCalls === 1 ? 0 : 1,
          });
        }
        return Promise.resolve({ stdout: "", stderr: "", exitCode: 1 });
      },
    };
    const { resolve } = createGitResolver({ authedGit: git, anonGit: git });
    const r = await resolve({
      owner: "forwardimpact",
      repo: "kata-agent",
      anonymous: true,
    });
    assert.strictEqual(r.state, "unreachable");
  });

  test("memoizes the gate across resolves", async () => {
    const git = fakeGit({
      [ANCHOR]: { exitCode: 0 },
      "https://github.com/forwardimpact/a": { stdout: "", exitCode: 0 },
      "https://github.com/forwardimpact/b": { stdout: "", exitCode: 0 },
    });
    const { resolve } = createGitResolver({ authedGit: git, anonGit: git });
    await resolve({ owner: "forwardimpact", repo: "a", anonymous: true });
    await resolve({ owner: "forwardimpact", repo: "b", anonymous: true });
    const anchorProbes = git.calls.filter((u) => u === ANCHOR).length;
    assert.strictEqual(anchorProbes, 1, "gate probed once");
  });

  test("picks anonGit for anonymous refs, authedGit otherwise", async () => {
    const anonGit = fakeGit({
      [ANCHOR]: { exitCode: 0 },
      "https://github.com/forwardimpact/pub": { stdout: "", exitCode: 0 },
    });
    const authedGit = fakeGit({
      "https://github.com/forwardimpact/internal": { stdout: "", exitCode: 0 },
    });
    const { resolve } = createGitResolver({ authedGit, anonGit });
    await resolve({ owner: "forwardimpact", repo: "pub", anonymous: true });
    await resolve({
      owner: "forwardimpact",
      repo: "internal",
      anonymous: false,
    });
    assert.ok(anonGit.calls.includes("https://github.com/forwardimpact/pub"));
    assert.ok(
      authedGit.calls.includes("https://github.com/forwardimpact/internal"),
    );
  });
});
