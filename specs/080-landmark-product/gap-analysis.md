# Landmark + Summit Gap Analysis

Gap analysis of Landmark and Summit: do they fully serve engineers and
engineering managers growing individuals and shaping teams?

## Task 1: Stakeholder Needs Mapping

### What engineers need (growing as individuals)

| # | Need | Description |
|---|------|-------------|
| E1 | **Know where I stand** | See current skill proficiencies against role expectations |
| E2 | **See evidence of my work** | Concrete artifacts demonstrating skill at each level |
| E3 | **Understand what's next** | Clear progression path — what changes at the next level |
| E4 | **Know what the team needs from me** | Which growth directions help the team, not just my career |
| E5 | **Get feedback on trajectory** | Am I trending toward my target or plateauing? |
| E6 | **Benchmark against peers** | How does my experience compare to others at my level? |
| E7 | **Identify development priorities** | Which 2-3 skills matter most to develop right now? |
| E8 | **See subjective sentiment** | How does my team perceive the engineering environment? |
| E9 | **Understand team health context** | Is a frustration mine alone or systemic? |
| E10 | **Track growth over time** | Did my skill profile actually change quarter over quarter? |
| E11 | **Prepare for promotion** | What's the delta between current state and next level? |
| E12 | **Validate self-assessment** | Cross-check my perception against objective evidence |

### What engineering managers need (growing individuals and shaping teams)

| # | Need | Description |
|---|------|-------------|
| M1 | **See team capability at a glance** | Where are we strong, thin, absent? |
| M2 | **Identify structural risks** | Bus factor, critical gaps, concentration risks |
| M3 | **Plan hires against gaps** | What profile would most improve team capability? |
| M4 | **Simulate roster changes** | What happens if someone leaves, joins, or moves? |
| M5 | **Guide 1:1 growth conversations** | Connect individual goals to team needs |
| M6 | **Track team health over time** | Are GetDX scores trending up or down? |
| M7 | **Compare teams** | Is one team structurally weaker than another? |
| M8 | **See evidence for direct reports** | What artifacts demonstrate each person's level? |
| M9 | **Correlate capability with outcomes** | Do skill gaps predict GetDX pain points? |
| M10 | **Prioritize team investments** | Where does coaching/training have highest ROI? |
| M11 | **Track individual growth trajectories** | Is this person progressing toward their target? |
| M12 | **Justify staffing decisions** | Data-backed case for headcount, transfers, reorgs |
| M13 | **Monitor initiative health** | Are improvement initiatives actually moving the needle? |
| M14 | **Detect early warning signals** | Catch capability erosion before it causes incidents |
| M15 | **Understand cross-team dependencies** | Does team A depend on team B's sole expert? |

## Task 2: Coverage Assessment

### Engineer needs

| Need | Landmark | Summit | Covered? |
|------|----------|--------|----------|
| **E1: Know where I stand** | `evidence --email` shows marker evidence for a person (spec: Marker evidence views) | `growth <team>` shows where person sits relative to team needs | Partial — evidence exists but no unified "my profile vs expectations" view in either product |
| **E2: See evidence of my work** | `evidence --email` with Guide rationale per artifact (spec: Evidence Pipeline) | — | Covered by Landmark |
| **E3: Understand what's next** | — | `growth <team>` shows growth opportunities | Partial — Summit shows team-aligned growth, but "what changes at next level" is Pathway's `progression` command, not Landmark/Summit |
| **E4: Know what team needs from me** | — | `growth <team>` explicitly maps team gaps to individual growth opportunities (spec: Growth Alignment) | Covered by Summit |
| **E5: Get feedback on trajectory** | `snapshot trend` tracks GetDX driver scores over time | — | Partial — trend is team-level GetDX, not individual skill trajectory |
| **E6: Benchmark against peers** | `snapshot compare` provides `vs_org`, `vs_50th`, `vs_75th`, `vs_90th` (spec: Snapshot views) | — | Partial — GetDX benchmarks are team-level survey data, not individual skill benchmarks |
| **E7: Identify development priorities** | — | `growth <team>` ranks growth opportunities by team impact (high/medium/low) | Partial — prioritized by team need, not by personal gap severity |
| **E8: See subjective sentiment** | `snapshot show` displays factor/driver scores from GetDX (spec: Snapshot views) | — | Covered by Landmark |
| **E9: Understand team health context** | `health` joins marker evidence with GetDX outcomes (spec: Marker evidence views) | — | Covered by Landmark |
| **E10: Track growth over time** | — | — | **Gap** — neither product tracks individual skill changes across time |
| **E11: Prepare for promotion** | — | — | **Gap** — this is Pathway's domain (`progression`), but no product connects evidence to promotion readiness |
| **E12: Validate self-assessment** | `evidence --email` provides objective artifact evidence against markers | — | Partial — evidence exists but no formal self-assessment comparison |

