import { describe, test } from "node:test";
import assert from "node:assert";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import {
  createTraceGitHub,
  detectRepoSlug,
  parseGitRemote,
} from "@forwardimpact/libeval";

const RT = createDefaultRuntime();

describe("parseGitRemote", () => {
  test("parses SSH remote", () => {
    const result = parseGitRemote("git@github.com:forwardimpact/monorepo.git");
    assert.strictEqual(result.owner, "forwardimpact");
    assert.strictEqual(result.repo, "monorepo");
  });

  test("parses SSH remote without .git suffix", () => {
    const result = parseGitRemote("git@github.com:owner/repo");
    assert.strictEqual(result.owner, "owner");
    assert.strictEqual(result.repo, "repo");
  });

  test("parses HTTPS remote", () => {
    const result = parseGitRemote(
      "https://github.com/forwardimpact/monorepo.git",
    );
    assert.strictEqual(result.owner, "forwardimpact");
    assert.strictEqual(result.repo, "monorepo");
  });

  test("parses HTTPS remote without .git suffix", () => {
    const result = parseGitRemote("https://github.com/owner/repo");
    assert.strictEqual(result.owner, "owner");
    assert.strictEqual(result.repo, "repo");
  });

  test("parses plain owner/repo format", () => {
    const result = parseGitRemote("forwardimpact/monorepo");
    assert.strictEqual(result.owner, "forwardimpact");
    assert.strictEqual(result.repo, "monorepo");
  });

  test("throws for unparseable remote", () => {
    assert.throws(() => parseGitRemote("not-a-remote"), /Cannot parse/);
  });

  test("does not match plain owner/repo if it looks like an SSH URL", () => {
    const result = parseGitRemote("git@github.com:acme/widgets.git");
    assert.strictEqual(result.owner, "acme");
    assert.strictEqual(result.repo, "widgets");
  });
});

describe("detectRepoSlug", () => {
  function withEnv(vars, fn) {
    const saved = {};
    for (const key of Object.keys(vars)) {
      saved[key] = process.env[key];
      if (vars[key] === undefined) delete process.env[key];
      else process.env[key] = vars[key];
    }
    try {
      return fn();
    } finally {
      for (const key of Object.keys(saved)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  }

  test("reads GITHUB_REPOSITORY when set", async () => {
    const result = await withEnv(
      { GITHUB_REPOSITORY: "forwardimpact/monorepo" },
      () => detectRepoSlug(RT),
    );
    assert.strictEqual(result.owner, "forwardimpact");
    assert.strictEqual(result.repo, "monorepo");
  });

  test("ignores blank GITHUB_REPOSITORY and falls back to git remote", async () => {
    const result = await withEnv({ GITHUB_REPOSITORY: "   " }, () =>
      detectRepoSlug(RT),
    );
    assert.ok(result.owner);
    assert.ok(result.repo);
  });

  test("falls back to git remote when GITHUB_REPOSITORY is unset", async () => {
    const result = await withEnv({ GITHUB_REPOSITORY: undefined }, () =>
      detectRepoSlug(RT),
    );
    // We're running inside this monorepo, so origin should resolve.
    assert.ok(result.owner);
    assert.ok(result.repo);
  });
});

describe("createTraceGitHub", () => {
  test("throws a clear error when called without a runtime", async () => {
    await assert.rejects(() => createTraceGitHub(), /runtime is required/);
  });

  test("throws a clear error when token is missing", async () => {
    await assert.rejects(
      () => createTraceGitHub({ repo: "owner/repo", runtime: RT }),
      /token is required.*Config\.ghToken/,
    );
  });

  test("returns a TraceGitHub with the provided token and parsed repo", async () => {
    const gh = await createTraceGitHub({
      token: "ghp_fake",
      repo: "forwardimpact/monorepo",
      runtime: RT,
    });
    assert.strictEqual(gh.token, "ghp_fake");
    assert.strictEqual(gh.owner, "forwardimpact");
    assert.strictEqual(gh.repo, "monorepo");
  });
});
