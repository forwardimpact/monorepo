# Plan A — Spec 0660: Map Product Page Activity-Layer Walkthrough

## Approach

Edit `websites/fit/map/index.md` to split the existing `## Getting Started`
block into two `###` subsections — **Standard layer** (the existing three
commands) and **Activity layer** (one sentence naming Supabase + a labelled
link to `websites/fit/docs/getting-started/leadership/map/index.md#activity-install-the-supabase-cli`).
Add `scripts/check-map-page.mjs` to encode the two coupling invariants from
the design's Drift-Mitigation table; wire it into `package.json` via a new
`docs` chain that `check` invokes.

## Files

| Change   | Path                         |
| -------- | ---------------------------- |
| modified | `websites/fit/map/index.md`  |
| created  | `scripts/check-map-page.mjs` |
| modified | `package.json`               |

## Steps

### 1. Restructure `websites/fit/map/index.md` Getting Started

Replace the body of the existing `## Getting Started` block (the bare
command code-fence) with two `###` subsections — Standard layer and
Activity layer — per the After block below. The `## Getting Started`
heading and the trailing `<div class="grid">` Leadership audience card are
unchanged.

Before:

```md
## Getting Started

\`\`\`sh
npm install @forwardimpact/map
npx fit-map init
npx fit-map validate
\`\`\`

<div class="grid">

<a href="/docs/getting-started/leadership/map/">

### Leadership

Initialize your agent-aligned engineering standard, validate schemas, set up the
activity layer, and ingest operational signals from GitHub and GetDX.

</a>

</div>
```

After:

```md
## Getting Started

### Standard layer

Define your agent-aligned engineering standard and validate it.

\`\`\`sh
npm install @forwardimpact/map
npx fit-map init
npx fit-map validate
\`\`\`

### Activity layer

The activity layer adds operational signals — organization people, GitHub
activity, and GetDX snapshots — on top of Supabase. Set up Supabase and run the
ingestion commands by following the leadership guide:

[Set up the activity layer →](/docs/getting-started/leadership/map/#activity-install-the-supabase-cli)

<div class="grid">

<a href="/docs/getting-started/leadership/map/">

### Leadership

Initialize your agent-aligned engineering standard, validate schemas, set up the
activity layer, and ingest operational signals from GitHub and GetDX.

</a>

</div>
```

Three contractual properties the implementer must preserve verbatim:

1. The word `Supabase` appears in the Activity-layer subsection prose
   before the markdown link to `#activity-install-the-supabase-cli` in the
   `## Getting Started` block.
2. The link target ends with `#activity-install-the-supabase-cli`.
3. The visible link text contains the word `activity` (case-insensitive). The
   exact wording above (`Set up the activity layer →`) satisfies this; if the
   implementer changes the wording, it must still contain `activity`.

**Verification:** the post-edit file's `## Getting Started` section
shows, in reading order, the prose word `Supabase` followed by a markdown
link whose target ends in `#activity-install-the-supabase-cli` and whose
visible text contains `activity` (case-insensitive).

### 2. Create `scripts/check-map-page.mjs`

New file modelled on `scripts/check-libharness.mjs` (no test runner, plain
node script with `process.exit(status)`).

```js
#!/usr/bin/env node
// Spec 0660: enforce the activity-layer entry-point invariants between the
// Map product page Getting Started block and the leadership guide.
// Called from `bun run check` via `bun run docs`.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
let status = 0;
const fail = (msg) => {
  console.error(`error: ${msg}`);
  status = 1;
};

const productPage = await readFile(
  resolve(root, "websites/fit/map/index.md"),
  "utf8",
);
const leadershipGuide = await readFile(
  resolve(root, "websites/fit/docs/getting-started/leadership/map/index.md"),
  "utf8",
);

// Locate the Getting Started block on the product page (H2 to next H2 or EOF).
// `$` without the `m` flag matches end-of-input, which covers the case where
// `## Getting Started` is the last H2 in the file.
const gsMatch = productPage.match(
  /\n## Getting Started\n([\s\S]*?)(?=\n## |$)/,
);
if (!gsMatch)
  fail("websites/fit/map/index.md: '## Getting Started' section not found");
const gettingStarted = gsMatch ? gsMatch[1] : "";

