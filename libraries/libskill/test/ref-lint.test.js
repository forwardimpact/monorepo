import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { extractRefs } from "../src/action-refs.js";
import { buildPlaceholderAllowlist } from "../src/ref-anchors.js";
import { lintActionRefs } from "../src/ref-lint.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, "fixtures", "skill-refs-prefix");

function loadFixture() {
  return [
    "SKILL.md",
    "references/workflow-agent.md",
    "references/workflow-facilitate.md",
    "references/workflow-react.md",
  ].map((path) => ({
    path: `.claude/skills/kata-setup/${path}`,
    text: readFileSync(join(fixtureRoot, path), "utf8"),
  }));
}

// A table-driven resolver fake keyed by `owner/repo`. Each entry is a
// `ResolverResult` (or a function returning one, for the drift class).
// `fallback` is returned for keys absent from the table (default: absent).
function fakeResolver(table, fallback = { state: "absent" }) {
  return ({ owner, repo }) => {
    const key = `${owner}/${repo}`;
    const entry = table[key];
    if (typeof entry === "function") return Promise.resolve(entry());
    return Promise.resolve(entry ?? fallback);
  };
}

const okRefs = (over = {}) => ({
  state: "ok",
  refs: {
    // Cover every literal ref the fixture's resolvable actions use (the real
    // `actions/*` refs are `@v3`/`@v4`) so only the #1551 repos produce findings.
    tags: new Set(["v1", "v1.0.0", "v3", "v4"]),
    heads: new Set(["main"]),
    shas: new Set(["b4a5b262f3d7acaee2da63f8b2a09bcf4730d804"]),
    tagSha: new Map([
      ["v1.0.0", "b4a5b262f3d7acaee2da63f8b2a09bcf4730d804"],
      ["v1", "b4a5b262f3d7acaee2da63f8b2a09bcf4730d804"],
    ]),
    ...over,
  },
});