### Manager needs

| Need | Landmark | Summit | Covered? |
|------|----------|--------|----------|
| **M1: See team capability** | — | `coverage <team>` heatmap of collective proficiency (spec: Capability Coverage) | Covered by Summit |
| **M2: Identify structural risks** | — | `risks <team>` — SPOFs, critical gaps, concentration risks (spec: Structural Risks) | Covered by Summit |
| **M3: Plan hires against gaps** | — | `what-if <team> --add` simulates hire profiles (spec: What-If Scenarios) | Covered by Summit |
| **M4: Simulate roster changes** | — | `what-if` — add, remove, move, promote (spec: What-If Scenarios) | Covered by Summit |
| **M5: Guide 1:1 growth conversations** | `evidence --email` provides talking points from artifacts | `growth <team>` aligns individual growth to team gaps | Covered by both |
| **M6: Track team health over time** | `snapshot trend --item <id> --manager <email>` (spec: Trend views) | — | Covered by Landmark |
| **M7: Compare teams** | `snapshot compare --manager` for GetDX comparison | `compare <team1> <team2>` for capability comparison | Covered by both |
| **M8: See evidence for reports** | `evidence --email <email>` per person, `practice --manager` for team patterns (spec: Marker evidence views) | — | Covered by Landmark |
| **M9: Correlate capability with outcomes** | `health --manager` joins marker evidence to GetDX scores via `contributingSkills` on drivers (spec: Marker evidence views) | — | Partial — health view exists but correlation is indirect (drivers → skills, not statistical) |
| **M10: Prioritize team investments** | — | `growth <team>` ranks by impact tier | Partial — ranks growth opportunities, but doesn't quantify investment ROI or connect to GetDX outcomes |
| **M11: Track individual growth trajectories** | — | — | **Gap** — no longitudinal individual tracking in either product |
| **M12: Justify staffing decisions** | — | `what-if` JSON output provides structural data for proposals | Partial — provides capability impact but not outcome/sentiment correlation |
| **M13: Monitor initiative health** | — | — | **Gap** — no initiative tracking in either product |
| **M14: Detect early warning signals** | `snapshot trend` can show declining GetDX scores; `health` may surface skill-outcome divergence | `risks` shows structural risks | Partial — reactive indicators exist, but no proactive alerting or combined signal analysis |
| **M15: Cross-team dependencies** | — | `compare` shows capability differences; `what-if --move` shows inter-team impact | Partial — requires manual comparison, no explicit dependency mapping |

## Task 3: Gap Identification

### Gap 1: No individual growth trajectory over time

| Attribute | Detail |
|-----------|--------|
| **What's missing** | Neither product tracks how an individual's skill profile changes across quarters. Landmark tracks GetDX team scores over time. Summit shows current-state capability. Nobody shows "Alice was foundational in observability in Q1, working in Q3." |
| **Who's affected** | Engineers (E10), managers running 1:1s (M11) |
| **Severity** | High — growth is the central promise of the framework, yet no product makes growth visible over time |
| **Why unaddressed** | Landmark consumes GetDX snapshots (team-level) and Guide evidence (artifact-level, not time-series). Summit is a point-in-time derived view — it has no temporal dimension. The architecture stores evidence rows with `created_at` but neither product aggregates them into a growth timeline. |

