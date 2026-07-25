import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import {
  TraceGitHub,
  createTraceGitHub,
  detectRepoSlug,
  parseGitRemote,
  pickTraceArtifact,
} from "@forwardimpact/libharness";
import { listExtractedFiles } from "../src/trace-github.js";

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
  // The default must cover Kata workflows, legacy agent-named workflows, and
  // the benchmark-driven eval workflows ("Eval: Kata", "eval-jidoka",
  // benchmark-named callers) so eval runs list with no flags.
  const DEFAULT = "kata|agent|eval|benchmark";

  const KATA_WORKFLOW_NAMES = [
    "Kata: Shift",
    "Kata: Dispatch",
    "Kata: Coaching",
    "Kata: Interview",
    "Kata: Storyboard",
  ];

  test("matches every Kata workflow name", () => {
    const re = new RegExp(DEFAULT, "i");
    for (const name of KATA_WORKFLOW_NAMES) {
      assert.ok(re.test(name), `expected default pattern to match "${name}"`);
    }
  });

  test("matches legacy agent-named workflows", () => {
    const re = new RegExp(DEFAULT, "i");
    assert.ok(re.test("agent-runner"));
    assert.ok(re.test("Some Agent Eval"));
  });

  test("matches eval and benchmark workflow names (spec criterion 6)", () => {
    const re = new RegExp(DEFAULT, "i");
    assert.ok(re.test("eval-kata"));
    assert.ok(re.test("Eval: Jidoka"));
    assert.ok(re.test("Benchmark (sharded)"));
  });

  test("prior default 'kata|agent' (regression case) misses eval workflows", () => {
    const re = new RegExp("kata|agent", "i");
    assert.strictEqual(re.test("eval-jidoka"), false);
    assert.strictEqual(re.test("Benchmark (sharded)"), false);
  });
});

// participantInNames unit coverage lives in trace-identity.test.js with the
// rest of the identity grammar.

