# Plan 2210: Archivist and DevEx Engineer agents

Execute [design-a.md](design-a.md) for [spec 2210](spec.md).

## Approach

Land every change in one implementation PR because the enumeration-drift
invariant couples the two new `.claude/skills/kata-*/SKILL.md` files to the
`published-skills` count in `KATA.md`, `websites/kata/index.md`, and `llms.txt`:
the moment a skill dir exists on `main` without the consumer counts bumped, CI
goes red, so the skills and their enumeration updates cannot land in separate
PRs. Within that PR the work is four groups — Archivist (A), Retention approval
class (B), DevEx Engineer (C), Roster and enumeration wiring (D). A and C each
add one agent profile plus one skill by mirroring the security-engineer profile
and `kata-security-audit`; B threads the new agent-originated approval signal
through four files; D updates every roster and count surface last, once the two
skill dirs exist so the enum source set reads 18. Retention windows, audit
topics, and signal-preservation preconditions — left open by the design — are
fixed below.

Libraries used: none. (Both agents drive the existing `fit-wiki` CLI at runtime;
this plan adds no code dependency.)

## Cross-cutting: writing under `.claude/**`

Every create/modify under `.claude/**` goes through `fit-selfedit` on this
feature branch, per
[self-improvement.md](../../.claude/agents/x-self-improvement.md). The branch is
non-`main` and the new paths fall under the existing `Edit(.claude/agents/**)`
and `Edit(.claude/skills/**)` allowlist globs in `.claude/settings.json`, so no
settings change is needed. Files under `specs/`, `websites/`, and `KATA.md` use
ordinary `Write`/`Edit`.

**Length budgets.** `coaligned instructions` measures **body** prose
(frontmatter stripped), so the "≤ 72 lines" targets below are body-line budgets
and carry a companion word cap: agent profiles ≤ 72 lines / 448 words (L3),
skills ≤ 192 lines / 1280 words (L5), each checklist block ≤ 9 items (L7). Watch
the word cap where a step grows an already-full file — notably
`product-manager.md` (Step B3).

---

## Group A — Archivist subsystem

### Step A1: Archivist agent profile

Add the roster's seventh persona: Study (detect) · Act (remove), owning
time-based retention of terminal, time-bounded artifacts.

- **Created:** `.claude/agents/archivist.md`

Mirror `security-engineer.md`'s shape (frontmatter, Voice, Session Protocol,
Assess ladder, Constraints), ≤ 72 lines:

- **Frontmatter** `skills:` — `kata-archive`, `kata-spec`, `kata-review`,
  `kata-session`.
- **Voice + signature** — `— Archivist 🗄️`.
- **Every Run** — the standard boot line (`Read wiki/MEMORY.md`, then
  `fit-wiki boot --agent archivist`), inbox triage, claim-before-first-write.
- **Assess ladder:**
  1. Terminal spec directories stale beyond the window? → detect via
     `kata-archive`, then open a **retention PR** through the release-engineer
     merge gate (never push `main`).
  2. Past-week logs or past-month storyboards stale beyond the window? →
     remove **directly** in `wiki/` on shift (ordinary memory-write path).
  3. Fallback → MEMORY.md items listing archivist under Agents, then report
     clean.
- **Act paths** (the block `kata-archive` defers to, mirroring how
  `kata-security-audit` defers branch naming):
  - Spec removal → `retention/specs-YYYY-MM-DD` branch from `main`, PR titled
    `retention(specs): …`, labeled `internal`.
  - Wiki removal → direct commit in `wiki/`.
