import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { runClaimCommand, runReleaseCommand } from "../src/commands/claim.js";
import { WikiSync } from "../src/wiki-sync.js";
import { appendClaim, parseClaims } from "../src/active-claims.js";
import {
  git,
  createBareRepo,
  seedBareRepo,
  cloneRepo,
  makeRuntime,
  ctxFor,
} from "./helpers.js";

const EMPTY_CLAIMS =
  "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| *None* | — | — | — | — | — |\n";

describe("claim/release push integration (real git)", () => {
  let bare;
  let parent;
  let wikiDir;
  let memPath;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
    ({ parent, wikiDir } = cloneRepo(bare, "claim-push"));
    git(wikiDir, "checkout", "master");
    memPath = join(wikiDir, "MEMORY.md");
    writeFileSync(memPath, EMPTY_CLAIMS);
  });

  function harnessFor() {
    const harness = makeRuntime({ cwd: parent });
    const wikiSync = new WikiSync({
      runtime: harness.runtime,
      gitClient: new GitClient({ runtime: harness.runtime }),
      wikiDir,
      parentDir: parent,
      resolveToken: () => null,
    });
    return { harness, wikiSync };
  }

  test("claim pushes to remote", async () => {
    const { harness, wikiSync } = harnessFor();
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.match(
      git(bare, "log", "--oneline", "-1", "master"),
      /wiki: claim spec-NNNN/,
    );
  });

  test("claim leaves foreign dirty and untracked files out of the commit", async () => {
    // Residue another writer left in the shared workspace: a modified
    // tracked file and a brand-new untracked file (#1568).
    writeFileSync(join(wikiDir, "README.md"), "# Wiki\nforeign edit\n");
    writeFileSync(join(wikiDir, "foreign.md"), "untracked residue\n");
    const { harness, wikiSync } = harnessFor();
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.equal(
      git(bare, "diff-tree", "--no-commit-id", "--name-only", "-r", "master"),
      "MEMORY.md",
      "the pushed commit must touch MEMORY.md only",
    );
    // The git() helper trims output, so anchor on file names not columns.
    const status = git(wikiDir, "status", "--porcelain");
    assert.match(status, /M README\.md/, "foreign edit survives in the tree");
    assert.match(status, /\?\? foreign\.md/, "untracked residue survives");
  });

  test("release pushes to remote", async () => {
    writeFileSync(
      memPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | spec-NNNN | feat/x | — | 2099-01-01 | 2099-01-08 |\n",
    );
    const { harness, wikiSync } = harnessFor();
    const result = await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.match(
      git(bare, "log", "--oneline", "-1", "master"),
      /wiki: release spec-NNNN/,
    );
  });

  test("release leaves foreign dirty files out of the commit", async () => {
    writeFileSync(
      memPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | spec-NNNN | feat/x | — | 2099-01-01 | 2099-01-08 |\n",
    );
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "seed memory");
    git(wikiDir, "push", "origin", "master");
    writeFileSync(join(wikiDir, "README.md"), "# Wiki\nforeign edit\n");

    const { harness, wikiSync } = harnessFor();
    const result = await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    assert.equal(
      git(wikiDir, "show", "--name-only", "--format=", "HEAD"),
      "MEMORY.md",
    );
    assert.match(
      git(wikiDir, "status", "--porcelain"),
      /M README\.md/,
      "foreign edit survives in the tree",
    );
  });

  // Advance the bare origin's master with a foreign claim row so the local
  // claim/release lands on a stale base and must re-apply.
  function advanceOriginWithClaim(name, claim) {
    const { wikiDir: other } = cloneRepo(bare, name);
    git(other, "checkout", "master");
    const op = join(other, "MEMORY.md");
    // The origin master has no MEMORY.md yet in this suite's seed, so write the
    // full table first; if a prior advance committed one, build on it.
    const base = (() => {
      try {
        return git(other, "show", "master:MEMORY.md");
      } catch {
        return EMPTY_CLAIMS;
      }
    })();
    writeFileSync(op, appendClaim(base, claim).text);
    git(other, "add", "-A");
    git(other, "commit", "-m", `wiki: claim ${claim.target}`);
    git(other, "push", "origin", "master");
  }

  function makeClaim(agent, target) {
    return {
      agent,
      target,
      branch: `feat/${target}`,
      pr: null,
      claimed_at: "2099-01-01",
      expires_at: "2099-01-08",
    };
  }

  test("claim with a detached HEAD refuses non-zero (ancestry guard — not published)", async () => {
    const head = git(wikiDir, "rev-parse", "HEAD");
    git(wikiDir, "checkout", head); // detach
    const { harness, wikiSync } = harnessFor();
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    // The detached-HEAD D7 fixture collapses onto 1750's ancestry guard, which
    // refuses with an AncestryRefusal (spec 1780 D7 seam defers to 1750). On the
    // claim surface that maps to the not-published non-zero envelope.
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(harness.stderr, /not published/i);
    // The row was written to MEMORY.md but never committed: present only as an
    // uncommitted working-tree change, and no push landed on the remote.
    assert.match(readFileSync(memPath, "utf-8"), /spec-NNNN/);
    assert.match(git(wikiDir, "status", "--porcelain"), /MEMORY\.md/);
    assert.equal(git(wikiDir, "rev-parse", "HEAD"), head);
    assert.doesNotMatch(
      git(bare, "log", "--oneline", "-5", "master"),
      /wiki: claim spec-NNNN/,
    );
  });

  test("a claim racing a sibling's claim on the tail lands both", async () => {
    // Commit the empty table to origin, then a sibling advances the tip.
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "seed claims");
    git(wikiDir, "push", "origin", "master");
    advanceOriginWithClaim("sibling-a", makeClaim("product-manager", "1900"));

    const { harness, wikiSync } = harnessFor();
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "1910",
          branch: "feat/1910",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);

    const { wikiDir: verify } = cloneRepo(bare, "claim-verify");
    git(verify, "checkout", "master");
    const targets = parseClaims(
      readFileSync(join(verify, "MEMORY.md"), "utf-8"),
    ).map((c) => `${c.agent}/${c.target}`);
    assert.ok(targets.includes("product-manager/1900"), "sibling conserved");
    assert.ok(targets.includes("staff-engineer/1910"), "own claim landed");
  });

  test("release refuses on a detached HEAD: non-zero, not published", async () => {
    // First land a claim cleanly on master, then detach and try to release it.
    const seed = harnessFor();
    await runClaimCommand(
      ctxFor({
        runtime: seed.harness.runtime,
        wikiSync: seed.wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    const head = git(wikiDir, "rev-parse", "HEAD");
    git(wikiDir, "checkout", head); // detach
    const { harness, wikiSync } = harnessFor();
    const result = await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-NNNN",
        },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(harness.stderr, /not published/i);
    assert.equal(git(wikiDir, "rev-parse", "HEAD"), head);
    // No release commit reached the remote.
    assert.doesNotMatch(
      git(bare, "log", "--oneline", "-5", "master"),
      /wiki: release spec-NNNN/,
    );
  });

  test("a release racing a foreign claim lands both outcomes", async () => {
    // Origin starts with the releasing agent's row already present.
    writeFileSync(
      memPath,
      appendClaim(EMPTY_CLAIMS, makeClaim("staff-engineer", "1910")).text,
    );
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "seed with se row");
    git(wikiDir, "push", "origin", "master");
    // A sibling adds a foreign claim on the tip after the local read.
    advanceOriginWithClaim("sibling-b", makeClaim("product-manager", "1900"));

    const { harness, wikiSync } = harnessFor();
    const result = await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "1910",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);

    const { wikiDir: verify } = cloneRepo(bare, "release-verify");
    git(verify, "checkout", "master");
    const targets = parseClaims(
      readFileSync(join(verify, "MEMORY.md"), "utf-8"),
    ).map((c) => `${c.agent}/${c.target}`);
    assert.ok(
      targets.includes("product-manager/1900"),
      "foreign claim conserved",
    );
    assert.ok(
      !targets.includes("staff-engineer/1910"),
      "the released row is gone from the tip",
    );
  });

  test("re-applying a release after the row is already gone leaves it absent (criterion 3)", async () => {
    // Seed with the SE row, push; a sibling then BOTH adds a foreign row AND
    // removes the SE row on the tip. The local release must not resurrect it.
    writeFileSync(
      memPath,
      appendClaim(EMPTY_CLAIMS, makeClaim("staff-engineer", "1910")).text,
    );
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "seed se row");
    git(wikiDir, "push", "origin", "master");
    // Sibling tip: only the foreign row remains (SE row already released there).
    const { wikiDir: sib } = cloneRepo(bare, "sib-release");
    git(sib, "checkout", "master");
    writeFileSync(
      join(sib, "MEMORY.md"),
      appendClaim(EMPTY_CLAIMS, makeClaim("product-manager", "1900")).text,
    );
    git(sib, "add", "-A");
    git(sib, "commit", "-m", "foreign release+claim");
    git(sib, "push", "origin", "master");

    const { harness, wikiSync } = harnessFor();
    await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "1910",
          today: "2099-01-01",
        },
      }),
    );
    const { wikiDir: verify } = cloneRepo(bare, "rel-absent-verify");
    git(verify, "checkout", "master");
    const targets = parseClaims(
      readFileSync(join(verify, "MEMORY.md"), "utf-8"),
    ).map((c) => `${c.agent}/${c.target}`);
    assert.ok(targets.includes("product-manager/1900"), "foreign row intact");
    assert.ok(
      !targets.includes("staff-engineer/1910"),
      "released row stays absent — re-apply did not resurrect it",
    );
  });

  test("--expired re-derived on a renewed tip leaves the renewal intact (criterion 3 freshness)", async () => {
    // Local read sees an expired SE row; the tip carries a RENEWED (future
    // expiry) SE row landed since the stale read, plus a foreign row. The
    // expiry re-apply must re-derive against the tip and spare the renewal.
    const expired = {
      ...makeClaim("staff-engineer", "1910"),
      expires_at: "2000-01-01",
    };
    writeFileSync(memPath, appendClaim(EMPTY_CLAIMS, expired).text);
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "seed expired");
    git(wikiDir, "push", "origin", "master");
    // Sibling renews the SE row (future expiry) and adds a foreign row.
    const { wikiDir: sib } = cloneRepo(bare, "sib-renew");
    git(sib, "checkout", "master");
    let tipText = appendClaim(
      EMPTY_CLAIMS,
      makeClaim("staff-engineer", "1910"), // 2099 expiry = renewed
    ).text;
    tipText = appendClaim(tipText, makeClaim("product-manager", "1900")).text;
    writeFileSync(join(sib, "MEMORY.md"), tipText);
    git(sib, "add", "-A");
    git(sib, "commit", "-m", "renew + foreign");
    git(sib, "push", "origin", "master");

    const { harness, wikiSync } = harnessFor();
    await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          expired: true,
          today: "2099-01-01",
        },
      }),
    );
    const { wikiDir: verify } = cloneRepo(bare, "expired-verify");
    git(verify, "checkout", "master");
    const claims = parseClaims(
      readFileSync(join(verify, "MEMORY.md"), "utf-8"),
    );
    const se = claims.find(
      (c) => c.agent === "staff-engineer" && c.target === "1910",
    );
    assert.ok(se, "the renewed SE row survives the expiry re-apply");
    assert.equal(se.expires_at, "2099-01-08", "the renewal, not the stale row");
    assert.ok(
      claims.some((c) => c.target === "1900"),
      "foreign row conserved",
    );
  });

  test("claim with a transport-failing push keeps zero exit + saved-locally warning (D1)", async () => {
    // Break the remote so fetch and push fail at transport: the claim row
    // landed locally, so the surface keeps a zero exit and warns saved-locally.
    git(wikiDir, "remote", "set-url", "origin", "/nonexistent/remote.git");
    const { harness, wikiSync } = harnessFor();
    const result = await runClaimCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          agent: "staff-engineer",
          target: "spec-TTTT",
          branch: "feat/x",
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true, "landed-locally claim keeps zero exit");
    assert.match(harness.stderr, /saved locally/i);
    assert.match(harness.stderr, /transport/);
    assert.doesNotMatch(harness.stdout, /committed and pushed/);
    assert.match(readFileSync(memPath, "utf-8"), /spec-TTTT/);
  });

  test("release --expired maps outcomes like claim (lands when healthy)", async () => {
    // Seed an expired foreign claim, then release --expired and observe a
    // healthy landed push removing the expired row.
    writeFileSync(
      memPath,
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| old-agent | spec-OLD | b | - | 2000-01-01 | 2000-01-08 |\n",
    );
    const { harness, wikiSync } = harnessFor();
    const result = await runReleaseCommand(
      ctxFor({
        runtime: harness.runtime,
        wikiSync,
        options: {
          "wiki-root": wikiDir,
          expired: true,
          today: "2099-01-01",
        },
      }),
    );
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /push: committed and pushed/);
    // The expired row's removal landed (content state, not log output).
    assert.doesNotMatch(git(wikiDir, "show", "HEAD:MEMORY.md"), /spec-OLD/);
  });
});