// Invariant 1 (design Drift-Mitigation row 1, spec criterion 2):
// "Supabase" appears as standalone prose (not embedded in a slug like
// `supabase-cli` or a URL path) before the activity-layer link in the
// Getting Started block. The lookbehind/lookahead excludes URL-embedded
// occurrences so a future copyedit that drops the prose mention but leaves
// the link URL `#activity-install-the-supabase-cli` does NOT silently pass.
const proseRe = /(?<![/-])[Ss]upabase(?![/-])/;
const proseMatch = gettingStarted.match(proseRe);
const linkIdx = gettingStarted.search(/#activity-install-the-supabase-cli/);
if (!proseMatch)
  fail(
    "websites/fit/map/index.md: '## Getting Started' must name 'Supabase' in prose (not only in a link URL)",
  );
if (linkIdx === -1)
  fail(
    "websites/fit/map/index.md: '## Getting Started' must link to '#activity-install-the-supabase-cli'",
  );
if (proseMatch && linkIdx !== -1 && proseMatch.index > linkIdx)
  fail(
    "websites/fit/map/index.md: prose 'Supabase' must appear before the activity-layer link in Getting Started",
  );

// Invariant 2 (design Drift-Mitigation row 2 — link form, spec criterion 4):
// the markdown link is well-formed and its visible text contains 'activity'.
const linkRe = /\[([^\]]*)\]\([^)]*#activity-install-the-supabase-cli\)/;
const linkMatch = gettingStarted.match(linkRe);
if (!linkMatch)
  fail(
    "websites/fit/map/index.md: activity-layer link not found in markdown link form",
  );
else if (!/activity/i.test(linkMatch[1]))
  fail(
    `websites/fit/map/index.md: activity-layer link text '${linkMatch[1]}' must contain 'activity'`,
  );

// Invariant 3 (design Drift-Mitigation row 2 — anchor target, spec criteria
// 1 + 3): the leadership guide carries the '## Activity: install the
// Supabase CLI' heading that produces the contractual anchor.
if (!/\n## Activity: install the Supabase CLI\n/.test(leadershipGuide))
  fail(
    "websites/fit/docs/getting-started/leadership/map/index.md: heading '## Activity: install the Supabase CLI' is the contractual anchor target — do not rename without updating the product page link",
  );

// Invariant 4 (spec criterion 5, regression guard): no `stages.yaml`
// reference anywhere on the product page. Spec criterion 5 scopes this
// check to the entire file, not the Getting Started subsection.
if (/stages\.yaml/.test(productPage))
  fail(
    "websites/fit/map/index.md: 'stages.yaml' must not appear (regression guard)",
  );

process.exit(status);
```

**Verification:** `bun scripts/check-map-page.mjs` exits 0 against the
post-step-1 file; mutate any of the four invariants and the script exits 1
with a precise error message.

### 3. Wire into `package.json`

Add a `docs` script entry and append it to the `check` chain.

Before (`scripts.check`):

```json
"check": "bun run format && bun run lint && bun run harness && bun run context",
```

After:

```json
"check": "bun run format && bun run lint && bun run harness && bun run context && bun run docs",
"docs": "bun scripts/check-map-page.mjs",
```

Place `"docs"` adjacent to `"context"` in the scripts block.

**Verification:** `bun run check` exits 0; `bun run docs` exits 0; reverting
step 1 makes `bun run docs` exit 1.

### 4. Verify the user-facing reading path manually

Run `bunx fit-doc serve --src=websites/fit --watch`, open
`http://localhost:<port>/map/`, click the activity-layer link, and confirm
the browser scrolls to the **Activity: install the Supabase CLI** heading on
the leadership guide page.

**Verification:** the anchor lands correctly; from there, top-down reading
reaches `MAP_SUPABASE_URL` (in `## Activity: start the database`) and then
`fit-map activity verify` (in `## Activity: verify the data`), satisfying
spec criteria 1 + 3.

## Libraries used

`Libraries used: none.` (`node:fs/promises` and `node:path` only.)

## Risks

| Risk                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fit-doc` slug generation diverges from `#activity-install-the-supabase-cli` in a future build pipeline change.                                                                         | Step 2 invariant 3 fails fast — the leadership-guide heading must remain the literal `## Activity: install the Supabase CLI`; any slug-generation change requires updating the product page link same PR.  |
| The Getting Started block is the last H2 in the file today; if a future H3-only audience-card section is added before any new H2, the boundary regex captures more than the subsection. | Step 2's regex bounds at `\n## ` (next H2) or end-of-input; if a new H2 is added between Getting Started and EOF, the regex still bounds correctly at that new H2. Audience cards are H3s and stay inside. |
| A future copyedit replaces `[Set up the activity layer →]` with non-link prose, hiding the routing affordance.                                                                          | Step 2 invariant 2 requires the markdown link form `[text](#activity-install-the-supabase-cli)`; any plain-prose rewrite makes `bun run docs` exit 1.                                                      |

## Execution

Single PR. `staff-engineer` executes steps 1–4 sequentially. Step 4 is a
manual browser check after `bunx fit-doc serve --src=websites/fit --watch`.
No parallelism.
