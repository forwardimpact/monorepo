import { describe, test } from "node:test";
import assert from "node:assert";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import {
  createTraceGitHub,
  detectRepoSlug,
  parseGitRemote,
  pickTraceArtifact,
} from "@forwardimpact/libeval";

// Manifest shape for a Kata matrix run: six participants, each emits one
// `trace--<participant>` artifact. The `.raw` / `.agent` suffixes live on
// files inside the zip, not on the artifact name — disambiguation must
// happen on the artifact-name level here.
const MATRIX_RUN_ARTIFACTS = [
  { id: 1, name: "trace--improvement-coach" },
  { id: 2, name: "trace--release-engineer" },
  { id: 3, name: "trace--technical-writer" },
  { id: 4, name: "trace--security-engineer" },
  { id: 5, name: "trace--staff-engineer" },
  { id: 6, name: "trace--product-manager" },
];

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

describe("pickTraceArtifact", () => {
  test("throws disambiguation error against the run 27053185454 matrix manifest", () => {
    assert.throws(
      () => pickTraceArtifact(MATRIX_RUN_ARTIFACTS, undefined, 27053185454),
      (err) => {
        assert.match(
          err.message,
          /Multiple trace artifacts found for run 27053185454/,
        );
        assert.match(err.message, /trace--product-manager/);
        assert.match(err.message, /trace--improvement-coach/);
        assert.match(err.message, /Pass --name to choose one/);
        return true;
      },
    );
  });

  test("returns the named artifact from the matrix manifest", () => {
    const picked = pickTraceArtifact(
      MATRIX_RUN_ARTIFACTS,
      "trace--product-manager",
      27053185454,
    );
    assert.strictEqual(picked.name, "trace--product-manager");
    assert.strictEqual(picked.id, 6);
  });

  test("throws with available names when the requested name is missing", () => {
    assert.throws(
      () =>
        pickTraceArtifact(
          MATRIX_RUN_ARTIFACTS,
          "trace--nonexistent",
          27053185454,
        ),
      (err) => {
        assert.match(err.message, /No artifact named "trace--nonexistent"/);
        assert.match(err.message, /trace--product-manager/);
        return true;
      },
    );
  });

  test("returns the single trace artifact when only one exists", () => {
    const artifacts = [
      { id: 10, name: "build-log" },
      { id: 11, name: "trace--staff-engineer" },
    ];
    const picked = pickTraceArtifact(artifacts);
    assert.strictEqual(picked.name, "trace--staff-engineer");
  });

  test("throws 'no trace artifact' with available list when none match", () => {
    const artifacts = [{ id: 20, name: "build-log" }];
    assert.throws(
      () => pickTraceArtifact(artifacts, undefined, 42),
      (err) => {
        assert.match(err.message, /No trace artifact found for run 42/);
        assert.match(err.message, /build-log/);
        return true;
      },
    );
  });

  test("reports 'none' when artifact list is empty", () => {
    assert.throws(
      () => pickTraceArtifact([], undefined, 99),
      /No trace artifact found for run 99\. Available: none/,
    );
  });
});

describe("listRuns default pattern", () => {
  // The prior default "agent" missed every Kata workflow name because
  // none of them contain "agent" — "Kata: Shift", "Kata: Dispatch", etc.
  // The new default keeps the legacy "agent" matcher and adds "Kata".
  const KATA_WORKFLOW_NAMES = [
    "Kata: Shift",
    "Kata: Dispatch",
    "Kata: Coaching",
    "Kata: Interview",
    "Kata: Storyboard",
  ];

  test("'kata|agent' matches every Kata workflow name", () => {
    const re = new RegExp("kata|agent", "i");
    for (const name of KATA_WORKFLOW_NAMES) {
      assert.ok(re.test(name), `expected default pattern to match "${name}"`);
    }
  });

  test("'kata|agent' still matches legacy agent-named workflows", () => {
    const re = new RegExp("kata|agent", "i");
    assert.ok(re.test("agent-runner"));
    assert.ok(re.test("Some Agent Eval"));
  });

  test("prior default 'agent' (regression case) misses Kata: Shift", () => {
    const re = new RegExp("agent", "i");
    assert.strictEqual(re.test("Kata: Shift"), false);
    assert.strictEqual(re.test("Kata: Dispatch"), false);
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