- **Constraints** (satisfy the spec's constraint criteria):
  - Never remove a non-terminal spec, the current-week log, the current-month
    storyboard, or a canonical record (`STATUS.md`, `MEMORY.md`).
  - Never trim a `STATUS.md` ledger row when archiving its spec directory.
  - Never push to `main`; spec removal is PR-mediated only.
  - Boundary with technical writer: archivist owns past-week logs (including
    sealed `-partN`), past-month storyboards, and terminal specs; the technical
    writer owns `MEMORY.md`, active claims, current summaries, observations.
  - Memory / Coordination / Citation-integrity / Auth-anomaly pointer lines,
    verbatim in form from `security-engineer.md`.

**Verify:** `coaligned instructions` passes (profile ≤ 72 lines); `bunx fit-wiki
boot --agent archivist` runs without error.

### Step A2: `kata-archive` skill

Study-phase skill that detects retention candidates and states the
signal-preservation precondition each class must meet before removal.

- **Created:** `.claude/skills/kata-archive/SKILL.md`

House-style structure (Title-Case H1 "Archive Retention", `## When to Use`,
`## Checklists` near top, `## Process` with `### Step N`), `kata-` prefixed,
generic (only guaranteed surfaces — `specs/`, `wiki/`, `STATUS.md`, `MEMORY.md`,
storyboards — and bare `fit-wiki`), ≤ 192 lines, no `## Documentation` (no
matching `fit-<name>` CLI):

- **Retention windows** (table — this plan fixes them):

  | Artifact class | Retire when | Preservation precondition |
  | --- | --- | --- |
  | Past-week agent log (incl. sealed `-partN`) | ISO week ends ≥ 12 weeks before the current week | No live summary `detail:` link points to the file |
  | Past-month storyboard | Month ends ≥ 2 months before the current month | `MEMORY.md` storyboard index keeps the pointer |
  | Terminal spec directory | `STATUS` row terminal (`plan implemented` or `cancelled`) **and** newest commit under `specs/NNN/` older than 28 days (≈4 weeks) | `STATUS` ledger row retained; full text recoverable in git history |

  The 12-week log window satisfies the design's principle that the window sits
  **longer than a summary's `detail:`-link horizon**: live summaries observably
  link weekly logs 9+ weeks back, so a 4-week window would be dominated by the
  deferral below and retire almost nothing. Twelve weeks clears that horizon
  while the dangling-link check stays the hard safety net.
- **Checklists:** a `read_do` block (retention boundaries: canonical records
  and current-period artifacts are never candidates) and a `do_confirm` block
  (durable signal verified present before any removal; removal left recoverable
  through version history) — each ≤ 9 items.
- **Process:**
  - Step 0: Read Memory (one-sentence pointer, per house style).
  - Step 1: Detect terminal stale specs — read `STATUS.md` for terminal rows;
    for each, test staleness with `git log -1 --format=%cI specs/NNN/`; a
    just-completed spec is never swept.
  - Step 2: Detect stale wiki artifacts — enumerate past-week logs and
    past-month storyboards past their window; **defer** any log still targeted
    by a live summary `detail:` link (the archivist never edits another agent's
    summary to clear a dangling pointer). `detail:` is a freeform prose
    convention, not a checkable field, so give a concrete detection recipe:
    for each candidate log filename, grep every `wiki/*.md` summary for a
    markdown link whose target is that filename (`grep -lF "](<filename>)"
    wiki/*.md`); a non-empty match defers the log.
  - Step 3: Preserve signal and act — confirm each class's precondition, then
    hand off to the agent's Act paths (spec → retention PR; wiki → direct
    write); record each retirement in the archivist's own summary and weekly
    log (`wiki/archivist.md`, `wiki/archivist-YYYY-Www.md`).

**Verify:** `coaligned instructions` (≤ 192 lines); `coaligned invariants`
(skill-template + skill-genericity pass).

---

## Group B — Retention approval class

### Step B1: Approval-signal catalogue

Register the retention-PR product-manager review as a new agent-originated
signal — the one class not mediated by STATUS.

- **Modified:** `.claude/agents/x-approval-signals.md`
- **§ The signals** — add a row: `retention-PR approval` · Source
  `product-manager` (retention PRs only) · Captured by `kata-release-merge` at
  the gate, **no STATUS write**.
- **§ Trust rule** — one sentence: the product manager may originate a
  retention-PR approval; the human-only rule remains scoped to `spec approved`
  and `design approved`.
- **§ Signal invalidation** — add a row: signal class `retention-PR approval` ·
  Pin source = the PM review's own commit SHA (the review carries it — no
  separate pin record is needed) · On head move = agent-originated, any delta
  voids and needs a fresh PM review (same mechanics as `kata-plan` panel-clean).
  Note here that retention PRs sit **outside** `review-transfer.md`, whose
  § Applicability scopes it to spec/design/plan phase PRs; the gate applies this
  self-contained rule directly.

**Verify:** `coaligned instructions`; the new row's mechanics read identically
to the existing `kata-plan` panel-clean rows.

### Step B2: `kata-release-merge` retention gate

Teach the merge gate to recognize the retention-PR class and gate it on the PM
review instead of a STATUS phase row.

- **Modified:** `.claude/skills/kata-release-merge/SKILL.md`
- **Step 3 (Classify)** — add title type `retention` → retention phase (no
  spec-id STATUS row); keep "any other type → blocked".
