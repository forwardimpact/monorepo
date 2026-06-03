import { test, describe } from "node:test";
import assert from "node:assert";

import { checkJtbd } from "../src/index.js";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

const ROOT = "/repo";

/**
 * Build a runtime over an in-memory fs seeded with `files` (a path→content map
 * rooted at `/repo`). `checkJtbd` reads and rewrites through `runtime.fsSync`,
 * so the seeded map is the on-disk repo it inspects.
 */
function fsWith(files = {}) {
  return createMockFs(files);
}

function runtimeWith(fs) {
  return createTestRuntime({ fs });
}

const validJob = {
  user: "Platform Builders",
  goal: "Test Goal",
  trigger: "A test moment.",
  bigHire: "do the thing.",
  littleHire: "do the small thing.",
  competesWith: "doing nothing; hand-rolling",
};

const kataJob = {
  user: "Teams Using Agents",
  goal: "Run a Continuously Improving Agent Team",
  trigger:
    "Agents are shipping work but nobody can tell whether the team is getting better — the only feedback loop is reading every diff.",
  bigHire:
    "run an autonomous, continuously improving development team that plans, ships, studies its own traces, and acts on findings.",
  littleHire:
    "onboard a Kata installation that runs the Plan-Do-Study-Act loop without per-team prompt engineering.",
  competesWith:
    "bespoke per-agent system prompts; manual orchestration scripts; not measuring agent outcomes; abandoning agent investment after a failed pilot",
  forces: {
    push: "Agent regressions are silent until users complain.",
    pull: "A closed loop that surfaces what improved and what regressed, grounded in evidence.",
    habit: "Treating each agent run as a one-off rather than an iteration.",
    anxiety:
      "Autonomy might amplify bad patterns faster than humans can intervene.",
  },
  firedWhen:
    "the autonomous loop becomes harder to operate than direct prompting; or organizational policy bans autonomous agent execution.",
};