### Gap 2: No promotion readiness assessment

| Attribute | Detail |
|-----------|--------|
| **What's missing** | No product connects current evidence and skill profile to the requirements of the next level. Pathway can show what changes between levels (`progression`), and Landmark can show current evidence, but nobody synthesizes "you have 7/10 markers for L4, here's what's missing." |
| **Who's affected** | Engineers preparing for promotion (E11), managers calibrating (M11) |
| **Severity** | High — promotion is the highest-stakes career event; leaving it to manual cross-referencing undermines the framework |
| **Why unaddressed** | Landmark reads evidence but doesn't know about progression requirements. Summit knows about derived profiles but not evidence. The gap sits at the intersection of retrospective evidence (Landmark) and prospective requirements (Summit/Pathway). |

### Gap 3: No initiative tracking

| Attribute | Detail |
|-----------|--------|
| **What's missing** | Managers run improvement initiatives ("improve incident response capability by Q3") but no product tracks initiative progress, milestones, or outcome correlation. |
| **Who's affected** | Managers (M13), directors, engineering leadership |
| **Severity** | Medium — without initiative tracking, investments in team capability are fire-and-forget |
| **Why unaddressed** | Landmark is read-only analysis. Summit is stateless simulation. Neither product has a write path or persistent state for tracking goals. |

### Gap 4: No self-assessment validation loop

| Attribute | Detail |
|-----------|--------|
| **What's missing** | Engineers can't formally record a self-assessment and see it validated against objective evidence. Landmark shows evidence; Pathway can show expected profiles; but there's no "here's what I think, here's what the data shows" comparison. |
| **Who's affected** | Engineers (E12), managers during calibration |
| **Severity** | Medium — self-assessment is where growth conversations start; without validation, they stay subjective |
| **Why unaddressed** | No product accepts input from the engineer. Landmark is read-only. Summit is derived-only. Self-assessment requires a write path (input) and a comparison engine (crossing retrospective evidence with self-perception). |

### Gap 5: No cross-product present-tense signal integration

| Attribute | Detail |
|-----------|--------|
| **What's missing** | Summit's capability model is purely derived from job profiles (discipline/level/track) — it never incorporates observed evidence. A team might have five engineers with "working" in observability on paper, but if evidence shows none of them actually practice it, Summit's view is misleading. |
| **Who's affected** | Managers relying on Summit for staffing decisions (M1, M2, M3, M12) |
| **Severity** | High — derived-only capability is a theoretical ceiling, not reality. Decisions based on it may be structurally unsound. |
| **Why unaddressed** | Summit's design principle is "no external dependencies" — fully local, deterministic, derived from Map data only. Incorporating evidence would require Summit to read from Landmark's data pipeline (Supabase, Guide evidence), breaking its zero-dependency promise. |

### Gap 6: No individual-level GetDX data

| Attribute | Detail |
|-----------|--------|
| **What's missing** | GetDX snapshots are team-level aggregates. Engineers can't see their individual survey responses contextualized within the framework. The `snapshot show` and `snapshot trend` commands operate at team granularity. |
| **Who's affected** | Engineers wanting personal sentiment context (E8, E9) |
| **Severity** | Low — this is partly a GetDX platform limitation (aggregation for anonymity), not an architectural gap. Team-level is the appropriate granularity for most uses. |
| **Why unaddressed** | GetDX deliberately aggregates to preserve anonymity. Map stores what GetDX provides. Landmark presents what Map stores. |

### Gap 7: No early warning system