- **Step 6 (Approval Gate)** — add a retention branch with a **self-contained**
  head-coverage rule, because retention PRs are outside `review-transfer.md`
  (§ Applicability restricts it to spec/design/plan phase PRs): for a
  `retention`-typed PR, pass only when a `product-manager` approving review
  exists **and its review commit SHA equals the current head**; any later commit
  re-blocks until a fresh PM review covers the new head. This replaces the
  STATUS phase-row read for the class.
- **Step 4/5 (rebase carve-out)** — mirror the experiment-PR rule
  ([`experiment-path.md`](../../.claude/skills/kata-release-merge/references/experiment-path.md)):
  the gate never rebases an approved-and-pinned retention PR — a head delta
  re-blocks rather than the gate's own rebase silently voiding the PM approval.
- **Step 9 (Implementation PR Spec Check)** — confirm `retention` PRs are
  naturally excluded (Step 9 fires only for `feat`/`fix`/`bug`/`refactor`/
  `chore` referencing a spec id); no `plan implemented` write occurs. No new
  logic — state it so the implementer does not add a spurious branch.
- **Step 10 (Classification Label Gate)** — unchanged; the `internal` label
  still gates retention PRs (add a clause naming `retention` so it is explicit).

**Verify:** `coaligned instructions`; trace the Step 3 → 6 → 9 → 10 path for a
`retention(specs): …` PR and confirm it never touches a STATUS phase read.

### Step B3: Product-manager profile

Grant the retention-approval authority and scope the never-originate constraint.

- **Modified:** `.claude/agents/product-manager.md`
- **Assess** — the profile uses a Survey (step 1, buckets P1/P2/P3) / Act
  (step 2) shape, not a flat numbered ladder. Add a Survey bucket for open
  `retention`-typed PRs and a matching Act clause: review (confirm every target
  terminal and its durable signal preserved), then post an approving review.
- **Constraints** — the current profile fuses the rule on one line ("Never
  apply `spec:approved`; never write STATUS."). Reword it to keep "never write
  STATUS" (retention approval is a *review*, not a STATUS write — design
  § Retention approval class) and scope only the never-*originate* rule to spec
  and design. Concrete target shape: *"Never originate `spec approved` or
  `design approved` — both human-only for specs and designs. You may post an
  approving review on a `retention` PR once every target is terminal and its
  durable signal is preserved; that review writes no STATUS."* The frontmatter
  `description` ("never applies `spec:approved` autonomously") stays accurate —
  no change.

**Verify:** `coaligned instructions` (profile ≤ 72 lines); the spec-review
constraint still forbids originating `spec approved`.

---

## Group C — DevEx Engineer subsystem

### Step C1: DevEx Engineer agent profile

Add the roster's eighth persona: Do (panel) · Study (audit) · Act (fix/spec) —
the same phase set and shape as the security engineer.

- **Created:** `.claude/agents/devex-engineer.md`

Mirror `security-engineer.md`, ≤ 72 lines:

- **Frontmatter** `skills:` — `kata-devex-audit`, `kata-spec`, `kata-review`,
  `kata-session`.
- **Voice + signature** — `— DevEx Engineer 🧹`.
- **Assess ladder:**
  1. Open design/plan/implementation PRs awaiting a DevEx panel? → participate
     via `kata-review`.
  2. No panel due? → audit the least-recently-covered code-health area
     (`kata-devex-audit`; check the coverage map in `wiki/devex-engineer.md`).
  3. Fallback → MEMORY.md items, then report clean.
- **Branch mapping** — mechanical cleanup → `fix/devex-audit-YYYY-MM-DD`;
  structural refactor → spec via `kata-spec` on `spec/devex-<name>`.
- **Constraints** (satisfy the spec criteria): a cleanup fix changes **no**
  behavior; a structural refactor routes to a spec; incremental fixes only;
  plus the standard Memory / Coordination / Citation / Auth pointer lines.

**Verify:** `coaligned instructions` (≤ 72 lines).

### Step C2: `kata-devex-audit` skill

Study-phase skill: deep-dive codebase-health review, one area per run, against a
coverage map — `kata-security-audit` re-pointed at code health.

- **Created:** `.claude/skills/kata-devex-audit/SKILL.md`

Mirror `kata-security-audit/SKILL.md`'s structure (When to Use, `do_confirm`
checklist, Audit Areas reference, Process Steps 0–3, Memory), `kata-` prefixed,
generic, ≤ 192 lines, no `## Documentation`:

- **Audit areas / topic table** — code-health topics replacing the security
  ones, e.g. `dead-code`, `duplication`, `inconsistency`, `accumulating-debt`,
  scoped across the repository's code trees; one area per run.