describe("checkJtbd", () => {
  test("passes on an empty repo with no packages", async () => {
    const result = await checkJtbd({
      root: ROOT,
      runtime: runtimeWith(fsWith()),
    });
    assert.deepStrictEqual(result.findings, []);
    assert.deepStrictEqual(result.stale, []);
  });

  test("rejects a job entry whose bigHire is missing the trailing period", async () => {
    const pkg = {
      name: "@x/libfoo",
      description: "Foo.",
      jobs: [{ ...validJob, bigHire: "do the thing without a period" }],
    };
    const result = await checkJtbd({
      root: ROOT,
      runtime: runtimeWith(
        fsWith({
          [`${ROOT}/libraries/libfoo/package.json`]: JSON.stringify(pkg),
        }),
      ),
    });
    const f = result.findings.find((x) => x.id === "jtbd.hire-missing-period");
    assert.ok(
      f,
      `expected jtbd.hire-missing-period finding, got: ${JSON.stringify(result.findings)}`,
    );
    assert.match(f.message, /must end with "\."/);
    assert.ok(f.path.endsWith("libraries/libfoo/package.json"));
  });

  test("--fix regenerates a stale description block", async () => {
    const pkg = { name: "@x/libfoo", description: "Updated description." };
    const readme = [
      "# libfoo",
      "",
      "<!-- BEGIN:description -->",
      "",
      "Stale description.",
      "",
      "<!-- END:description -->",
      "",
    ].join("\n");
    const readmePath = `${ROOT}/libraries/libfoo/README.md`;
    const fs = fsWith({
      [`${ROOT}/libraries/libfoo/package.json`]: JSON.stringify(pkg),
      [readmePath]: readme,
    });

    const dryRun = await checkJtbd({
      root: ROOT,
      fix: false,
      runtime: runtimeWith(fs),
    });
    assert.ok(dryRun.stale.length > 0, "expected stale entries");

    const fixed = await checkJtbd({
      root: ROOT,
      fix: true,
      runtime: runtimeWith(fs),
    });
    assert.ok(fixed.fixed.length > 0, "expected fix to apply");

    const updated = fs.readFileSync(readmePath, "utf8");
    assert.ok(updated.includes("Updated description."));
    assert.ok(!updated.includes("Stale description."));
  });

  test("accepts Teams Using Agents as a job-author value", async () => {
    const pkg = {
      name: "@forwardimpact/kata",
      private: true,
      description: "Kata description.",
      jobs: [kataJob],
    };
    const result = await checkJtbd({
      root: ROOT,
      runtime: runtimeWith(
        fsWith({
          [`${ROOT}/products/kata/package.json`]: JSON.stringify(pkg),
          [`${ROOT}/JTBD.md`]: "<!-- BEGIN:jobs -->\n<!-- END:jobs -->\n",
        }),
      ),
    });
    assert.deepStrictEqual(result.findings, []);
    assert.ok(result.stale.includes("JTBD.md"));
  });

  test("rejects an unknown persona value", async () => {
    const pkg = {
      name: "@x/foo",
      description: "Foo.",
      jobs: [{ ...validJob, user: "Teams of Agents" }],
    };
    const result = await checkJtbd({
      root: ROOT,
      runtime: runtimeWith(
        fsWith({
          [`${ROOT}/products/foo/package.json`]: JSON.stringify(pkg),
        }),
      ),
    });
    const f = result.findings.find((x) => x.id === "jtbd.invalid-user");
    assert.ok(
      f,
      `expected jtbd.invalid-user finding, got: ${JSON.stringify(result.findings)}`,
    );
    assert.match(f.message, /invalid user "Teams of Agents"/);
    assert.match(f.hint, /Teams Using Agents/);
  });

  test("renders a Big Hire that satisfies criterion 1 substrings", async () => {
    const pkg = {
      name: "@forwardimpact/kata",
      private: true,
      description: "Kata description.",
      jobs: [kataJob],
    };
    const fs = fsWith({
      [`${ROOT}/products/kata/package.json`]: JSON.stringify(pkg),
      [`${ROOT}/JTBD.md`]: "<!-- BEGIN:jobs -->\n<!-- END:jobs -->\n",
    });

    await checkJtbd({ root: ROOT, fix: true, runtime: runtimeWith(fs) });

    const jtbd = fs.readFileSync(`${ROOT}/JTBD.md`, "utf8");
    const start = jtbd.indexOf("**Big Hire:**");
    assert.ok(start >= 0, "Big Hire label missing from JTBD.md");
    const end = jtbd.indexOf("\n\n", start);
    const bigHire = jtbd.slice(start, end);

    assert.ok(
      bigHire.toLowerCase().includes("autonomous"),
      `Big Hire missing 'autonomous': ${bigHire}`,
    );
    for (const token of ["plan", "ship", "stud", "act"]) {
      assert.ok(
        bigHire.toLowerCase().includes(token),
        `Big Hire missing '${token}': ${bigHire}`,
      );
    }
    assert.match(bigHire, /→ \*\*Kata\*\*$/);
  });

  test("regeneration is idempotent across two fix runs", async () => {
    const pkg = {
      name: "@forwardimpact/kata",
      private: true,
      description: "Kata description.",
      jobs: [kataJob],
    };
    const fs = fsWith({
      [`${ROOT}/products/kata/package.json`]: JSON.stringify(pkg),
      [`${ROOT}/JTBD.md`]: "<!-- BEGIN:jobs -->\n<!-- END:jobs -->\n",
    });

    await checkJtbd({ root: ROOT, fix: true, runtime: runtimeWith(fs) });
    const second = await checkJtbd({
      root: ROOT,
      fix: true,
      runtime: runtimeWith(fs),
    });

    assert.deepStrictEqual(second.fixed, []);
    assert.deepStrictEqual(second.stale, []);
    assert.deepStrictEqual(second.findings, []);
  });
});
