---
name: kata-documentation
description: >
  Write and review documentation in the websites/ folder. Scheduled runs review
  one topic in depth for accuracy, audience purity, and staleness. Interactive
  runs write or update pages that follow the documentation standards. Use when
  writing, editing, auditing, or reviewing documentation, or running scheduled
  documentation review.
---

# Write and Review Documentation

Write effective documentation. Review it for accuracy in a systematic way. This
skill has two modes:

- **Scheduled review** — Pick one topic. Go deep. Verify against source code.
- **Interactive writing** — Write or update pages that follow the standards.

## When to Use

- Scheduled documentation review (one topic per run)
- New or updated pages in `websites/`
- An audit of documentation accuracy against the source code

## Checklists

<read_do_checklist goal="Load documentation standards before starting">

- [ ] Read [`references/standards.md`](references/standards.md) for audience
      rules, formatting conventions, and terminology.
- [ ] Read [`references/source-of-truth.md`](references/source-of-truth.md) to
      see which code/data backs each documentation claim.
- [ ] Identify the audience for every page you touch. Do not mix contributor
      content into user-facing pages or vice versa.
- [ ] Verify claims against source code. Do not verify against other
      documentation.

</read_do_checklist>

<do_confirm_checklist goal="Confirm documentation review is complete">

- [ ] Run every CLI example on the page and verify its output.
- [ ] Check every YAML example against the JSON schema.
- [ ] Confirm audience purity (no page mixes audiences).
- [ ] Consult the source of truth. Confirm the docs match the current code.
- [ ] All cross-links resolve.
- [ ] `fit-doc build --src=websites/<site> --out=dist` succeeds for
      every site you touched.
- [ ] Terminology matches the conventions in `references/standards.md`.

</do_confirm_checklist>

## Process

### Step 0: Read Memory