describe("participant-keyed discovery", () => {
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

  test("listRuns confirms a lane from nested eval member paths", async () => {
    stubFetch();
    // Eval artifacts carry nested members; matching maps through basename.
    const gh = ghWithDispatchMembers([
      "runs/fix-bug/0/trace--fix-bug-r0--agent.agent.ndjson",
      "runs/fix-bug/0/trace--fix-bug-r0--supervisor.supervisor.ndjson",
      "trace-manifest.txt",
    ]);
    const runs = await gh.listRuns({ participant: "agent" });
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
    assert.strictEqual(result.key, "release-engineer");
    assert.strictEqual(result.path, "trace--release-engineer");
  });

  test("findByKey resolves a dispatch lane from a downloaded member filename (criterion 7)", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers([
      "trace--default--release-engineer.agent.ndjson",
    ]);
    const result = await gh.findByKey(200, "release-engineer");
    assert.strictEqual(result.host, "dispatch");
    assert.strictEqual(result.key, "release-engineer");
    assert.ok(
      result.path.endsWith("trace--default--release-engineer.agent.ndjson"),
    );
  });

  // Eval-style nested members: two cells, each with agent/supervisor lanes
  // plus a raw file, and the non-trace manifest anchor.
  const EVAL_MEMBERS = [
    "runs/fix-bug/0/trace--fix-bug-r0.raw.ndjson",
    "runs/fix-bug/0/trace--fix-bug-r0--agent.agent.ndjson",
    "runs/fix-bug/0/trace--fix-bug-r0--supervisor.supervisor.ndjson",
    "runs/fix-bug/1/trace--fix-bug-r1.raw.ndjson",
    "runs/fix-bug/1/trace--fix-bug-r1--agent.agent.ndjson",
    "runs/fix-bug/1/trace--fix-bug-r1--supervisor.supervisor.ndjson",
    "trace-manifest.txt",
  ];

  test("findByKey lists both lanes when a case-segment key matches the cell's pair", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers(EVAL_MEMBERS);
    await assert.rejects(
      () => gh.findByKey(200, "fix-bug-r0"),
      (err) => {
        // Both lanes of the cell match the case key — the ambiguity error
        // must list them so the caller narrows to an exact filename.
        assert.match(err.message, /Ambiguous key "fix-bug-r0"/);
        assert.match(err.message, /trace--fix-bug-r0--agent\.agent\.ndjson/);
        assert.match(
          err.message,
          /trace--fix-bug-r0--supervisor\.supervisor\.ndjson/,
        );
        return true;
      },
    );
  });

  test("findByKey resolves a case-segment key when exactly one lane matches", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers([
      "runs/fix-bug/0/trace--fix-bug-r0--agent.agent.ndjson",
      "runs/fix-bug/1/trace--fix-bug-r1--agent.agent.ndjson",
    ]);
    const result = await gh.findByKey(200, "fix-bug-r0");
    assert.strictEqual(result.host, "dispatch");
    assert.strictEqual(result.key, "fix-bug-r0");
    assert.ok(
      result.path.endsWith(
        "runs/fix-bug/0/trace--fix-bug-r0--agent.agent.ndjson",
      ),
    );
  });

  test("findByKey resolves an exact-basename key against nested eval members", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers(EVAL_MEMBERS);
    const result = await gh.findByKey(
      200,
      "trace--fix-bug-r1--agent.agent.ndjson",
    );
    assert.strictEqual(result.host, "dispatch");
    assert.strictEqual(result.key, "trace--fix-bug-r1--agent.agent.ndjson");
    assert.ok(
      result.path.endsWith(
        "runs/fix-bug/1/trace--fix-bug-r1--agent.agent.ndjson",
      ),
    );
  });

  test("findByKey isolates per-artifact extract dirs on multi-artifact (sharded) runs", async () => {
    stubFetch();
    globalThis.fetch = ((orig) => async (url) => {
      // Two shard artifacts on run 200 instead of the single trace--shared.
      if (url.includes("/runs/200/artifacts")) {
        return jsonResponse({
          artifacts: [
            { id: 3, name: "trace--eval-shard-1" },
            { id: 4, name: "trace--eval-shard-2" },
          ],
        });
      }
      return orig(url);
    })(globalThis.fetch);

    const SHARD_MEMBERS = {
      "trace--eval-shard-1": [
        "runs/fix-bug/0/trace--fix-bug-r0--agent.agent.ndjson",
      ],
      "trace--eval-shard-2": [
        "runs/fix-bug/1/trace--fix-bug-r1--agent.agent.ndjson",
      ],
    };
    const gh = new TraceGitHub({
      token: "t",
      owner: "o",
      repo: "r",
      runtime: RT,
    });
    // Mimic the real extract-then-list-everything behaviour: each download
    // appends its artifact's members into `dir` and returns the whole dir's
    // listing. With a shared dir, shard 1's member would be re-listed while
    // scanning shard 2 and a unique key would look ambiguous.
    const extracted = new Map();
    gh.downloadTrace = async (_runId, opts2) => {
      const seen = extracted.get(opts2.dir) ?? [];
      const files = [...seen, ...SHARD_MEMBERS[opts2.name]];
      extracted.set(opts2.dir, files);
      return { dir: opts2.dir, artifact: opts2.name, files };
    };

    const result = await gh.findByKey(
      200,
      "trace--fix-bug-r0--agent.agent.ndjson",
    );
    assert.strictEqual(result.host, "dispatch");
    assert.strictEqual(result.artifact, "trace--eval-shard-1");
    assert.ok(
      result.path.endsWith(
        "trace--eval-shard-1/runs/fix-bug/0/trace--fix-bug-r0--agent.agent.ndjson",
      ),
    );
  });

  test("findByKey errors with candidates on an ambiguous participant key (decision 10)", async () => {
    stubFetch();
    const gh = ghWithDispatchMembers(EVAL_MEMBERS);
    await assert.rejects(
      () => gh.findByKey(200, "agent"),
      (err) => {
        assert.match(err.message, /Ambiguous key "agent"/);
        assert.match(err.message, /trace--fix-bug-r0--agent\.agent\.ndjson/);
        assert.match(err.message, /trace--fix-bug-r1--agent\.agent\.ndjson/);
        return true;
      },
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

describe("listExtractedFiles", () => {
  // libmock's readdir ignores `recursive: true`, so this exercises the real
  // filesystem via a temp dir with the nested eval member shape.
  test("lists nested regular files relative to dir, excluding *.zip", async () => {
    const rt = createDefaultRuntime();
    const dir = await rt.fs.mkdtemp(join(tmpdir(), "trace-extract-"));
    try {
      const cell = join(dir, "runs", "task", "0");
      await rt.fs.mkdir(cell, { recursive: true });
      await rt.fs.writeFile(join(cell, "trace--task-r0.raw.ndjson"), "{}\n");
      await rt.fs.writeFile(
        join(cell, "trace--task-r0--agent.agent.ndjson"),
        "{}\n",
      );
      await rt.fs.writeFile(join(dir, "trace-manifest.txt"), "family=f\n");
      await rt.fs.writeFile(join(dir, "trace--artifact.zip"), "zip");

      const files = await listExtractedFiles(rt, dir);

      assert.deepStrictEqual(files, [
        "runs/task/0/trace--task-r0--agent.agent.ndjson",
        "runs/task/0/trace--task-r0.raw.ndjson",
        "trace-manifest.txt",
      ]);
    } finally {
      await rt.fs.rm(dir, { recursive: true, force: true });
    }
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
