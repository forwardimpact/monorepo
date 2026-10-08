# Plan 2400-a Part 06: The wiki skill, the storyboard references, and the pages

The `gemba-wiki` skill documents `scaffold` and the clone-only `init`, the two
storyboard references say `refresh` seeds the agent sections, the gemba pages
drop the seeding and the manual `init` as a setup step, and CONTRIBUTING.md
names the site build this repository runs. Branch `feat/2400-wiki-surfaces`.
Route: `technical-writer`, with `.claude/` writes through `gemba-selfedit`.
Depends on part 03, part 05 merged, and spec 2390's second merge, which adds the
`--remove` sentence to the skill. Line counts below are after the repository's
formatter reflows prose at 80 columns.

## Step 1: The wiki skill

Modified: `.claude/skills/gemba-wiki/SKILL.md`

The file sits at 192 of 192 lines. The ledger lands it at 191, with the three
file names in backticks as the sibling paragraphs write them.

| Removed                                                                                                                                                                                                                                                     | Added                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## Programmatic API`, its fenced import list, and the blank line after it (11 lines)                                                                                                                                                                       | A `### scaffold` section before `### init`, its heading in the sibling style with the command in backticks: heading, blank, a four-line paragraph, blank, a three-line `sh` fence with `npx gemba-wiki scaffold`, blank (11 lines). The paragraph: `scaffold creates each absent ledger (Home.md, MEMORY.md, STATUS.tsv), appends each absent block the library owns, and creates one summary per profile. It never changes a present line. Setup runs it; a second run writes nothing.` |
| `### init — Bootstrap a wiki tree` heading and paragraph: `init clones the wiki, scaffolds MEMORY.md ## Active Claims, and creates wiki/metrics/<skill>/. init is idempotent. Set FIT_WIKI_URL to override how init derives the default URL.` (1 + 3 lines) | `### init — Clone the wiki tree` and `init clones the wiki when it is absent, and is idempotent. Set FIT_WIKI_URL to override how it derives the URL.` (1 + 2 lines)                                                                                                                                                                                                                                                                                                                     |
| § `audit`: `one subject count per rule scope` (1 line)                                                                                                                                                                                                      | `one count per rule scope, plus storyboard-sections for the roster` (1 line)                                                                                                                                                                                                                                                                                                                                                                                                             |
| When to Use: `**Bootstrap** — init clones the wiki and scaffolds Active Claims.` (1 line)                                                                                                                                                                   | `**Bootstrap** — init clones. scaffold creates ledgers and summaries.` (1 line)                                                                                                                                                                                                                                                                                                                                                                                                          |

Verify: `bunx jidoka instructions` passes, and
`rg -n -e 'Programmatic API' -e 'metrics/<skill>' .claude/skills/gemba-wiki/SKILL.md`
prints nothing.

## Step 2: The storyboard references

Modified:

- `.claude/skills/kata-session/references/team-storyboard.md`
- `.claude/skills/kata-session/references/storyboard-template.md`

Start from part 05's merged `team-storyboard.md`, which sits at 760 of 768
words. The rewrite adds eight, and the example clause gives two back, so the
file lands at 766.

| Reference                                    | Old                                                                                                                                                                                                                                                                               | New                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `team-storyboard.md` § Planning vs. Review   | `gemba-wiki refresh creates the monthly file (section skeleton + obstacles/experiments markers) before the meeting. It omits the per-metric XmR blocks. For every wiki/metrics/{skill}/{YYYY}.csv, a participant seeds one #### {metric_name} block under ### {skill} with its …` | `gemba-wiki refresh creates the monthly file before the meeting: the section skeleton, one ### <agent> section per profile, and the obstacles/experiments markers. It omits the metric blocks. For every wiki/metrics/{skill}/{YYYY}.csv, a participant seeds one #### {metric_name} block under its own section with its …` (+8) |
| `team-storyboard.md` § Artifact              | `(e.g., storyboard-2026-M04.md)`                                                                                                                                                                                                                                                  | goes (−2)                                                                                                                                                                                                                                                                                                                         |
| `storyboard-template.md` `### {agent}` block | `_**Per-agent block budget: ≤200 words** — chart + Signals line + at most one short Note cross-reference when a signal must anchor to an event._`, with the Note marker in backticks (2 lines)                                                                                    | `_refresh seeds this heading per profile; a section with no metric block is valid. **Budget: ≤200 words**: chart, Signals line, one Note._`, with `refresh` and the Note marker in backticks (2 lines after reflow; 139 characters)                                                                                               |

Verify: `bunx jidoka instructions` passes, and the template stays at 128 lines.

## Step 3: The gemba pages

Modified:

- `websites/gemba/index.md`
- `websites/gemba/docs/predictable-team/index.md`
- `websites/gemba/docs/predictable-team/wiki-operations/index.md`
- `websites/gemba/docs/predictable-team/wiki-integrity/index.md`

| Page               | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.md`         | The tenant-defaults sentence reads `One default still refers to that tenant. gemba-xmr uses kata-shift as its default shift type.` Spec 2370 rewrites it later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `predictable-team` | § Step 1: the `npx gemba-wiki init` fence and its output go. The step says setup creates the wiki working tree: `gemba-wiki init` clones the repository's wiki and `gemba-wiki scaffold` creates the ledgers and one summary per agent profile, and Kata's setup skill runs both. The pre-creates paragraph goes. The tree listing shows `Home.md`, `MEMORY.md`, `STATUS.tsv`, `<agent>.md`. § Step 2 says `scaffold` creates each summary, shows part 02's template in place of the hand-written one, and keeps the sentence on the marker. Verification item 2 reads `Metrics directories exist. One per skill you have recorded against.` |
| `wiki-operations`  | The `init` entry keeps its fence as a command reference and loses the pre-creates paragraph. A `scaffold` entry follows it with the fence `npx gemba-wiki scaffold` and the four rules of the skill's paragraph.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `wiki-integrity`   | § Prerequisites: the bullet that reads `A wiki already initialized in your project` with its `npx gemba-wiki init` parenthetical becomes `A wiki your setup created: gemba-wiki init clones it and gemba-wiki scaffold creates its ledgers`. § What gets flagged gains one sentence under the admission item: the grammar admits the ledgers, `.gitattributes`, and `secret-overrides.log` at the root, so a file the library writes never trips it. The storyboard item says the required sections come from the profiles under `.claude/agents/`.                                                                                          |

Verify: `rg -n 'pre-creates' websites/gemba`,
`rg -n 'creates a metrics directory' websites/gemba/index.md`, and
`rg -n 'already initialized' websites/gemba` print nothing (S17), and
`bunx fit-doc build --src=websites/gemba --out=dist` succeeds.

## Step 4: CONTRIBUTING.md names the site build

Modified: `CONTRIBUTING.md`

§ Quality Commands gains one line:
`` `bunx fit-doc build --src=websites/<site> --out=dist` builds a site; run it for every site a change touches. ``

Verify: `bun run check` passes.

— Staff Engineer 🛠️
