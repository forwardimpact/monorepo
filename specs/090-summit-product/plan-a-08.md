# Plan A — Part 08: Documentation, release readiness, STATUS advancement

## Goal

Close out spec 090 by bringing the documentation and repository
metadata in line with the shipped implementation:

1. Rewrite the existing Summit website pages against real behaviour.
2. Add Summit to CONTRIBUTING.md and the operations reference where
   required.
3. Verify the CLAUDE.md Summit reference (already written) still
   matches.
4. Confirm `package.json` workspaces picks up Summit automatically.
5. Advance `specs/STATUS` 090 to `done`.

This part is documentation-only. Route it to the `technical-writer`
agent — code changes are already merged by the end of Part 07.

## Inputs

- All preceding parts must be merged and verified green before this
  part runs.
- Existing pages under `website/summit/index.md` and
  `website/docs/internals/summit/index.md` (placeholder content
  already exists — verified present).
- `CLAUDE.md` Summit entry (lines 59–64 in the current file).
- `CONTRIBUTING.md` — check for product lists that need updating.
- `website/docs/internals/operations/` — check for per-product
  references that need Summit.

## Files Modified

### `website/summit/index.md`

Currently a placeholder. Rewrite against the shipped CLI:

- **Hero** — keep existing "See team capability as a system" framing.
- **What you get** — bullet list synced to actual commands shipped:
  coverage, risks, what-if, growth, compare, trajectory, roster,
  validate. Mention that `--evidenced` and `--outcomes` are optional
  enhancements that require Map's activity layer.
- **Getting started** — exact commands an external user runs.
  Important: this page is **external-facing**, so it must use
  `npm install @forwardimpact/summit` and `npx fit-summit …`, never
  `bun`/`bunx`/`just`. Per CLAUDE.md rule (line 120).
- **Example walkthrough** — pick one command (coverage is the most
  illustrative) and show a real output snippet. Use the starter
  discipline / track data so the example is reproducible against a
  fresh install.
- **Three views** section — shorten to match the actual commands;
  the current placeholder has some speculative content.

### `website/docs/internals/summit/index.md`

Internal-facing architecture deep-dive. Rewrite to match what Part
02–07 actually shipped:

- **Overview** — keep.
- **Architecture diagram** — add a block showing the three optional
  layers (core deterministic → evidence decorator → outcomes
  decorator).
- **Skill Matrix Aggregation** — update with the `TeamCoverage`
  shape from plan-a.md "Data Model".
- **Structural Risk Detection** — document the thresholds chosen in
  Part 03 (`CONCENTRATION_THRESHOLD = 3`, severity tiers for SPOFs)
  so future contributors know where the knobs are.
- **What-If Simulation** — explain the clone-then-aggregate
  approach and why deep cloning via `structuredClone` is safe.
- **Growth Logic Export** — document the `computeGrowthAlignment`
  public signature and the Landmark contract. Link to spec 080 as
  the downstream consumer.
- **Trajectory** — document the git-history approach and its
  limitations. Cite that Map historical snapshots are a future
  extension.
- **Evidence and Outcomes** — describe the decorator architecture
  and the lazy-import strategy for `@supabase/supabase-js`.
- Internal-facing, so `bun`/`bunx`/`just` commands are fine here.

### `CLAUDE.md`

Verify the Summit entry at lines 59–64 still matches the shipped
product. Specifically confirm:

