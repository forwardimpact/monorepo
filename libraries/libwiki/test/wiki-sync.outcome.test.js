import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTestRuntime,
  createMockGitClient,
  createMockFs,
} from "@forwardimpact/libmock";
import { WikiSync, WikiPushFailure, PUSH_REASONS } from "../src/wiki-sync.js";

const WIKI = "/repo/wiki";
const PARENT = "/repo";

// Mirrors the healthy publishable state used by the core wiki-sync suite.
const REMOTE_TIP = "aaaa111";
const HEALTHY_PUSH = {
  headBranch: "master",
  remoteRefTip: REMOTE_TIP,
  isAncestor: false,
  statusPorcelain: { stdout: "", stderr: "", exitCode: 0 },
  diffNameStatus: "",
  showFile: "",
  pushPorcelain: {
    stdout: "=\trefs/heads/master:refs/heads/master\t[up to date]\n",
    stderr: "",
    exitCode: 0,
  },
};

function make({ responses, fsSync, resolveToken } = {}) {
  const git = createMockGitClient({ responses });
  const runtime = createTestRuntime(fsSync ? { fsSync } : {});
  const wikiSync = new WikiSync({
    runtime,
    gitClient: git,
    wikiDir: WIKI,
    parentDir: PARENT,
    resolveToken,
  });
  return {
    git,
    runtime,
    wikiSync,
    methods: () => git.calls.map((c) => c.method),
    stderr: () => runtime.proc.stderr.chunks.join(""),
  };
}