| Attribute | Detail |
|-----------|--------|
| **What's missing** | No product proactively alerts when capability is eroding — e.g., when a GetDX driver drops two quarters in a row, or when a SPOF person gives notice, or when evidence generation for a skill stops. Landmark shows trends reactively. Summit shows risks at query time. Neither watches and warns. |
| **Who's affected** | Managers (M14), directors |
| **Severity** | Medium — the data exists to detect problems early, but nobody is watching it continuously |
| **Why unaddressed** | Both products are CLI tools invoked on demand. Neither has a daemon, scheduler, or notification system. Basecamp has scheduling infrastructure but isn't connected to Landmark/Summit analysis. |

### Gap 8: No investment ROI quantification

| Attribute | Detail |
|-----------|--------|
| **What's missing** | Summit's `growth` command ranks opportunities by team impact (high/medium/low) but doesn't quantify the expected outcome. "If Dan develops incident_response to working, the team's GetDX reliability driver score historically improves by X points" — this kind of ROI reasoning doesn't exist. |
| **Who's affected** | Managers prioritizing investments (M10), directors justifying budget |
| **Severity** | Medium — without outcome correlation, investment decisions remain qualitative |
| **Why unaddressed** | Summit has no access to GetDX outcome data. Landmark has GetDX data but no capability model. The correlation requires crossing Summit's capability analysis with Landmark's outcome data, and this cross-product reasoning isn't architecturally supported. |

## Task 4: GetDX Integration Opportunities

### Gap 1: Individual growth trajectory — GetDX Scorecards

| Attribute | Detail |
|-----------|--------|
| **GetDX feature** | **Scorecards** — define checks (SQL-based rules) that evaluate team/individual metrics, assign levels (e.g., Gold/Silver/Bronze), and track pass rates over time |
| **Opportunity** | Create a "Growth Trajectory" scorecard with checks derived from framework markers. Each check maps to a skill marker at a proficiency level. As Guide generates evidence matching markers, the scorecard's pass rate becomes a proxy for individual growth. |
| **Data flow** | Guide writes evidence → Map stores it → Export evidence aggregates to GetDX via Scorecards API → GetDX tracks trajectory over time → Landmark reads scorecard state back via `scorecards.info` API |
| **Spec changes** | Landmark spec: add `fit-landmark trajectory --email <email>` command. Map activity layer: add `getdx_scorecards` table and extract/transform for scorecard data. Data contracts: add scorecard ID and check results to evidence pipeline. |
| **New contracts** | `activity.getdx_scorecard_results` table: `scorecard_id`, `check_id`, `entity_id`, `level`, `passed`, `snapshot_date` |
| **Assessment** | Moderate fit. GetDX Scorecards are designed for team-level engineering metrics, not individual skill evidence. Repurposing them for individual growth tracking would work technically but stretches the product's intent. A simpler alternative: Landmark aggregates evidence into a time-series view directly, without round-tripping through GetDX. |

### Gap 2: Promotion readiness — GetDX Scorecards

| Attribute | Detail |
|-----------|--------|
| **GetDX feature** | **Scorecards** with level thresholds (checks that must pass for each level) |
| **Opportunity** | Define a "Promotion Readiness" scorecard per level where checks correspond to required markers. An engineer at L3 aiming for L4 sees: "8/12 L4 markers evidenced, missing: led cross-team design, mentored junior engineer, established testing standard." |
| **Data flow** | Map capability YAML (markers per level) → derive scorecard checks → evaluate against Guide evidence → surface in Landmark as readiness percentage |
| **Spec changes** | Landmark spec: add `fit-landmark readiness --email <email> [--target <level>]`. Map: export marker definitions as scorecard check definitions. |
| **Assessment** | Poor fit. Promotion readiness is fundamentally about matching evidence to framework-defined markers — all data is already in Map. GetDX Scorecards add a dependency and round-trip for no clear benefit. Better: build readiness directly in Landmark using existing evidence and marker data. |