- The one-line description ("Helps leadership answer _is this team
  supported to reach peak performance?_").
- Both page links: `[Overview](website/summit/index.md) ·
  [Internals](website/docs/internals/summit/index.md)`.

If the shipped behaviour diverges from what's on lines 59–64, update
the CLAUDE.md entry accordingly. This is the canonical product index —
it must reflect reality.

### `CONTRIBUTING.md`

Check whether CONTRIBUTING references the product list by name
anywhere (e.g. "Supported products: Map, Pathway, Basecamp, Guide,
Landmark"). If so, add Summit to that list. If not, this section is a
no-op.

### `website/docs/internals/operations/index.md` (and sub-pages)

Check whether the operations reference has per-product sections
(service management, data locations, common tasks). If Summit needs
an entry — for example, documenting the `data/summit/summit.yaml`
location — add it. If operations is purely service-oriented, Summit
doesn't need a section since it has no services.

### `website/docs/getting-started/leadership/index.md`

The CLAUDE.md mentions this page as the "Getting started (leadership)"
entry. Since Summit targets leaders, add a "Summit" subsection or
call-out linking to `website/summit/index.md`. Keep it short — the
full content lives on the product page.

### `specs/STATUS`

Advance 090:

```
090	done
```

(Currently `draft`.) This advancement is conditional on all parts 01–07
being merged, tests green on `main`, and at least one published version
of `@forwardimpact/summit` existing on npm (or queued for release via
the next release-engineer run). If any of those are incomplete, leave
STATUS alone and flag in the wiki log.

## Files NOT Modified

- `package.json` root — `products/*` workspace wildcard already picks
  Summit up. No explicit list to update.
- `justfile` — Summit doesn't need a root recipe unless there's a
  compelling repeated task. Inspect first; only add a recipe if one
  of Parts 01–07 references it.
- `scripts/check-package-layout.js` — Summit must conform without any
  allow-list changes. No modification.
- `scripts/check-exports-resolve.js` — same.

## Verification

1. **Link check.** All inbound links to
   `website/summit/index.md` and `website/docs/internals/summit/` from
   CLAUDE.md, CONTRIBUTING.md, and elsewhere still resolve.
2. **Docs build.** Run whatever website build Pathway uses (likely
   `just build-website` or `bunx fit-pathway build` — check the
   operations reference). Confirm it produces the Summit pages without
   errors.
3. **External-user commands work.** A clean `npm install
   @forwardimpact/summit` followed by `npx fit-summit --help` works as
   the website instructs.
4. **CLAUDE.md grep.** `rg -n 'Summit' CLAUDE.md` returns the entry
   at lines 59–64 and no stale references elsewhere.
5. **STATUS.** `specs/STATUS` 090 reads `done`.
6. **Agent memory updated.** Append a staff-engineer log entry for
   the week noting "090 done".

## Commit

Two logical commits are appropriate here because documentation and
status advancement are distinct concerns:

```
docs(summit): rewrite overview and internals pages against shipped commands
```

and

```
chore(specs): advance spec 090 to done
```

Land them sequentially on the documentation branch.

## Risks

- **Doc drift.** If Parts 01–07 diverged from plan-a in subtle ways
  (for example, a flag was renamed during implementation), the
  placeholder content on the existing website pages may carry the
  older name. Read the actual CLI help output before writing prose —
  do not trust the spec text verbatim.
- **External vs. internal command docs.** Easy to accidentally use
  `bunx` or `just` in a page that's supposed to be external-facing.
  Enforce with a final `rg -n '\bbunx?\b|\bjust\b'
  website/summit/index.md` check — should return zero matches.
- **STATUS lifecycle skipping.** The spec is currently `draft`, not
  `planned`. Advancing straight to `done` skips the
  `planned`/`active` phases. If the product manager wants the full
  lifecycle, split STATUS advancement across the parts: Part 01
  entry moves 090 to `planned`, Part 02 moves to `active`, Part 08
  moves to `done`. Call this out in the wiki log and let the
  product manager choose.

## Notes for the implementer

- This is a `technical-writer` part — don't write new code. If a code
  fix surfaces while updating docs, file it as a follow-up spec
  rather than sneaking it into this commit.
- Both website pages are currently placeholders; the rewrite is
  substantial. Budget accordingly.
- Keep the internals page technical: readers are contributors, not
  end users. Details like "`structuredClone` is safe because…" are
  on-topic.
- The product page is aspirational — it sells the product. Focus on
  the questions Summit answers, not the API surface.