- **Topic selection** — never-audited first, then oldest; announce the pick;
  read every relevant file, not grep alone (same shape as the security audit).
- **Findings classification** — per work-definition: mechanical cleanup →
  `fix/` PR, structural refactor → `spec/` branch; branch naming deferred to the
  profile. **Constraint restated:** a cleanup fix changes no behavior.
- **Coverage map** — recorded in `wiki/devex-engineer.md § Coverage Map`
  (topic · last audited); updated with today's date each run.

**Verify:** `coaligned instructions` (body ≤ 192 lines / 1280 words);
`coaligned invariants` (skill-template + genericity — use placeholder date /
metrics-path forms; the genericity rule flags hardcoded years and literal
`YYYY-MM-DD` dates).

### Step C3: DevEx review panel in the caller protocol

Add the DevEx panel as a new, separate panel on design, plan, and
implementation — never on specs.

- **Modified:** `.claude/skills/kata-review/references/caller-protocol.md`
- **Modified:** `.claude/skills/kata-review/references/panel-rationale.md`
- **caller-protocol.md** — add three rows to the Panel Composition table:

  | Caller | Artifact | Panel | `subagent_type` | Reviewers |
  | --- | --- | --- | --- | --- |
  | `kata-design` | `design-a.md` | devex | `devex-engineer` | 3 |
  | `kata-plan` | `plan-a.md` (+ parts) | devex | `devex-engineer` | 3 |
  | `kata-implement` | diff | devex | `devex-engineer` | 3 |

  Update the "Used by" bullets (which today read "panel of 3" / "panel of 5")
  so `kata-design` and `kata-plan` each name a technical panel **and** a devex
  panel of 3, and `kata-implement` names a technical panel of 5 **and** a devex
  panel of 3; `kata-spec` stays product + technical only. No change to
  `kata-design`, `kata-plan`, or `kata-implement` skills — they defer to this
  table.
- **panel-rationale.md** — the paired rationale reference of caller-protocol;
  keep the pair consistent by adding a short "Why the DevEx panel" note:
  maintainability and correctness are distinct verdicts, so debt review is a
  separate panel, not a lens folded into the technical panel; size 3 across all
  three phases. In-scope as the sibling of the spec's named `kata-review`
  caller-protocol component, not a scope expansion.

**Verify:** `coaligned instructions`; the table shows devex on
design/plan/implement and **not** on `spec.md`.

---

## Group D — Roster and enumeration wiring

Run this group last: the `published-skills` counts in Steps D1, D4, and D5
derive from the two `SKILL.md` dirs created in A2 and C2, so those must exist
first.

### Step D1: `KATA.md`

- **Modified:** `KATA.md`
- **§ Agents** — add two rows (`archivist` — Study, Act; `devex-engineer` — Do,
  Study, Act) and change the prose "Six personas" (line 127) → "Eight personas".
- **§ Skills** — inside the `<!-- enum:published-skills:list -->` fence, add two
  rows: `kata-archive` (Study) and `kata-devex-audit` (Study). The
  `published-skills` source globs **every** `.claude/skills/kata-*/SKILL.md`
  (16 dirs today, including unpublished ones like `kata-setup`), so the count is
  16 → 18 — do not exclude unpublished dirs.
- **§ Workflows** — in the `kata-shift` roster sequence (inside the
  `enum:kata-workflows:list` fence), insert `devex-engineer` after
  `security-engineer` and `archivist` before `release-engineer`; change
  `kata-storyboard` "facilitates 5 agents" → "facilitates 7 agents". This count
  must equal the storyboard workflow roster updated in Step D3.
- **§ Approval Signal** — add the retention-PR PM signal row to the table.
- **§ Trust Boundary** — note the retention merge path: the archivist opens the
  PR, the PM approves, the release engineer merges (sole `main`-push preserved).

**Verify:** `coaligned invariants` — `published-skills:list` now reads 18; the
`kata-workflows:list` count stays 4 (that list guards workflow *names*, not the
Agent(s) column). Hand-edit both fences; do **not** run `--seed` (it rewrites a
fence body to the source set and would clobber the hand-edited Agent(s)/
facilitates columns and the prose count words). `coaligned instructions`.

### Step D2: `kata-shift` workflow matrix

- **Modified:** `.github/workflows/kata-shift.yml`

Add `- { name: devex-engineer }` after `security-engineer` and
`- { name: archivist }` before `release-engineer`, matching the KATA.md
sequence exactly.

**Verify:** matrix order equals the KATA.md § Workflows sequence; YAML parses.

