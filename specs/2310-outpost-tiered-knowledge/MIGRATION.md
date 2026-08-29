# Outpost Knowledge Base Migration (draft)

**Status:** spec-stage draft of the template file that ships as
`products/outpost/templates/MIGRATION.md`. The wording addresses the owner
of one Outpost knowledge base. Every example is generic.

This playbook moves a legacy knowledge base (`Knowledge/` wrapper plus a
personal `Drafts/` directory) into root-level tiers. Agents execute the
mechanical phases. You decide at four named gates. The validator arbitrates
completion. Do not migrate by hand: a mature vault holds thousands of notes
and more links than a person can rewrite correctly.

## The safety model

Follow these rules before any phase and during every phase:

1. **Stop the agent scheduler.** Scheduled agents write into the vault on
   short cycles. A migration that races a writer produces a hybrid layout.
2. **Pause the sync client.** A mass rename inside a synced folder creates
   conflicts and deletes files on teammates' replicas.
3. **Work on a copy.** Copy the vault to a local directory that no sync
   client watches. Dereference symlinks during the copy (`cp -RL`). Exclude
   dependency directories, nested repositories, and files that hold
   credentials.
4. **Put the copy under version control.** Run `git init` and commit the
   baseline. Commit at every phase boundary with the phase name. This is
   your rollback path inside the copy.
5. **Do not touch the live share until cutover.** All phases except cutover
   run in the copy.
6. **Narrowing is not un-sharing.** Moving a note to a narrower tier stops
   future disclosure. It does not retract what recipients already read, and
   the sync platform's version history may retain the old content. Where
   past disclosure matters, use the platform's history controls; they are
   outside Outpost's scope.

## The phases

Run the phases in order. Each phase has an exit test. Do not start a phase
before the previous exit test passes.

### Phase 0 — Freeze

Stop the scheduler. Pause sync. Make the working copy. Commit the baseline.

*Exit test:* no process writes into the vault or the copy; the baseline
commit exists.

### Phase 1 — Inventory (Gate 1: the tier map)

An agent walks the copy and produces a census:

- every top-level directory under the legacy wrapper, including the ones
  the template never shipped (installations grow their own entity types);
- link statistics per directory pair, so you see which flows a tier split
  would cut;
- duplicate basenames, duplicate identity files, and dangling links;
- every personal root entry, so tooling knows what it must never touch;
- a **proposed tier map**: one tier per top-level directory, with the link
  evidence for each proposal.

**Gate 1 — you approve the tier map.** Migration blocks until every
top-level knowledge directory has an assigned tier. Commit the approved map
as the migration manifest; every later phase consumes it. Recurring hard
cases:

- Per-person goal notes: no tier expresses "the person plus their manager."
  Default them narrow; share by export.
- Deliverables addressed to named recipients: tier 0 plus export, never a
  shared-tier placement.
- Asset and reference collections: the tier follows the audience. Mark
  third-party copies and licensed assets no-redistribute; they are
  ineligible for the public tier whatever their audience.

*Exit test:* the manifest maps every directory; the census is committed.

### Phase 2 — Hygiene

An agent fixes what would fail validation for reasons older than the
migration: merge duplicate identity notes, delete ingestion debris, and
resolve dangling links. A dangling link that is correct by design (a
scheduled skill mints links ahead of the target) goes on the proposed
baseline list instead.

*Exit test:* the only unresolved links left are on the proposed baseline
list.

### Phase 3 — Mechanical move and rewrite

Agents execute the manifest:

- create the tier directories at the root;
- move each top-level directory into its assigned tier; move folder-atomic
  units (a per-entity subdirectory, an asset collection, a note with its
  dataset) as single units, never split below folder level;
- rewrite every wiki link to the tier-prefixed, vault-absolute form and
  convert every bare-basename link; keep display aliases; handle
  escaped-pipe aliases inside tables, links inside front matter,
  markdown-style relative links, URL-encoded links, and links to binary
  targets. The rewriter must cover the same syntax matrix the validator
  checks, or convergence never ends;
- leave relative links inside one entity subdirectory untouched;
- rewrite literal path strings and embedded commands that name legacy
  paths, not only link syntax;
- move the draft-status ID ledgers to the cache state directory and verify
  the entry counts match.

*Exit test:* the legacy wrapper and the old drafts directory are empty and
deleted in the copy; the validator reports no legacy-layout finding.

### Phase 4 — Surgical split (Gate 2: narrow routing)

This phase is the reason the migration exists. Content does not only move;
it splits. An agent triages every note above a size threshold and every
note that matches sensitivity markers (compensation figures, requisition
identifiers, succession language) into a review queue, then **proposes**
splits using the deterministic rules below. Agents propose; you approve.

**The split rules:**

1. **Facet overlay.** A sensitive facet of an entity moves to an overlay
   note in the narrower tier. The overlay declares itself by its one-way
   link to the canonical note. The same relative path is the default; a
   cross-entity overlay uses an explicit link instead.
2. **Timeline split.** When sensitivity interleaves per dated entry inside
   one activity log, the canonical note keeps the wide-audience entries and
   the overlay holds the narrower entries under the same date keys. A
   narrow-access reader merges the two logs chronologically.
3. **Link inversion.** A wider note's link into a narrower tier moves, with
   its one-line context, into the narrower note. Leave no tombstone and no
   forwarding prose in the wider note.
4. **Inverse stub.** When a note is narrow in its entirety but widely
   linked, create a wider-tier stub that carries only shareable identity
   facts. The narrow note links down to the stub.
5. **Hire conversion.** When a recruitment subject joins the team, create
   the team-tier note fresh. The recruitment record stays in its tier and
   links up. Nothing links back down.
6. **Detach before promoting.** A note headed for the public tier first
   loses or inlines its internal links, and passes the rights check.

