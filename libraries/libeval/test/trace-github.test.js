import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import {
  TraceGitHub,
  createTraceGitHub,
  detectRepoSlug,
  parseGitRemote,
  participantInNames,
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

describe("participantInNames", () => {
  test("matrix artifact name matches the whole participant", () => {
    assert.ok(
      participantInNames(["trace--release-engineer"], "release-engineer"),
    );
  });

  test("dispatch member filename matches the participant segment", () => {
    assert.ok(
      participantInNames(
        ["trace--default--release-engineer.agent.ndjson"],
        "release-engineer",
      ),
    );
  });

  test("does not match a participant that is only a prefix (criterion 8 over-match guard)", () => {
    assert.strictEqual(
      participantInNames(["trace--release-engineer"], "release"),
      false,
    );
    assert.strictEqual(
      participantInNames(
        ["trace--default--release-engineer.agent.ndjson"],
        "release",
      ),
      false,
    );
  });

  test("ignores non-trace names", () => {
    assert.strictEqual(
      participantInNames(["logs", "report.json"], "release-engineer"),
      false,
    );
  });
});

describe("participant-keyed discovery (spec 1910)", () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const RUNS = {
    workflow_runs: [
      {
        id: 100,
        name: "Kata: Shift",
        status: "completed",
        conclusion: "success",
        created_at: "2026-06-12T00:00:00Z",
        head_branch: "main",
        html_url: "https://gh/100",
      },
      {
        id: 200,
        name: "Kata: Dispatch",
        status: "completed",
        conclusion: "success",
        created_at: "2026-06-12T00:00:00Z",
        head_branch: "main",
        html_url: "https://gh/200",
      },
      {
        id: 300,
        name: "Kata: Dispatch",
        status: "in_progress",
        conclusion: null,
        created_at: "2026-06-12T00:00:00Z",
        head_branch: "main",
        html_url: "https://gh/300",
      },
    ],
  };

  // Matrix host (run 100): per-participant artifact names.
  // Dispatch host (run 200): one shared artifact; participant lives in members.
  // Candidate host (run 300): no artifacts yet.
  function jsonResponse(body) {
    return { ok: true, status: 200, statusText: "OK", json: async () => body };
  }
  function stubFetch() {
    globalThis.fetch = async (url) => {
      if (url.includes("/actions/runs?")) return jsonResponse(RUNS);
      if (url.includes("/runs/100/artifacts"))
        return jsonResponse({
          artifacts: [
            { id: 1, name: "trace--release-engineer" },
            { id: 2, name: "trace--staff-engineer" },
          ],
        });
      if (url.includes("/runs/200/artifacts"))
        return jsonResponse({ artifacts: [{ id: 3, name: "trace--shared" }] });
      if (url.includes("/runs/300/artifacts"))
        return jsonResponse({ artifacts: [] });
      throw new Error(`unexpected fetch ${url}`);
    };
  }

  // A TraceGitHub whose downloadTrace is stubbed to return the dispatch host's
  // extracted member filenames — no real download, names only.
  function ghWithDispatchMembers(members) {
    const gh = new TraceGitHub({
      token: "t",
      owner: "o",
      repo: "r",
      runtime: RT,
    });
    gh.downloadTrace = async (runId, opts) => ({
      dir: `/tmp/trace-${runId}`,
      artifact: opts.name,
      files: members,
    });
    return gh;
  }

  test("listRuns confirms a matrix-host lane (criterion 1)", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers([]);
    const runs = await gh.listRuns({ participant: "release-engineer" });
    const matrix = runs.find((r) => r.runId === 100);
    assert.ok(matrix, "matrix host present");
    assert.strictEqual(matrix.match, "confirmed");
  });

  test("listRuns confirms a dispatch-host lane via downloaded member names (criterion 1)", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers([
      "trace--default--release-engineer.agent.ndjson",
      "trace--default--staff-engineer.agent.ndjson",
    ]);
    const runs = await gh.listRuns({ participant: "release-engineer" });
    const dispatch = runs.find((r) => r.runId === 200);
    assert.ok(dispatch, "dispatch host present");
    assert.strictEqual(dispatch.match, "confirmed");
  });

  test("listRuns labels an in-progress candidate, never drops it (criterion 2)", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers([]);
    const runs = await gh.listRuns({ participant: "release-engineer" });
    const candidate = runs.find((r) => r.runId === 300);
    assert.ok(candidate, "candidate host present");
    assert.strictEqual(candidate.match, "unconfirmed-pending-artifacts");
  });

  test("findByKey resolves a matrix lane from the artifact name (criterion 7)", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers([]);
    const result = await gh.findByKey(100, "release-engineer");
    assert.strictEqual(result.host, "matrix");
    assert.strictEqual(result.path, "trace--release-engineer");
  });

  test("findByKey resolves a dispatch lane from a downloaded member filename (criterion 7)", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers([
      "trace--default--release-engineer.agent.ndjson",
    ]);
    const result = await gh.findByKey(200, "release-engineer");
    assert.strictEqual(result.host, "dispatch");
    assert.ok(
      result.path.endsWith("trace--default--release-engineer.agent.ndjson"),
    );
  });

  test("attribution never reads trace content — an echo-contaminated body is irrelevant (criterion 8)", async () => {
    stubFetch();
    // The dispatch member files name release-engineer; their bodies (never
    // read) could quote any run id. Resolution depends only on the filename.
    const gh = ghWithDispatchMembers([
      "trace--default--release-engineer.agent.ndjson",
    ]);
    const result = await gh.findByKey(200, "release-engineer");
    assert.strictEqual(result.host, "dispatch");
    // staff-engineer is absent from the member names, so it must not resolve,
    // regardless of any run-id strings echoed inside the .ndjson bodies.
    await assert.rejects(
      () => gh.findByKey(200, "staff-engineer"),
      /No trace lane/,
    );
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
