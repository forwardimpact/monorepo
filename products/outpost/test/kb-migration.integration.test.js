import { describe, test, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { validateKnowledgeBase } from "../src/kb-validator.js";

// Criterion 11: the migration playbook converges. This test encodes the
// deterministic operations of templates/MIGRATION.md as the mechanical
// convergence proof, with the human gates simulated by fixed inputs (the
// tier map for Gate 1, the routing list for Gate 2, the baseline for
// Gate 3; Gate 4 is out of test scope). When the playbook text changes,
// this test is the parity check that must change with it.
const roots = [];
after(async () => {
  for (const root of roots)
    await fsp.rm(root, { recursive: true, force: true });
});

const runtime = { fs: fsp };

async function write(root, rel, content) {
  await fsp.mkdir(dirname(join(root, rel)), { recursive: true });
  await fsp.writeFile(join(root, rel), content);
}

/** Build the legacy fixture vault with the spec's seeded violations. */
async function buildLegacyVault() {
  const root = await fsp.mkdtemp(join(tmpdir(), "kb-migration-"));
  roots.push(root);
  // A mixed-audience person note: team facts plus a recruitment backlink,
  // legacy inline **Key:** metadata, and no frontmatter.
  await write(
    root,
    "Knowledge/People/Jane Doe.md",
    [
      "# Jane Doe",
      "",
      "## Info",
      "**Role:** Engineer",
      "**Aliases:** Janie",
      "",
      "## Activity",
      "- **2026-01-05** (meeting): project sync [[Projects/Apollo]]",
      "- **2026-01-06** (email): offer discussion, see" +
        " [[Candidates/Jane Doe/offer]]",
    ].join("\n"),
  );
  // A wider-audience note with a bare wiki link and a by-design dangling
  // link (a scheduled skill mints links ahead of the target).
  await write(
    root,
    "Knowledge/Projects/Apollo.md",
    "# Apollo\n\nLead: [[Jane Doe]]. Weekly notes in [[Projects/Q3 Report]].",
  );
  // A recruitment record, and a grown directory the template never shipped.
  await write(root, "Knowledge/Candidates/Jane Doe/offer.md", "# Offer\n");
  await write(root, "Knowledge/Research/Papers.md", "# Papers\n");
  // The personal drafts directory with the draft-status ledgers.
  await write(root, "Drafts/handled", "id-1\n");
  await write(root, "Drafts/ignored", "id-2\n");
  return root;
}

// Gate 1 (fixed input): the approved tier map and directory-to-type map.
const TIER_MAP = {
  "Knowledge/People": "3-Team/People",
  "Knowledge/Projects": "3-Team/Projects",
  "Knowledge/Research": "3-Team/Research",
  "Knowledge/Candidates": "2-Confidential/Candidates",
};
const REGISTRY = [
  "types:",
  "  People: person",
  "  Projects: project",
  "  Research: topic",
  "  Candidates: candidate",
  "status:",
  "  candidate: [new, screening, interviewing, offer, hired, rejected, withdrawn]",
  "",
].join("\n");

const FM = {
  person: (aliases) =>
    `---\ntype: person\ncreated: 2026-01-05\nupdated: 2026-01-06\n` +
    `aliases:\n  - "${aliases}"\n---\n`,
  project: `---\ntype: project\ncreated: 2026-01-05\nupdated: 2026-01-06\n---\n`,
  topic: `---\ntype: topic\ncreated: 2026-01-05\nupdated: 2026-01-06\n---\n`,
  candidate:
    `---\ntype: candidate\ncreated: 2026-01-05\nupdated: 2026-01-06\n` +
    `aliases:\n  - "Janie"\nstatus: offer\n---\n`,
};

/** Phases 3–5: move, rewrite, split, stamp, and baseline — mechanically. */
async function migrate(root) {
  // Phase 3: create the tiers and move each directory per the tier map.
  for (const tier of [
    "0-Draft",
    "1-Management",
    "2-Confidential",
    "3-Team",
    "4-Public",
  ]) {
    await fsp.mkdir(join(root, tier), { recursive: true });
  }
  for (const [from, to] of Object.entries(TIER_MAP)) {
    await fsp.mkdir(dirname(join(root, to)), { recursive: true });
    await fsp.rename(join(root, from), join(root, to));
  }
  await fsp.rmdir(join(root, "Knowledge"));
  // The draft-status ledgers are agent state and leave the graph (the real
  // playbook moves them to ~/.cache/fit/outpost/drafts/).
  const cache = await fsp.mkdtemp(join(tmpdir(), "kb-migration-cache-"));
  roots.push(cache);
  for (const ledger of ["handled", "ignored"]) {
    await fsp.rename(join(root, "Drafts", ledger), join(cache, ledger));
  }
  await fsp.rmdir(join(root, "Drafts"));

  // Phase 4 (Gate 2 fixed routing): split the mixed note. The recruitment
  // entry moves to a facet overlay in tier 2 with a `canonical` link; the
  // canonical note keeps the team entries and never links back.
  await write(
    root,
    "3-Team/People/Jane Doe.md",
    FM.person("Janie") +
      [
        "# Jane Doe",
        "",
        "## Info",
        "**Role:** Engineer",
        "",
        "## Activity",
        "- **2026-01-05** (meeting): project sync [[3-Team/Projects/Apollo]]",
      ].join("\n"),
  );
  await write(
    root,
    "2-Confidential/People/Jane Doe.md",
    `---\ntype: person\ncreated: 2026-01-06\nupdated: 2026-01-06\n` +
      `aliases:\n  - "Jane Doe (recruitment)"\n` +
      `canonical: "[[3-Team/People/Jane Doe]]"\n---\n` +
      [
        "# Jane Doe — recruitment facet",
        "",
        "## Activity",
        "- **2026-01-06** (email): offer discussion, see" +
          " [[2-Confidential/Candidates/Jane Doe/offer]]",
      ].join("\n"),
  );
  // Phase 3 rewrite pass on the remaining notes: tier-prefixed links and
  // stamped frontmatter from the approved maps.
  await write(
    root,
    "3-Team/Projects/Apollo.md",
    FM.project +
      "# Apollo\n\nLead: [[3-Team/People/Jane Doe]]. Weekly notes in" +
      " [[3-Team/Projects/Q3 Report]].",
  );
  await write(root, "3-Team/Research/Papers.md", FM.topic + "# Papers\n");
  await write(
    root,
    "2-Confidential/Candidates/Jane Doe/offer.md",
    FM.candidate + "# Offer\n",
  );
  await write(root, "registry.yaml", REGISTRY);

  // Phase 5 (Gate 3 fixed input): the by-design dangle goes on the baseline.
  await write(
    root,
    "validation-baseline.json",
    JSON.stringify({
      findings: [
        {
          kind: "unresolved",
          file: "3-Team/Projects/Apollo.md",
          link: "3-Team/Projects/Q3 Report",
        },
      ],
    }),
  );
}

describe("migration convergence over the legacy fixture", () => {
  test("the playbook's mechanical phases reach a passing validation", async () => {
    const root = await buildLegacyVault();

    // Phase 1: the validator fails the legacy layout and names MIGRATION.md
    // (criterion 9, end to end).
    const before = await validateKnowledgeBase(root, runtime);
    const legacy = before.findings.filter((f) => f.kind === "legacy-layout");
    assert.deepEqual(legacy.map((f) => f.path).sort(), ["Drafts", "Knowledge"]);
    for (const finding of legacy)
      assert.match(finding.message, /MIGRATION\.md/);

    // Phases 3–5 with the fixed gate inputs.
    await migrate(root);

    // Convergence: zero new findings, exactly one baselined warning
    // (criterion 11).
    const result = await validateKnowledgeBase(root, runtime);
    assert.equal(result.tierCount, 5);
    const fresh = result.findings.filter((f) => !f.baselined);
    assert.deepEqual(fresh, []);
    const warnings = result.findings.filter((f) => f.baselined);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].kind, "unresolved");
    assert.equal(warnings[0].link, "3-Team/Projects/Q3 Report");
  });
});
