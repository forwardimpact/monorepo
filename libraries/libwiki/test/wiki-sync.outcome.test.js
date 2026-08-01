import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import {
  WikiSync,
  WikiPushFailure,
  AncestryRefusal,
  PUSH_REASONS,
} from "../src/wiki-sync.js";
// The shared harness composes the honest push-flow responses (HEALTHY_PUSH)
// with the foundation guards (mid-merge, ancestry, marker, secret). A
// push-focused test then reaches a grounded landing under the composed flow
// (ancestry guard + merge discipline + integrity probe).
import { WIKI, HEALTHY_PUSH, REMOTE_TIP, make } from "./wiki-sync-harness.js";

describe("WikiSync honest-outcome contract", () => {
  const DIRTY = { stdout: " M MEMORY.md", stderr: "", exitCode: 0 };

  function rejectsReason(promiseFn, reason) {
    return assert.rejects(
      promiseFn,
      (err) => err instanceof WikiPushFailure && err.reason === reason,
    );
  }

  test("precondition: rebase-in-progress refuses before any mutation", async () => {
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

  test("detached HEAD refuses before any mutation (ancestry guard, D7 seam defers to 1750)", async () => {
    // The detached-HEAD D7 fixture collapses onto the ancestry guard. The
    // guard refuses with an AncestryRefusal ("unverifiable") before any
    // mutation. The ancestry guard names the reason for that fixture.
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        headBranch: "",
        refExists: true,
        status: DIRTY,
      },
    });
    await assert.rejects(
      () => wikiSync.commitAndPush("wiki: update"),
      (err) => err instanceof AncestryRefusal && err.kind === "unverifiable",
    );
    const m = git.calls.map((c) => c.method);
    assert.ok(!m.includes("commitAll") && !m.includes("pushPorcelain"));
  });

  test("residue-conflict: autostash pop leaves UU ⇒ refuse, stash preserved by SHA", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0, stderr: "" }, // rebase ok but pop conflicts
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
    assert.ok(
      !m.includes("stashDropBySha"),
      "commitAndPush preserves the stash and does not drop it",
    );
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
    // Inadmissible channels (prose, exit 0) report success. The per-ref `!`
    // flag says rejected, and the remote tip does not advance.
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
    // The first remoteRefTip grounds the pre-push check (not contained). The
    // second grounds the post-push check after the ambiguous report.
    // isAncestor is true on the post-push read.
    git.isAncestor = async (_a, _b) => tipCalls++ > 0;
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  // ── Conservation guard (D5) ──

  // The code asks `isAncestor` two opposite questions. The nothing-to-push
  // check asks `isAncestor("HEAD", tip)` (remote already has HEAD). The
  // conservation guard asks `isAncestor(tip, "HEAD")` (HEAD descends from the
  // remote tip). The conservation fixtures push real content onto a HEAD that
  // descends from the tip after the rebase. They are not nothing-to-push. So
  // answer the two questions by argument order. `staleBase: true` models a
  // stale-base HEAD that never saw the remote advance (clean-replay /
  // stale-revert), so the guard's question answers false.
  function conservationFixture(extra = {}) {
    const { staleBase = false, ...rest } = extra;
    const fx = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        ...rest,
      },
    });
    fx.git.isAncestor = async (a) => (a === "HEAD" ? false : !staleBase); // nothing-to-push no, descends yes unless stale
    return fx;
  }

  test("conservation: clean-replay drop of a foreign file ⇒ refuse", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "D\tweekly-log.md",
    });
    // The remote has content. HEAD dropped the whole file.
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
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  test("conservation: a stale-base release that drops a live foreign row gets no blanket exemption", async () => {
    // Someone writes a `release --expired` from a stale base. It legitimately
    // drops the expired row. Its stale tree also lacks a live foreign row that
    // another writer added after the base. The blanket release-message
    // exemption must not pass that collateral live-row drop (D5). The
    // deliberate act is the released row. It is not a file-level pass. A stale
    // base never saw the live row, so the guard catches the drop.
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
      staleBase: true,
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "| other | live-target | b | - | d | e |\n" // live foreign row at tip
        : ""; // stale HEAD never had it
    await rejectsReason(
      () =>
        wikiSync.commitAndPush("wiki: release expired claims", ["MEMORY.md"]),
      PUSH_REASONS.CONSERVATION,
    );
  });

  test("conservation: declared removal through the intent sidecar passes (and survives retry)", async () => {
    const { git, wikiSync } = make({
      responses: {
        ...HEALTHY_PUSH,
        status: DIRTY,
        rebase: { exitCode: 0 },
        diffNameStatus: "D\tother-agent-summary.md",
      },
      fsSync: createMockFs({
        [`${WIKI}/.git/gemba-wiki-removal-intent`]: "other-agent-summary.md\n",
      }),
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP ? "trimmed budget content\n" : "";
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  test("conservation: pusher's own additive change passes (no foreign drop)", async () => {
    const { wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
    });
    // HEAD holds all the remote content (HEAD only added) ⇒ no drop.
    // showFile default ("" both sides) ⇒ #dropsForeignContent returns false.
    const result = await wikiSync.commitAndPush("wiki: update");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  test("conservation: authored shared-record transition passes (approval propagation)", async () => {
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tSTATUS.md",
    });
    // HEAD transitions the foreign row `1750\tdesign\tapproved` to
    // `1750\tplan\tapproved` with the same row key `1750`. The row key
    // survives ⇒ pass.
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "1750\tdesign\tapproved\n0010\tplan\timplemented\n"
        : "1750\tplan\tapproved\n0010\tplan\timplemented\n";
    const result = await wikiSync.commitAndPush("wiki: advance 1750");
    assert.equal(result.landed, true);
    assert.equal(result.reason, PUSH_REASONS.LANDED);
  });

  test("a stale revert of an advanced foreign row fails loud (textual overlap ⇒ conflict)", async () => {
    // A side-pick revert of the SAME row the remote advanced overlaps it
    // textually. So the rebase conflicts and fails loud before any push. The
    // conflict path conserves the row. D5's clean-replay guard handles drops
    // that do not overlap.
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

  test("conservation: a stale revert of an advanced foreign row refused (no textual overlap)", async () => {
    // The clean-replay shape (spec criterion: stale revert refused). A
    // stale-base commit restores a superseded state of a foreign row that the
    // remote advanced. The pushed history holds no authored transition. The
    // row key survives, so the key heuristic alone would read it as a
    // transition. But HEAD does not descend from the remote tip (stale base),
    // so it is a revert.
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tSTATUS.md",
      staleBase: true, // HEAD came from a stale base and never saw the advance
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "1750\tplan\tapproved\n0010\tplan\timplemented\n" // remote advanced
        : "1750\tdesign\tapproved\n0010\tplan\timplemented\n"; // HEAD restores old
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONSERVATION,
    );
  });

  test("conservation: side-pick drop of a foreign run-record section refused", async () => {
    // A side-pick keeps the local side of a conflict. It drops a foreign
    // run-record section that the pusher's stale base never saw. The guard
    // keys the drop off the stale base (`staleBase: true`). The prose lines
    // sit at the tip and are absent from HEAD, with no authored edit over the
    // tip, so the guard refuses.
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tweekly-log.md",
      staleBase: true,
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "## Run 414 by other-agent\nrecord body line\n"
        : "## Run 410 by me\n"; // the foreign run-record section is gone
    await rejectsReason(
      () => wikiSync.commitAndPush("wiki: update"),
      PUSH_REASONS.CONSERVATION,
    );
  });

  test("conservation: drop of one claim row of a multi-row agent refused (non-unique key)", async () => {
    // The Active Claims table uses (agent, target) as its key. Agent alone fans
    // out to many rows. A drop of agent X's proj-200 row while X's proj-100
    // survives must refuse. A single-cell key would wrongly read it as a
    // transition.
    const { git, wikiSync } = conservationFixture({
      diffNameStatus: "M\tMEMORY.md",
    });
    git.showFile = async (ref) =>
      ref === REMOTE_TIP
        ? "| X | proj-100 | b | - | d | e |\n| X | proj-200 | b | - | d | e |\n"
        : "| X | proj-100 | b | - | d | e |\n"; // proj-200 row dropped
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