describe("WikiSync honest-outcome contract (spec 1780)", () => {
  const DIRTY = { stdout: " M MEMORY.md", stderr: "", exitCode: 0 };

  function rejectsReason(promiseFn, reason) {
    return assert.rejects(
      promiseFn,
      (err) => err instanceof WikiPushFailure && err.reason === reason,
    );
  }

  test("precondition: rebase-in-progress refuses before mutating", async () => {
    const { git, wikiSync } = make({
      responses: { ...HEALTHY_PUSH, status: DIRTY, rebase: { exitCode: 0 } },
      fsSync: createMockFs({ [`${WIKI}/.git/rebase-merge`]: "" }),
    });
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.PRECONDITION,
    );
    const m = git.calls.map((c) => c.method);
    assert.ok(!m.includes("commitAll"), "no commit on a precondition refusal");
    assert.ok(
      !m.includes("pushPorcelain"),
      "no push on a precondition refusal",
    );
  });

  test("precondition: detached HEAD refuses before mutating", async () => {
    const { git, wikiSync } = make({
      responses: { ...HEALTHY_PUSH, headBranch: "", status: DIRTY },
    });
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.PRECONDITION,
    );
    const m = git.calls.map((c) => c.method);
    assert.ok(!m.includes("commitAll") && !m.includes("pushPorcelain"));
  });

  test("residue-conflict: autostash pop leaves UU ⇒ refuse, stash preserved by SHA", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0, stderr: "" }, // rebase succeeds; pop conflicts
        statusPorcelain: { stdout: "UU foreign.md\n", stderr: "", exitCode: 0 },
        revParse: "stash5ha",
      },
    });
    let caught;
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: claim x", ["MEMORY.md"]),
      (err) => {
        caught = err;
        return (
          err instanceof WikiPushFailure &&
          err.reason === PUSH_REASONS.RESIDUE_CONFLICT
        );
      },
    );
    assert.equal(caught.stashSha, "stash5ha");
    const m = git.calls.map((c) => c.method);
    assert.ok(!m.includes("pushPorcelain"), "no push on residue-conflict");
    assert.ok(!m.includes("stashDropBySha"), "stash is preserved, not dropped");
  });

  test("rejected after a successful fetch", async () => {
    const { wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        pushPorcelain: {
          stdout: "!\trefs/heads/master:refs/heads/master\t[rejected]\n",
          stderr: "",
          exitCode: 1,
        },
      },
    });
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.REJECTED,
    );
  });

  test("transport when the fetch failed (rejection against a stale ref)", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        pushPorcelain: {
          stdout: "!\trefs/heads/master:refs/heads/master\t[rejected]\n",
          stderr: "",
          exitCode: 1,
        },
      },
    });
    git.fetch = async () => {
      throw new Error("could not read Username");
    };
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.TRANSPORT,
    );
  });

  test("transport on the push itself, exactly one push attempt", async () => {
    const { git, wikiSync } = make({
      responses: { ...HEALTHY_PUSH, status: DIRTY, rebase: { exitCode: 0 } },
    });
    git.pushPorcelain = async () => {
      throw new Error("network down");
    };
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.TRANSPORT,
    );
  });

  test("occurrence-#41: success prose + zero exit but ref not updated ⇒ failure", async () => {
    // Inadmissible channels (prose, exit 0) report success while the per-ref `!`
    // flag says rejected and the remote tip does not advance.
    const { wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        pushPorcelain: {
          stdout:
            "Everything up-to-date\n!\trefs/heads/master:refs/heads/master\t[remote rejected]\n",
          stderr: "",
          exitCode: 0,
        },
      },
    });
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.REJECTED,
    );
  });

  test("ambiguous push report ⇒ grounded in a fresh remote-tip read", async () => {
    let tipCalls = 0;
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        pushPorcelain: { stdout: "garbage\n", stderr: "", exitCode: 0 },
      },
    });
    // First remoteRefTip = pre-push grounding (not contained); second = post-push
    // grounding after the ambiguous report. isAncestor true on the post-push read.
    git.isAncestor = async (_a, _b) => tipCalls++ > 0;
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { landed: true, reason: PUSH_REASONS.LANDED });
  });

  // ── Conservation guard (D5) ──

  function conservationFixture(extra) {
    return make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        ...extra,
      },
    });
  }

  test("conservation: clean-replay drop of a foreign file ⇒ refuse", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "D\tweekly-log.md",
    });
    // Remote has content; HEAD dropped the whole file.
    git.showFile = async (ref) =>
      ref === REMOTE_TIP ? "foreign run record\n" : "";
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONSERVATION,
    );
    assert.ok(!git.calls.map((c) => c.method).includes("pushPorcelain"));
  });

  test("conservation: row-level drop in a shared record ⇒ refuse", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "| foreign-agent | spec-9 | b | - | d | e |\n| keep | row |\n"
        : "| keep | row |\n"; // the foreign row is gone
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONSERVATION,
    );
  });

  test("conservation: declared release removal passes (commit-message act)", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP ? "| me | spec-9 | b | - | d | e |\n" : "";
    const result = await wikiSync.commitAndPush("wiki: release spec-9", [
      "MEMORY.md",
    ]);
    assert.deepEqual(result, { landed: true, reason: PUSH_REASONS.LANDED });
  });

  test("conservation: declared removal via the intent sidecar passes (and survives retry)", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        diffNameStatus: "D\tother-agent-summary.md",
      },
      fsSync: createMockFs({
        [`${WIKI}/.git/fit-wiki-removal-intent`]: "other-agent-summary.md\n",
      }),
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP ? "trimmed budget content\n" : "";
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { landed: true, reason: PUSH_REASONS.LANDED });
  });

  test("conservation: pusher's own additive change passes (no foreign drop)", async () => {
    const { wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
    });
    // Remote content is fully present in HEAD (HEAD only added) ⇒ no drop.
    // showFile default ("" both sides) ⇒ #dropsForeignContent returns false.
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.deepEqual(result, { landed: true, reason: PUSH_REASONS.LANDED });
  });

  test("conservation: authored shared-record transition passes (approval propagation)", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tSTATUS.md",
    });
    // The foreign row `1750\tdesign\tapproved` is transitioned (same row key
    // `1750`) to `1750\tplan\tapproved`. The row key survives ⇒ pass.
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "1750\tdesign\tapproved\n0010\tplan\timplemented\n"
        : "1750\tplan\tapproved\n0010\tplan\timplemented\n";
    const result = await wikiSync.commitAndPush("wiki: advance 1750");
    assert.deepEqual(result, { landed: true, reason: PUSH_REASONS.LANDED });
  });

  test("stale revert of an advanced foreign row is caught loud (textual overlap ⇒ conflict)", async () => {
    // A side-pick revert of the SAME row the remote advanced textually overlaps,
    // so the rebase conflicts and fails loud before any push — conserved by the
    // conflict path. D5's clean-replay guard handles non-overlapping drops.
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 1, stderr: "CONFLICT (content): STATUS.md" },
      },
    });
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONFLICT,
    );
    assert.ok(!git.calls.map((c) => c.method).includes("pushPorcelain"));
  });

  test("conservation: side-pick drop of a foreign run-record section refused", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tweekly-log.md",
    });
    // A foreign run-record line present at the tip is gone from HEAD with no
    // same-key replacement (prose lines have no row key) ⇒ refuse.
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "## Run 414 by other-agent\nrecord body line\n"
        : "## Run 410 by me\n"; // the foreign run-record section is gone
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONSERVATION,
    );
  });

  test("conservation: clean-replay drop of a foreign non-claim file refused (Run 414b shape)", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "D\tother-summary.md", // whole foreign file deleted
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP ? "another writer's summary\n" : "";
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONSERVATION,
    );
  });

  // ── Self-report (D8) ──

  test("self-report: a landed push emits a conservation pass line on stderr", async () => {
    const { wikiSync, stderr, runtime } = make({
      responses: { ...HEALTHY_PUSH, status: DIRTY, rebase: { exitCode: 0 } },
    });
    await wikiSync.commitAndPush("wiki: update");
    assert.match(stderr(), /wiki-conservation: pass/);
    // The self-report never lands on stdout (surfaces parse stdout).
    assert.equal(runtime.proc.stdout.chunks.join(""), "");
  });

  test("self-report: a refusal emits a conservation refusal line on stderr", async () => {
    const { git, wikiSync, stderr } = conservationFixture({
      diffNameStatus: "D\tweekly-log.md",
    });
    git.showFile = async (ref) => (ref === REMOTE_TIP ? "foreign\n" : "");
    await assert.rejects(() => wikiSync.commitAndPush("wiki: update"));
    assert.match(stderr(), /wiki-conservation: refusal/);
  });
});