### Gap 3: Initiative tracking — GetDX Initiatives

| Attribute | Detail |
|-----------|--------|
| **GetDX feature** | **Initiatives** — named improvement efforts with owner, due date, priority, tags, and linked scorecard checks tracking completion percentage (`passed_checks` / `total_checks`) |
| **Opportunity** | Strong fit. A manager creates an initiative "Close incident response gap by Q3" in GetDX, links it to relevant scorecard checks (evidence markers for incident response), and tracks progress. Landmark surfaces initiative status alongside team health. |
| **Data flow** | Manager creates initiative in GetDX → GetDX tracks check completion → Map extracts via `initiatives.info` API → Landmark presents initiative progress in `health` view |
| **Spec changes** | Map activity layer: add `activity.getdx_initiatives` table (`id`, `name`, `description`, `scorecard_id`, `owner_email`, `due_date`, `priority`, `passed_checks`, `total_checks`, `completion_pct`, `tags`). Add extract/transform for initiatives. Landmark spec: add `fit-landmark initiative list [--manager <email>]` and `fit-landmark initiative show --id <id>`. Extend `health` view to include active initiatives. |
| **New contracts** | `activity.getdx_initiatives` table. Transform function in `activity/transform/getdx.js`. Query function in `activity/queries/initiatives.js`. |
| **Assessment** | Strong fit. GetDX Initiatives is purpose-built for tracking improvement efforts with objective completion criteria. This directly closes Gap 3 without building custom initiative management. |

### Gap 4: Self-assessment validation — No GetDX fit

| Attribute | Detail |
|-----------|--------|
| **Assessment** | GetDX doesn't provide self-assessment capture. This gap requires a write path (engineer records their self-assessment), which is outside both GetDX and Landmark's scope. Could live in Basecamp (personal operations) or as a Pathway feature. |

### Gap 5: Cross-product signal integration — GetDX Scorecards

| Attribute | Detail |
|-----------|--------|
| **GetDX feature** | Scorecards with custom SQL checks evaluating diverse data sources |
| **Opportunity** | Create a "Practiced Capability" scorecard that combines derived skill profiles with evidence frequency. A check might be: "Team has 3+ engineers with working-level evidence in observability in last 90 days" — not just derived working-level, but evidenced working-level. |
| **Data flow** | Summit derived profiles + Landmark evidence aggregates → define scorecard checks combining both → GetDX evaluates and tracks → Landmark presents "practiced vs. derived" capability view |
| **Spec changes** | Landmark spec: add `fit-landmark practiced --manager <email>` command showing "evidenced capability" alongside Summit's "derived capability." New health view column: `derived_depth` vs `evidenced_depth`. |
| **Assessment** | Moderate fit. The scorecard provides tracking infrastructure, but the core computation (crossing derived profiles with evidence counts) must happen locally. GetDX adds time-series tracking but the fundamental analysis is a Landmark concern. |

### Gap 7: Early warning — GetDX Scorecards + Initiatives

| Attribute | Detail |
|-----------|--------|
| **Opportunity** | Define "Health Check" scorecards with checks like "No GetDX driver dropped >10% quarter-over-quarter" and "All critical skills have 2+ engineers with recent evidence." Failed checks surface as Initiatives automatically. |
| **Data flow** | Map data → scorecard checks evaluated by GetDX → failed checks → auto-generated or linked Initiatives → Landmark surfaces warnings in `health` view |
| **Assessment** | Moderate fit. GetDX can evaluate periodic checks, but the "watching and warning" still requires someone to look at Landmark. For true proactive alerts, Basecamp's scheduler could poll Landmark queries and surface warnings — a cross-product integration not involving GetDX. |

### Gap 8: Investment ROI — GetDX Scorecards trends