describe("lintActionRefs — success-criteria matrix", () => {
  const allow = new Map([
    ["{{KATA_AGENT_REF}}", { owner: "forwardimpact", repo: "kata-agent" }],
  ]);

  test("nonexistent repo → finding", async () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/SKILL.md",
        text: "- uses: forwardimpact/does-not-exist@v1",
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist: new Map(),
      resolve: fakeResolver({
        "forwardimpact/does-not-exist": { state: "absent" },
      }),
    });
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0].reason, /repository does not resolve/);
    assert.strictEqual(findings[0].ref, "forwardimpact/does-not-exist@v1");
  });

  test("non-public published ref → finding (exit-128/gate-green path)", async () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/SKILL.md",
        text: "- uses: forwardimpact/private-repo@v1",
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist: new Map(),
      // The resolver maps a private repo (anonymous probe, gate green) to absent.
      resolve: fakeResolver({
        "forwardimpact/private-repo": { state: "absent" },
      }),
    });
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0].reason, /repository does not resolve/);
  });

  test("bad literal ref → finding", async () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/SKILL.md",
        text: "- uses: forwardimpact/kata-agent@v99.0.0",
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist: allow,
      resolve: fakeResolver({ "forwardimpact/kata-agent": okRefs() }),
    });
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0].reason, /ref does not resolve/);
  });

  test("placeholder repo-half wrong → finding; valid placeholder yields none", async () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/references/workflow-agent.md",
        text: "- uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}",
      },
    ]);
    // Valid placeholder, repo resolves → no findings.
    const clean = await lintActionRefs({
      refs,
      allowlist: buildPlaceholderAllowlist(refs),
      resolve: fakeResolver({ "forwardimpact/kata-agent": okRefs() }),
    });
    assert.deepStrictEqual(clean, []);

    // Wrong repo half → finding (repo does not resolve).
    const broken = extractRefs([
      {
        path: ".claude/skills/kata-setup/references/workflow-agent.md",
        text: "- uses: forwardimpact/kata-wrong@{{KATA_AGENT_REF}}",
      },
    ]);
    const findings = await lintActionRefs({
      refs: broken,
      allowlist: buildPlaceholderAllowlist(broken),
      resolve: fakeResolver({
        "forwardimpact/kata-wrong": { state: "absent" },
      }),
    });
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0].reason, /repository does not resolve/);
  });

  test("malformed placeholder (name not on allowlist) → finding", async () => {
    // The allowlist is computed from kata-setup post-@ appearances only. A
    // `@{{NAME}}` in another skill whose NAME is not a known ref substitution
    // is malformed.
    const ksetup = extractRefs([
      {
        path: ".claude/skills/kata-setup/references/workflow-agent.md",
        text: "- uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}",
      },
    ]);
    const allowlist = buildPlaceholderAllowlist(ksetup);
    const refs = extractRefs([
      {
        path: ".claude/skills/fit-harness/SKILL.md",
        text: "- uses: forwardimpact/fit-harness@{{UNKNOWN_REF}}",
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist,
      resolve: fakeResolver({ "forwardimpact/fit-harness": okRefs() }),
    });
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0].reason, /not a known ref substitution/);
  });

  test("anchored contextual stale ref → finding naming the token", async () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/references/workflow-agent.md",
        text: [
          "- uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}",
          "the `kata-agent@v99.0.0` step",
        ].join("\n"),
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist: buildPlaceholderAllowlist(refs),
      resolve: fakeResolver({ "forwardimpact/kata-agent": okRefs() }),
    });
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].line, 2);
    assert.match(findings[0].reason, /ref does not resolve/);
    assert.match(findings[0].ref, /kata-agent@v99.0.0/);
  });

  test("tag/SHA disagreement → finding (resolution-table pin)", async () => {
    const sha = "b4a5b262f3d7acaee2da63f8b2a09bcf4730d804";
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/references/workflow-agent.md",
        text: [
          "- uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}",
          `| \`{{KATA_AGENT_REF}}\` | \`${sha} # v9.9.9\` |`,
        ].join("\n"),
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist: buildPlaceholderAllowlist(refs),
      // The repo resolves and the SHA is known, but tag v9.9.9 does not exist.
      resolve: fakeResolver({ "forwardimpact/kata-agent": okRefs() }),
    });
    assert.strictEqual(findings.length, 1);
    assert.match(findings[0].reason, /tag v9.9.9 does not exist/);
  });

  test("inline @<sha> # <tag> disagreeing → finding", async () => {
    const sha = "1111111111111111111111111111111111111111";
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/SKILL.md",
        text: `Use \`forwardimpact/kata-agent@${sha} # v1.0.0\` as the pin.`,
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist: new Map(),
      // SHA 1111... not in listing; tag v1.0.0 points at a different SHA.
      resolve: fakeResolver({ "forwardimpact/kata-agent": okRefs() }),
    });
    // Two findings: SHA not found, and tag disagreement.
    assert.ok(findings.some((f) => /pinned SHA not found/.test(f.reason)));
    assert.ok(
      findings.some((f) => /does not point at the pinned SHA/.test(f.reason)),
    );
  });

  test("drift class: same content, reality flips ok → absent on a later pass", async () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/SKILL.md",
        text: "- uses: forwardimpact/kata-agent@v1",
      },
    ]);
    // First pass: repo present.
    const first = await lintActionRefs({
      refs,
      allowlist: new Map(),
      resolve: fakeResolver({ "forwardimpact/kata-agent": okRefs() }),
    });
    assert.deepStrictEqual(first, []);
    // Second pass: identical content, the repo has since been removed.
    const second = await lintActionRefs({
      refs,
      allowlist: new Map(),
      resolve: fakeResolver({
        "forwardimpact/kata-agent": { state: "absent" },
      }),
    });
    assert.strictEqual(second.length, 1);
    assert.match(second[0].reason, /repository does not resolve/);
  });

  test("all-resolvable clean tree → zero findings", async () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/SKILL.md",
        text: [
          "- uses: forwardimpact/kata-agent@v1",
          "install `libfoo@v0.1.5` and measure `pass@k`",
        ].join("\n"),
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist: new Map(),
      resolve: fakeResolver({ "forwardimpact/kata-agent": okRefs() }),
    });
    assert.deepStrictEqual(findings, []);
  });

  test("unreachable → sentinel, never a pass", async () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/SKILL.md",
        text: "- uses: forwardimpact/kata-agent@v1",
      },
    ]);
    const findings = await lintActionRefs({
      refs,
      allowlist: new Map(),
      resolve: fakeResolver({
        "forwardimpact/kata-agent": { state: "unreachable" },
      }),
    });
    assert.deepStrictEqual(findings, [{ kind: "unreachable" }]);
  });
});

describe("lintActionRefs — pre-fix corpus", () => {
  test("the full #1551 defect yields 12 findings across 11 sites", async () => {
    const refs = extractRefs(loadFixture());
    const allowlist = buildPlaceholderAllowlist(refs);
    // The two nonexistent repos resolve to absent (exit-128/gate-green); the
    // anchor gate is green throughout.
    // Only the two #1551 repos are absent; every other action (actions/*,
    // forwardimpact/kata-agent placeholders) resolves cleanly.
    const findings = await lintActionRefs({
      refs,
      allowlist,
      resolve: fakeResolver(
        {
          "forwardimpact/kata-action-agent": { state: "absent" },
          "forwardimpact/kata-action-eval": { state: "absent" },
        },
        okRefs({ tags: new Set(["v1", "v1.0.0", "v3", "v4"]) }),
      ),
    });
    // Every finding names a nonexistent repo with the "does not resolve" reason.
    assert.ok(
      findings.every((f) => /does not resolve/.test(f.reason)),
      "all findings are repo-absent",
    );
    assert.ok(
      findings.every(
        (f) =>
          /kata-action-agent/.test(f.ref) || /kata-action-eval/.test(f.ref),
      ),
      "all findings name a nonexistent repo",
    );
    const sites = new Set(findings.map((f) => `${f.file}:${f.line}`));
    assert.strictEqual(sites.size, 11, "11 distinct sites");
    assert.strictEqual(
      findings.length,
      12,
      "12 findings (react bare-name = 2)",
    );
  });
});