### Step D3: `kata-storyboard` workflow roster

The storyboard workflow carries a hardcoded participant roster — the actual
mechanism the design's "both agents join; coach facilitates 7" decision
requires. Bumping only the KATA.md prose without this file would assert a
participation the shipped system does not deliver — and the spec success
criterion demands the count *reflect whether they participate*, so the roster
must match the count. This file is the HOW realizing the design's storyboard
decision, not a scope expansion; it is named here (not in the spec Scope table
or design surface list) because those enumerate WHAT/WHERE and this is the
implementing WHERE-in-code. Flag it for the approver.

- **Modified:** `.github/workflows/kata-storyboard.yml`

Add `archivist` and `devex-engineer` to the `agent-profiles:` comma list (the
improvement-coach facilitates and is not in the list), taking it from five names
to seven.

**Verify:** `agent-profiles:` holds seven names; the count equals KATA.md
§ Workflows "facilitates 7 agents"; YAML parses.

### Step D4: `websites/kata/index.md`

- **Modified:** `websites/kata/index.md`
- Both `<!-- enum:published-skills:count -->` fences → 18: the hero-subtitle
  prose "Sixteen skills" → "Eighteen skills" (line 21) and the stat-number
  `16` → `18` (line 39).
- "The Team" section: headline "Six agents. Explicit scope." → "Eight agents.
  Explicit scope." (line 112); add two `agent-card` blocks in the
  `agents-grid` — Archivist (icon `&#x1f5c4;`, phase `Study &middot; Act`) and
  DevEx Engineer (icon `&#x1f9f9;`, phase `Do &middot; Study &middot; Act`),
  each with a one-sentence `agent-desc` matching the KATA.md purpose. Use the
  `&middot;` entity as the phase separator to match the existing cards.

**Verify:** `coaligned invariants` (enumeration-drift count = 18); `bunx fit-doc
build --src=websites/kata --out=dist` succeeds.

### Step D5: `websites/kata/llms.txt`

- **Modified:** `websites/kata/llms.txt`
- Both count fences → "Eighteen skills" (line 6) and "eighteen skills"
  (line 15).
- Persona sentence (lines 10–13): "Six agent personas" → "Eight agent personas"
  and add "Archivist" and "DevEx Engineer" to the named list.

**Verify:** `coaligned invariants` (enumeration-drift count = 18).

---

## Atomicity and Execution

- **One implementation PR.** The enumeration-drift invariant forbids the two
  new skill dirs from reaching `main` before the D1/D4/D5 counts are bumped, so
  every group lands together. Do not split into part-PRs.
- **Ordering within the PR:** Groups A, B, and C are mutually independent and
  can be authored in any order (or in parallel). Group D must come after A2 and
  C2 because its enum counts derive from the two `SKILL.md` files existing.
- **Agent routing:** route the whole implementation to an engineering agent
  (`staff-engineer`) via `kata-implement`; the website prose in D4/D5 is
  enum-gated wiring, not standalone docs, so it stays in the same PR (a
  `technical-writer` copy pass is optional, not required).
- **Final gate:** run the repository's full check — `coaligned instructions`,
  `coaligned invariants`, and `fit-doc build` for `websites/kata` — before
  opening the PR.

## Risks

- **Enum count word-form.** The count consumers carry number *words*
  ("Sixteen") and a digit ("16"); the enumeration-drift extractor accepts both,
  but `--seed enumeration-drift` rewrites a count fence body to the bare digit
  and would clobber the surrounding prose. Hand-edit each count fence
  (D1/D4/D5) rather than seeding, and confirm with `coaligned invariants`.
- **Retention-window vs detail-link horizon.** The 12-week log window is set
  beyond the observed `detail:`-link horizon (live summaries link logs 9+ weeks
  back). The dangling-link deferral in `kata-archive` Step 2 is the hard safety
  net regardless of the window — a still-linked log is never retired at any age,
  so a horizon that grows past 12 weeks degrades throughput, never safety.
- **New-agent boot with no summary.** `fit-wiki boot --agent archivist` /
  `--agent devex-engineer` runs before either agent has a `wiki/<agent>.md`
  summary; confirm boot returns an empty digest rather than erroring. The wiki
  filename grammar already admits both token-free slugs, so no grammar change is
  needed.
- **Retention PR spanning many spec dirs.** A single retention PR may delete
  dozens of `specs/NNN/` directories; the PM review must confirm every target is
  terminal. Keep each retention PR scoped to one shift's detected candidates so
  the review stays tractable.