| Attribute | Detail |
|-----------|--------|
| **Opportunity** | GetDX tracks scorecard check pass rates over time. If an initiative targets a specific capability, the historical correlation between evidence growth (scorecard) and GetDX driver score improvement (snapshot) becomes measurable. |
| **Assessment** | Weak fit as a direct integration. The correlation analysis is statistical reasoning that neither GetDX nor Landmark currently performs. GetDX provides the time-series data; the analysis itself would need to be built in Landmark. |

## Task 5: Cross-Product Blind Spots

### Blind spot 1: The present tense is invisible

Landmark looks backward (evidence from past artifacts). Summit looks forward
(derived capability from job profiles). Neither answers "what can this team
do *right now*?"

**What breaks:** A team with five engineers carrying "working" in incident
response on their derived profiles but zero incident response evidence in the
last year. Summit says the team is covered. Landmark has no evidence to show.
The manager has false confidence. The gap is invisible because it falls between
retrospective and prospective.

**Signal available but ignored:** Landmark has `practice --manager` showing
evidence frequency per skill. Summit has `coverage` showing derived depth. If
Summit consumed Landmark's practice aggregates, it could distinguish "derived
capability" from "practiced capability." Currently, neither product crosses this
boundary.

### Blind spot 2: GetDX outcomes don't inform capability planning

Landmark shows GetDX driver scores and can join them to contributing skills via
the driver definitions. Summit plans team capability without any awareness of
how the team *feels* about their engineering environment.

**What breaks:** A manager uses Summit to plan a hire focused on reliability
skills. But the team's GetDX data shows their biggest pain point is actually
cognitive load in deployment (a delivery driver). Summit's recommendation is
structurally correct but misaligned with the team's lived experience.

**Signal available but ignored:** Landmark's `health --manager` view already
joins marker evidence to GetDX outcomes. If Summit's `growth` or `what-if`
commands consumed GetDX driver scores, they could weight recommendations by
outcome severity. Currently, Summit is blind to sentiment.

### Blind spot 3: Evidence completeness is unmeasured

Guide generates evidence by interpreting GitHub artifacts against markers. But
nobody measures whether Guide has *covered* the team's artifacts comprehensively.
If Guide only interpreted 30% of a person's PRs, the evidence base is thin —
and Landmark's presentation of that evidence appears authoritative without
qualification.

**What breaks:** An engineer has written extensive design docs but Guide hasn't
processed them. Landmark shows no system_design evidence. The manager concludes
the engineer lacks the skill. The problem is coverage, not capability.

**Signal available but ignored:** Map stores `github_artifacts` (all extracted
artifacts) and `evidence` (Guide-interpreted subset). The ratio
`evidence.count / artifacts.count` per person per skill would measure coverage.
Neither Landmark nor Summit surfaces this. Landmark's `evidence` query could
include an "artifacts without evidence" count. Map's `getUnscoredArtifacts` query
already exists but isn't exposed through Landmark.

### Blind spot 4: No feedback loop from analysis to action

Landmark surfaces insights. Summit surfaces risks and growth opportunities. But
neither product feeds back into any system that tracks whether the insight was
acted upon.

**What breaks:** Landmark shows a declining GetDX driver for three quarters.
Summit shows incident response as a critical gap. The manager sees both. Nothing
records whether they did anything about it, whether the action worked, or whether
to escalate. Each quarter, the same analysis surfaces the same gap with no
memory of prior recommendations.

**Missing feedback loop:** Analysis → Decision → Action → Outcome → Analysis.
Currently the loop is: Analysis → (manual decision) → (untracked action) →
(hope) → Analysis. GetDX Initiatives could close this loop by recording the
decision and tracking the outcome, but neither Landmark nor Summit currently
integrates with Initiatives.

### Blind spot 5: Team boundary assumptions don't match reality

Both products define teams as "everyone under a manager email." But real
engineering work crosses team boundaries. A platform team member embedded in a
product team. A staff engineer advising three teams. A cross-functional project
team assembled for a quarter.