**Gate 2 — you approve every routing into tier 1 or tier 0.** No agent
decides alone that content is management-only or owner-only.

*Exit test:* the review queue is empty; every approved split is applied and
committed.

### Phase 5 — Convergence (Gate 3: the baseline)

Run the validator in machine-readable mode in a loop. Partition each
finding: **mechanical** (the rewriter fixes it), **judgment** (append to
the review queue and return to phase 4), or **grandfathered** (append to
the baseline with a one-line reason). Iterate until findings minus baseline
is empty.

**Gate 3 — you approve the baseline.** Commit it beside the vault, so every
post-migration regression is a new finding, not noise.

A green validator proves structure, not content. Before the first share,
read through every note above the size threshold once: sensitive facts also
occur as plain prose that no link check can see.

*Exit test:* validation passes with the approved baseline; the content
audit is done.

### Phase 6 — Repoint

Rewrite every surface that writes into the vault, or the legacy layout
regrows on the next scheduled run:

- run `fit-outpost update` to install the tier-aware instructions;
- carry your local edits over: agent profiles, skill configuration,
  embedded search commands inside notes, ignore rules (match case
  exactly), and editor configuration;
- retarget every external generator and ingestion pipeline at the new tier
  paths;
- start one fresh changelog per shared tier; move the legacy changelog,
  whole, into the narrowest tier its entries span, fix its inbound links,
  and never append to it again. The root instruction changelog is a
  different artifact and stays where it is.

*Exit test:* a dry-run agent session writes only tier-prefixed paths.

### Phase 7 — Cutover (Gate 4: the shares)

Sharing is per tier and cumulative. Folder permissions cannot express
"tier N and every wider tier" by inheritance, so use groups:

1. Per shared tier, create the cloud folder or Git remote. For Git, use one
   repository per shared tier, never one repository that spans tiers:
   history would carry narrow content into wide clones.
2. Per shared tier, create one group. A tier-N member joins the groups for
   tier N through the widest tier. Revocation removes the member from all
   of them.
3. Let each folder sync locally, then symlink it into the vault root under
   its rank-prefixed name. The sync target's own name does not matter.
4. Copy the migrated content in, widest tier first. Recipients place each
   received tier folder as a sibling under one local root, restore the
   rank-prefixed name if their platform changed it, and run
   `fit-outpost validate` on that root.
5. Flip the legacy share to read-only. Retire it after a stated retention
   window, once teammates confirm the new tiers sync.
6. Restart the agent scheduler.

**Gate 4 — you grant the ACLs.** The validator cannot check who a platform
grants access to. Put a recurring audience audit on your calendar.

*Exit test:* validation passes on the live vault; a recipient's suffix
validates; the scheduler runs against tier paths only.

## Appendix A — the migration workflow prompt

Paste the prompt below into a Claude Code session at the root of the
**working copy** (never the live share). Fill the two placeholders. The
`ultracode` keyword opts the session into multi-agent orchestration; the
migration then runs as staged workflows with the gates above as stopping
points.

```text
ultracode

Migrate this Outpost knowledge base from the legacy layout (Knowledge/
wrapper plus Drafts/) to root-level tiers, following MIGRATION.md in this
directory. The tier manifest is at <path-to-approved-manifest>. My review
decisions go in <path-to-review-queue-file>.

Rules that bind every agent you spawn:
- Work only inside this directory. Never follow symlinks out of it. Never
  read or write personal root entries other than the files MIGRATION.md
  names (instruction files, ignore rules, editor configuration).
- Never decide an audience. Anything that routes into tier 1 or tier 0,
  and every proposed split, goes into the review queue and stops there
  until I mark it approved.
- Commit at every phase boundary with the phase name. Never use
  destructive git commands.
- Apply the split rules from MIGRATION.md § Phase 4 exactly. Do not invent
  alternative split shapes. Move the link plus its one-line context on
  inversion; leave no tombstone.
- The link rewriter and the validator must agree: cover aliased links,
  escaped pipes inside tables, front-matter links, markdown relative
  links, URL-encoded links, binary targets, and literal path strings.
- Folder-atomic units move whole. Never split below folder level.

Run these workflows in order, and stop for my gate review between them:
1. Inventory: fan out readers per top-level directory; produce the census
   and the proposed tier map with link evidence. Stop for Gate 1.
2. Hygiene: merge duplicate identities, fix dangling links, list
   by-design dangles for the baseline.
3. Move and rewrite: execute the approved manifest; shard the link
   rewrite by directory across parallel agents; verify with a full-vault
   link resolution pass.
4. Split: triage notes above the size threshold and notes matching
   sensitivity markers; per flagged note, one splitter agent proposes the
   split and an independent reviewer agent verifies it against the split
   rules; write proposals to the review queue. Stop for Gate 2, then
   apply only approved proposals.
5. Convergence: loop `fit-outpost validate` in JSON mode; auto-fix
   mechanical findings; queue judgment findings; propose baseline
   entries. Stop for Gate 3.
6. Repoint: rewrite instruction surfaces, embedded commands, ignore
   rules, and generator configuration; prove with a dry-run session that
   writes only tier-prefixed paths.

Then hand back a migration report: what moved where, every split applied,
the final baseline, and the cutover checklist from MIGRATION.md § Phase 7
for me to execute against the sync platform.
```

## Appendix B — what the validator will and will not tell you

- It proves ranks, link direction, link resolution, and link format. It
  follows symlinked tiers.
- It does not prove prose is audience-appropriate, and it cannot see the
  sync platform's permissions. The content audit (phase 5) and the
  audience audit (gate 4) own those.
- After migration, a legacy-layout finding means a writer you did not
  repoint still produces old paths. Fix the writer, not the finding.
