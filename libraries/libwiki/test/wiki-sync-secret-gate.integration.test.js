import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { WikiSync } from "../src/wiki-sync.js";
import { git, createBareRepo, seedBareRepo, cloneRepo } from "./helpers.js";

function makeSync(wikiDir, parentDir, resolveToken = () => null, env) {
  const runtime = createDefaultRuntime(env ? { env } : {});
  const gitClient = new GitClient({ runtime });
  return new WikiSync({ runtime, gitClient, wikiDir, parentDir, resolveToken });
}

/** Whether gitleaks resolves in this runner; the secret-gate cases need it. */
function gitleaksAvailable() {
  try {
    execFileSync("gitleaks", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// A fake GitHub PAT — shaped to match the gitleaks `github-pat` rule, not a
// real credential. Assembled from parts so no contiguous token literal sits in
// source (GitHub push-protection would reject the literal); the runtime string
// is still detectable by gitleaks, which scans file content not source.
const FAKE_PAT = ["ghp", "wWPw5k4aXcaT4fNP0UcnZwJUVFk6LO0pINUx"].join("_");

describe("WikiSync secret gate (real git + gitleaks)", () => {
  let bare;

  beforeEach(() => {
    bare = createBareRepo();
    seedBareRepo(bare);
  });

  const skip = !gitleaksAvailable();
  const opts = skip
    ? { skip: "gitleaks binary not available in this runner" }
    : {};

  test(
    "a secret-bearing write is refused and never reaches the remote",
    opts,
    async () => {
      const { parent, wikiDir } = cloneRepo(bare, "gate-block");
      git(wikiDir, "checkout", "master");
      const remoteTipBefore = git(wikiDir, "rev-parse", "origin/master");

      writeFileSync(
        join(wikiDir, "MEMORY.md"),
        `# Memory\ntoken=${FAKE_PAT}\n`,
      );
      const result = await makeSync(wikiDir, parent).commitAndPush(
        "wiki: leak",
      );

      assert.equal(result.pushed, false);
      assert.equal(result.reason, "secret-detected");
      assert.ok(result.findings?.length >= 1, "a finding is reported");
      assert.equal(result.findings[0].rule, "github-pat");
      // No remote contact: the remote tip is unchanged.
      git(wikiDir, "fetch", "origin", "master");
      assert.equal(
        git(wikiDir, "rev-parse", "origin/master"),
        remoteTipBefore,
        "the push must not have advanced the remote",
      );
      // The finding carries no secret value.
      assert.doesNotMatch(JSON.stringify(result.findings), /ghp_/);
    },
  );

  test("a clean write pushes through the gate", opts, async () => {
    const { parent, wikiDir } = cloneRepo(bare, "gate-clean");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, "MEMORY.md"), "# Memory\nno secrets here\n");
    const result = await makeSync(wikiDir, parent).commitAndPush("wiki: clean");
    assert.deepEqual(result, {
      landed: true,
      reason: "landed",
      detections: [],
    });
    assert.equal(git(wikiDir, "diff", "origin/master"), "");
  });

  test(
    "FIT_WIKI_SECRET_OVERRIDE pushes the secret-bearing write and lands an audit log",
    opts,
    async () => {
      const { parent, wikiDir } = cloneRepo(bare, "gate-override");
      git(wikiDir, "checkout", "master");
      writeFileSync(
        join(wikiDir, "MEMORY.md"),
        `# Memory\ntoken=${FAKE_PAT}\n`,
      );

      const result = await makeSync(wikiDir, parent, () => null, {
        FIT_WIKI_SECRET_OVERRIDE: "documented sample token in test fixture",
      }).commitAndPush("wiki: override leak");

      assert.deepEqual(result, {
        landed: true,
        reason: "landed",
        detections: [],
      });
      assert.equal(git(wikiDir, "diff", "origin/master"), "");

      // The audit log landed in the pushed tree and is secret-free.
      const logPath = join(wikiDir, "secret-overrides.log");
      assert.ok(existsSync(logPath), "secret-overrides.log was written");
      const log = readFileSync(logPath, "utf-8");
      assert.match(log, /\tfinding\t/);
      assert.match(log, /documented sample token in test fixture/);
      assert.match(log, /MEMORY\.md:\d+:github-pat/);
      assert.doesNotMatch(
        log,
        /ghp_/,
        "the audit log must not carry the secret",
      );
      // The audit commit rode the same push.
      assert.ok(
        git(wikiDir, "log", "origin/master", "--oneline").includes(
          "secret-gate override",
        ),
        "the override commit reached the remote",
      );
    },
  );
});