**What breaks:** Summit computes capability coverage for the org-chart team, not
the working team. A cross-functional project might have excellent coverage that
Summit can't see because it doesn't model ad-hoc team compositions. Landmark
similarly scopes evidence and snapshots to the manager hierarchy.

**Partial mitigation:** Summit accepts local YAML rosters for offline planning,
which could represent ad-hoc teams. But there's no way to define project-based
teams in Map's person model, and GetDX teams are also manager-scoped.

## Task 6: Recommendations

### Priority 1: Add "practiced capability" to Summit

| Attribute | Detail |
|-----------|--------|
| **What to change** | Add an optional `--evidenced` flag to `fit-summit coverage` and `fit-summit risks`. When set, Summit reads evidence aggregates from Map (via Landmark's data contracts) and displays `derived_depth` alongside `evidenced_depth`. |
| **Gap closed** | Gap 5 (cross-product signal integration), Blind spot 1 (invisible present tense) |
| **Effort** | Medium — requires Summit to optionally consume Map's activity layer (evidence queries). Core derivation unchanged. Falls back to derived-only when activity data unavailable. |
| **GetDX involved** | No — uses existing Map evidence data directly |
| **Spec impact** | Summit spec: add `--evidenced` flag to `coverage` and `risks` commands. Add `evidenced_depth` to JSON output schema. Document the optional Supabase dependency. |
| **Trade-off** | Breaks Summit's "zero external dependencies" principle. Mitigate by making it strictly optional — Summit remains fully functional without it. |

### Priority 2: Build promotion readiness view in Landmark

| Attribute | Detail |
|-----------|--------|
| **What to change** | Add `fit-landmark readiness --email <email> [--target <level>]`. Derives the target level's required markers from Map capability YAML, matches against existing evidence, and presents a checklist with pass/gap status. |
| **Gap closed** | Gap 2 (promotion readiness), partially Gap 1 (growth trajectory — readiness over time) |
| **Effort** | Medium — requires Landmark to consume libskill's derivation logic (to know what markers apply at a target level) and cross-reference against evidence. |
| **GetDX involved** | No — all data is in Map |
| **Spec impact** | Landmark spec: new `readiness` command. New data contract: Landmark imports marker-level mapping from Map capability YAML via libskill derivation. |

### Priority 3: Integrate GetDX Initiatives for initiative tracking

| Attribute | Detail |
|-----------|--------|
| **What to change** | Map: add extract/transform pipeline for GetDX Initiatives API. Add `activity.getdx_initiatives` table. Landmark: add `fit-landmark initiative list` and `fit-landmark initiative show` commands. Extend `health` view to show active initiatives and their completion percentage. |
| **Gap closed** | Gap 3 (initiative tracking), Blind spot 4 (no feedback loop) |
| **Effort** | Low-medium — GetDX Initiatives API is simple (single endpoint). Extract/transform follows established patterns in Map. Landmark commands are straightforward queries. |
| **GetDX involved** | Yes — Initiatives API (`initiatives.info`) |
| **Spec impact** | Map spec: new table and ETL pipeline. Landmark spec: new `initiative` command group and `health` view extension. New contract: `activity.getdx_initiatives`. |

### Priority 4: Add evidence coverage metrics to Landmark

| Attribute | Detail |
|-----------|--------|
| **What to change** | Add coverage percentage to `fit-landmark evidence` output: "Evidence covers X/Y artifacts for this person/skill." Surface `getUnscoredArtifacts` data that Map already queries. Add `fit-landmark coverage --email <email>` showing which artifact types have been interpreted and which haven't. |
| **Gap closed** | Blind spot 3 (evidence completeness unmeasured) |
| **Effort** | Low — Map's `getUnscoredArtifacts` query exists. Landmark just needs to present the ratio. |
| **GetDX involved** | No |
| **Spec impact** | Landmark spec: extend `evidence` command output. Add optional `coverage` command. |

### Priority 5: Add individual growth timeline to Landmark

| Attribute | Detail |
|-----------|--------|
| **What to change** | Add `fit-landmark timeline --email <email> [--skill <skill_id>]`. Aggregates evidence by quarter, groups by skill and matched-level, and shows how the person's evidenced skill profile evolved. Not self-reported — derived from Guide's evidence over time. |
| **Gap closed** | Gap 1 (individual growth trajectory) |
| **Effort** | Medium — requires time-bucketing evidence rows and deriving "effective evidenced level" per period. The data exists (`evidence.created_at`, `skill_id`, `level_id`) but aggregation logic is new. |
| **GetDX involved** | No |
| **Spec impact** | Landmark spec: new `timeline` command. |

### Priority 6: Weight Summit growth recommendations by GetDX outcomes

| Attribute | Detail |
|-----------|--------|
| **What to change** | Extend `fit-summit growth` to optionally consume GetDX snapshot scores (via Map). When a team gap aligns with a poorly-scoring GetDX driver (via `contributingSkills`), boost its priority. Display: "incident_response — critical gap AND bottom-quartile GetDX reliability score." |
| **Gap closed** | Gap 8 (investment ROI), Blind spot 2 (outcomes don't inform planning) |
| **Effort** | Medium — requires Summit to optionally read GetDX data from Map, and driver-to-skill mapping from driver definitions. |
| **GetDX involved** | Indirectly — uses GetDX data already in Map |
| **Spec impact** | Summit spec: extend `growth` command with optional `--outcomes` flag. Document optional Map activity layer dependency. |

### Priority 7: Enable project-based team definitions

| Attribute | Detail |
|-----------|--------|
| **What to change** | Extend Map's person model to support project-based team membership alongside the manager hierarchy. Allow Summit's local YAML to define project teams referencing people from the org model. Allow Landmark's `--manager` filter to also accept `--team <team_id>` for named teams. |
| **Gap closed** | Blind spot 5 (team boundaries don't match reality) |
| **Effort** | High — requires schema changes in Map, new team model semantics, and updates to both Landmark and Summit team-scoping logic. |
| **GetDX involved** | No — GetDX teams are manager-scoped and can't represent project teams |
| **Spec impact** | Map spec: extend `organization_people` or add `organization_teams` table. Landmark and Summit specs: extend team filter options. |

### Priority 8: Connect Basecamp scheduler to Landmark for early warnings

| Attribute | Detail |
|-----------|--------|
| **What to change** | Add a Basecamp scheduled task that runs key Landmark queries (trend direction, risk detection) and surfaces warnings. Basecamp already has scheduling infrastructure; this adds Landmark-aware analysis tasks. |
| **Gap closed** | Gap 7 (early warning system) |
| **Effort** | Medium — requires defining warning criteria, connecting Basecamp's scheduler to Landmark queries, and adding notification routing. |
| **GetDX involved** | Optionally — could use GetDX Scorecard check failures as warning triggers |
| **Spec impact** | Basecamp spec: new "Landmark monitor" scheduled task type. Cross-product integration between Basecamp and Landmark. |

### Summary Table

| # | Recommendation | Gaps Closed | Effort | GetDX? |
|---|---------------|-------------|--------|--------|
| P1 | Practiced capability in Summit | Gap 5, Blind spot 1 | Medium | No |
| P2 | Promotion readiness in Landmark | Gap 2, Gap 1 (partial) | Medium | No |
| P3 | GetDX Initiatives integration | Gap 3, Blind spot 4 | Low-Med | Yes |
| P4 | Evidence coverage metrics | Blind spot 3 | Low | No |
| P5 | Individual growth timeline | Gap 1 | Medium | No |
| P6 | Outcome-weighted growth recs | Gap 8, Blind spot 2 | Medium | Indirect |
| P7 | Project-based teams | Blind spot 5 | High | No |
| P8 | Basecamp early warning | Gap 7 | Medium | Optional |