Read `wiki/MEMORY.md`. Then run `gemba-wiki boot --agent <self>` per
[memory-protocol § On-Boot Read Set](../../agents/x-memory-protocol.md#on-boot-read-set).
The digest's `owned_priorities`, `claims`, and `storyboard_items` seed this
Process. Find the last review date for each topic in the coverage map.

> **Writing under `.claude/`:** If this run edits files under `.claude/skills/`,
> follow [self-improvement.md](../../agents/x-self-improvement.md).

### Step 1: Route by mode

Scheduled runs review one topic in depth. Continue with § Scheduled Review.
Interactive runs write or update pages. Continue with § Interactive Writing.

## Scheduled Review

Each run covers **one topic** in depth.

### Topic areas

| Topic                    | What to review                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `getting-started`        | `websites/<site>/docs/getting-started/` — onboarding accuracy, CLI examples               |
| `products`               | `websites/<site>/docs/products/` — product-task accuracy, audience purity, completeness   |
| `libraries`              | `websites/<site>/docs/libraries/` — library-task accuracy, audience purity, completeness  |
| `services`               | `websites/<site>/docs/services/` — service-task accuracy, audience purity, completeness   |
| `reference`              | `websites/<site>/docs/reference/` — CLI synopsis, entity definitions, schema              |
| `internals`              | `websites/<site>/docs/internals/` — architecture accuracy, code path validity             |
| `product-pages`          | Product overview pages under `websites/<site>/` — overviews                               |
| `root-docs`              | `CLAUDE.md`, `CONTRIBUTING.md`, `KATA.md`, `SECURITY.md`                                  |
| `llms-txt-and-seo`       | `websites/<site>/llms.txt`, `websites/<site>/robots.txt`, sitemap completeness            |
| `cross-page-consistency` | Terminology, proficiency scales, field names across all pages                             |

### Topic selection

1. Build the coverage map. Put never-reviewed topics first, then the oldest.
2. Apply the revisit threshold. If the last 6 runs covered all topics,
   revisit the oldest.
3. Announce your pick and the reason before you start.
4. Go deep. Read every page in the topic area. Do not spot-check.

### Review process

1. Read every page in the topic area.
2. For each page, identify the source of truth (per
   [`references/source-of-truth.md`](references/source-of-truth.md)).
3. Read the actual source code/data. Compare it to the documentation claims.
4. Check audience purity. Flag contributor content in user-facing pages (per
   [`references/standards.md`](references/standards.md)).
5. Run the CLI examples shown in the docs. Verify the output matches.
6. Check YAML examples against the product's JSON schema directory.
7. Verify all internal cross-links resolve.
8. Run `fit-doc build --src=websites/<site> --out=dist` to confirm the build.
9. Check `git log --oneline -20 -- <paths>` for recent code changes that could
   invalidate the docs.

### Cross-page-consistency: re-run `<sh>` examples

For this topic, re-run each `<sh prompt>` block against starter data or the
local CLI. Diff its output against the adjacent `<text>` block. Record one
row in `wiki/metrics/{skill}/{YYYY}.csv` per divergence, tagged
`kata-documentation-cross-page-consistency-sh-output-reexec`. Staleness found
in a page's prose stays with that page's own topic.

## Interactive Writing

### Writing a new page

1. **Identify the audience.** Determine which user group the page serves. The
   audience decides the section. See
   [`references/standards.md`](references/standards.md).
2. **Choose the section.** New to the product → Getting Started. Full workflow →
   Big Hire guide. Bounded task → Little Hire guide. Looking something up →
   Reference. Understanding the code → Internals.
3. **Research the source of truth.** Read the actual code and data before you
   write. Cross-reference
   [`references/source-of-truth.md`](references/source-of-truth.md).
4. **Write for the audience.** Strip content that belongs to a different
   audience.
5. **Verify accuracy.** Run the CLI commands. Check YAML against the schemas.
   Confirm entity names against the product's data directories.
6. **Add cross-links.** Guides → Reference for details. Getting Started → Guides
   for next steps. Internals → Reference for the user-facing model.
7. **Build and check.** Run `fit-doc build --src=websites/<site> --out=dist`.

### Updating existing pages

1. Read the page and its source of truth. Check the actual code. Do not rely
   on the docs alone.
2. Check audience purity. Move contributor content to Internals if needed.
3. Verify CLI examples. Run every command shown.
4. Verify YAML examples against the product's JSON schema directory.
5. Check cross-links resolve.
6. Build and check.

## Output

Every review must produce both categories when applicable. Classify each finding
with
[work-definition.md § Classification tests](../../agents/x-work-definition.md#classification-tests)
(mechanical fix vs structural spec). The agent profile defines branch naming,
commit conventions, and independence rules.

**Commit format:** `docs(website): {verb} {topic} documentation`

Verbs: `add` for new pages, `update` for changes, `fix` for corrections.

### Publishing changes

Commits are not visible until you push them. After you commit on a branch, run
`open-change` ([work-trackers.md](../../agents/x-work-trackers.md))
with the title and body. Hold the PR body to
[Citation integrity](../../agents/x-citation-integrity.md).

Each branch gets its own PR. Fix and spec branches are independent. Push and PR
each one separately. Wiki changes follow the wiki curation skill's publishing
instructions.

## Memory: What to Record

Append to the current week's log (see agent profile for the file path):

- **Topic reviewed** — Which topic, and why you selected it
- **Coverage map** — Updated table of all topics with last review date
- **Findings summary** — What you found, the severity, the disposition
  (fixed/spec'd/deferred)
- **Deferred work** — Issues that need follow-up, with enough context to resume
- **Accuracy errors** — Specific docs that diverged from source code
- **Memos sent** — Callouts you dispatched with `gemba-wiki memo` to agents
  whose work affects docs
- **Metrics** — Append one row per run to `wiki/metrics/{skill}/`
  per `references/metrics.md`. See KATA.md § Metrics for the
  recording-eligibility rule.

## Coordination Channels

This skill produces these non-wiki outputs (per
[coordination-protocol.md](../../agents/x-coordination-protocol.md)):

- **PR comment** — Doc-impact callouts on code PRs that change behaviour
  documented in `websites/`.
- **Discussion** — Doc gaps that reflect an unsettled product question rather
  than a writing task.

If an inbound PR comment addressed to this agent is ambiguous, follow
[coordination-protocol.md § Inbound: unclear addressed comments](../../agents/x-coordination-protocol.md#inbound-unclear-addressed-comments).
