import { test, describe } from "node:test";
import assert from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkJtbd } from "../src/index.js";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
const runtime = createDefaultRuntime();

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), "libcoaligned-jtbd-"));
  for (const sub of ["products", "services", "libraries"]) {
    await mkdir(join(root, sub), { recursive: true });
  }
  return root;
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
    const root = await makeRepo();
    try {
      const result = await checkJtbd({ root, runtime });
      assert.deepStrictEqual(result.findings, []);
      assert.deepStrictEqual(result.stale, []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects a job entry whose bigHire is missing the trailing period", async () => {
    const root = await makeRepo();
    try {
      const pkg = {
        name: "@x/libfoo",
        description: "Foo.",
        jobs: [{ ...validJob, bigHire: "do the thing without a period" }],
      };
      await mkdir(join(root, "libraries", "libfoo"));
      await writeFile(
        join(root, "libraries", "libfoo", "package.json"),
        JSON.stringify(pkg),
      );
      const result = await checkJtbd({ root, runtime });
      const f = result.findings.find(
        (x) => x.id === "jtbd.hire-missing-period",
      );
      assert.ok(
        f,
        `expected jtbd.hire-missing-period finding, got: ${JSON.stringify(result.findings)}`,
      );
      assert.match(f.message, /must end with "\."/);
      assert.ok(f.path.endsWith("libraries/libfoo/package.json"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("--fix regenerates a stale description block", async () => {
    const root = await makeRepo();
    try {
      const pkg = { name: "@x/libfoo", description: "Updated description." };
      await mkdir(join(root, "libraries", "libfoo"));
      await writeFile(
        join(root, "libraries", "libfoo", "package.json"),
        JSON.stringify(pkg),
      );
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
      const readmePath = join(root, "libraries", "libfoo", "README.md");
      await writeFile(readmePath, readme);

      const dryRun = await checkJtbd({ root, fix: false, runtime });
      assert.ok(dryRun.stale.length > 0, "expected stale entries");

      const fixed = await checkJtbd({ root, fix: true, runtime });
      assert.ok(fixed.fixed.length > 0, "expected fix to apply");

      const updated = await readFile(readmePath, "utf8");
      assert.ok(updated.includes("Updated description."));
      assert.ok(!updated.includes("Stale description."));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("accepts Teams Using Agents as a job-author value", async () => {
    const root = await makeRepo();
    try {
      const pkg = {
        name: "@forwardimpact/kata",
        private: true,
        description: "Kata description.",
        jobs: [kataJob],
      };
      await mkdir(join(root, "products", "kata"));
      await writeFile(
        join(root, "products", "kata", "package.json"),
        JSON.stringify(pkg),
      );
      await writeFile(
        join(root, "JTBD.md"),
        "<!-- BEGIN:jobs -->\n<!-- END:jobs -->\n",
      );

      const result = await checkJtbd({ root, runtime });
      assert.deepStrictEqual(result.findings, []);
      assert.ok(result.stale.includes("JTBD.md"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects an unknown persona value", async () => {
    const root = await makeRepo();
    try {
      const pkg = {
        name: "@x/foo",
        description: "Foo.",
        jobs: [{ ...validJob, user: "Teams of Agents" }],
      };
      await mkdir(join(root, "products", "foo"));
      await writeFile(
        join(root, "products", "foo", "package.json"),
        JSON.stringify(pkg),
      );

      const result = await checkJtbd({ root, runtime });
      const f = result.findings.find((x) => x.id === "jtbd.invalid-user");
      assert.ok(
        f,
        `expected jtbd.invalid-user finding, got: ${JSON.stringify(result.findings)}`,
      );
      assert.match(f.message, /invalid user "Teams of Agents"/);
      assert.match(f.hint, /Teams Using Agents/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("renders a Big Hire that satisfies criterion 1 substrings", async () => {
    const root = await makeRepo();
    try {
      const pkg = {
        name: "@forwardimpact/kata",
        private: true,
        description: "Kata description.",
        jobs: [kataJob],
      };
      await mkdir(join(root, "products", "kata"));
      await writeFile(
        join(root, "products", "kata", "package.json"),
        JSON.stringify(pkg),
      );
      await writeFile(
        join(root, "JTBD.md"),
        "<!-- BEGIN:jobs -->\n<!-- END:jobs -->\n",
      );

      await checkJtbd({ root, fix: true, runtime });

      const jtbd = await readFile(join(root, "JTBD.md"), "utf8");
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("regeneration is idempotent across two fix runs", async () => {
    const root = await makeRepo();
    try {
      const pkg = {
        name: "@forwardimpact/kata",
        private: true,
        description: "Kata description.",
        jobs: [kataJob],
      };
      await mkdir(join(root, "products", "kata"));
      await writeFile(
        join(root, "products", "kata", "package.json"),
        JSON.stringify(pkg),
      );
      await writeFile(
        join(root, "JTBD.md"),
        "<!-- BEGIN:jobs -->\n<!-- END:jobs -->\n",
      );

      await checkJtbd({ root, fix: true, runtime });
      const second = await checkJtbd({ root, fix: true, runtime });

      assert.deepStrictEqual(second.fixed, []);
      assert.deepStrictEqual(second.stale, []);
      assert.deepStrictEqual(second.findings, []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
