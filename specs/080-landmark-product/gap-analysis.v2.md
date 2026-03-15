# Landmark & Summit v2 — Critical Gap Analysis

Critical analysis of Landmark v2 and Summit v2 specs against the goal of
building the most impactful product suite for cultivating sustainable,
productive, highest-performing engineering teams.

## What's genuinely strong (and rare)

### 1. Teams as systems — the real differentiator

Summit doesn't rank individuals — it models emergent properties of team
composition (coverage, redundancy, concentration risk, single points of
failure). No mainstream product does this. Tools like Pluralsight Flow,
Jellyfish, LinearB, and Swarmia all measure _activity_ of individuals and
aggregate up. Summit inverts this: it starts with structural capability and asks
"can this team deliver?" That's a fundamentally different question and a more
useful one.

### 2. What-if scenario engine — the killer feature

Simulating `--add`, `--remove`, `--move`, `--promote` before making a staffing
decision is something engineering leaders currently do on whiteboards or
spreadsheets. Making it deterministic and instant, grounded in a real skill
framework, is genuinely 10x for hiring and reorg decisions.

### 3. Evidence pipeline (Guide -> Map -> Landmark) — architecturally novel

Having an LLM interpret actual GitHub artifacts against concrete markers, then
having Landmark present that interpretation read-only — this separates
_judgment_ (Guide) from _presentation_ (Landmark) cleanly. No other tool
connects objective code artifacts to a skill framework through structured
evidence.

### 4. Derived vs evidenced distinction (v2) — the right insight

The gap between "what job profiles say" and "what people actually do" is the
most important thing a manager needs to see. This is where Summit v2 and
Landmark v2 become more than the sum of their parts.

## Where the specs fall short of 10x

### Gap 1: Landmark is too passive — a dashboard, not a decision engine

Landmark reads and presents. The spec explicitly says "query, aggregate,
explain" and treats this as a virtue. But for 10x impact, the question isn't
"what do the signals say?" — it's "what should I do about it?"

The `readiness` command is a checklist. The `timeline` is a historical view. The
`health` view juxtaposes data. None of these _recommend_ anything. Landmark v2
adds initiative tracking (showing what actions exist), but it doesn't connect
insights to actions. A manager sees "incident_response is a gap and reliability
scores poorly" — then what? They context-switch to Summit for growth
recommendations, or to GetDX for initiatives.

**Recommendation:** Landmark should surface Summit's growth recommendations
inline in the health view. When it shows a gap + poor driver score, it should
say "Summit suggests: Dan or Carol could develop incident_response." The
architectural purity of "Landmark only reads" is costing user impact. No LLM
calls needed — just import Summit's growth logic.

### Gap 2: Privacy model too aggregated to be actionable

"Privacy through aggregation" sounds noble, but the growth view already names
individuals: "Dan (L2) or Carol (L3) could develop this skill." The
concentration risk view says "3 of 5 engineers at L3 working level." In a
5-person team, aggregation doesn't provide meaningful anonymity — everyone knows
who the 3 L3s are.

The real question is: who is the audience? If it's the engineering manager, they
already see individual Pathway profiles. The aggregation isn't protecting
privacy — it's obscuring actionability. If it's for skip-level leaders, the
aggregation makes sense but the named growth recommendations don't.

**Recommendation:** Be explicit about the audience per view. For the manager's
1:1 tool (growth), lean into individual specificity. For the director's planning
tool (coverage, risks, what-if), keep aggregation. Don't apply one privacy model
to two different use cases.

### Gap 3: No engineer voice — the system talks _about_ engineers, not _with_ them

This is the biggest gap for "sustainable, productive, highest performing teams."
Both specs are manager-facing tools. The engineer's voice is entirely absent:

- Landmark shows evidence the _system_ collected about the engineer.
- Summit shows what the _team structure_ needs from the engineer.
- Neither asks the engineer: "What do you _want_ to grow in? What's blocking
  you? Do you agree with this assessment?"

The spec explicitly defers self-assessment to "Basecamp or Pathway" (Landmark
spec, Out of scope). But without it, you have a system that tells engineers
where they should grow based on team needs (Summit) and what evidence exists
about them (Landmark) — without their input. This is Deming's "inspection after
the fact" applied to people, which contradicts the stated philosophy.

**Recommendation:** Add a lightweight feedback loop. When Landmark shows a
readiness checklist, let the engineer flag markers as "working on this" or "not
applicable to my role." When Summit suggests growth directions, let the engineer
indicate interest. This doesn't need to be a full self-assessment system — just
a response channel that makes it bidirectional.

### Gap 4: GetDX dependency is a strategic risk and a ceiling on uniqueness

Both v2 specs lean heavily on GetDX for the "outcomes" signal. GetDX is the only
survey source. The driver model is built around GetDX's taxonomy. If GetDX
changes their API, deprecates features, or gets acquired, both products lose
their outcome signal.

More importantly: GetDX is not unique to Forward Impact. Any competitor could
integrate GetDX snapshots. The 10x moat should be in what you do _with_ the data
that nobody else can replicate — and that's the marker/evidence pipeline + skill
derivation. But the specs treat GetDX integration as a first-class feature
rather than a pluggable data source.

**Recommendation:** Abstract the outcome signal. Define a `driver_scores`
interface that GetDX populates today but that could accept data from DX Core 4,
Pulse surveys, or custom instruments. The driver-to-contributing-skills mapping
is yours — that's the value. The raw scores are commodity.

### Gap 5: Feedback loop is incomplete — initiatives tracked but not connected to outcomes

Landmark v2 adds initiative tracking from GetDX. But it's one-directional: you
can see that initiatives exist and their completion percentage. You can't see
whether completed initiatives actually moved the scores they targeted. The spec
says this closes the "analysis-to-action feedback loop," but it only closes half
of it (analysis -> action). The other half (action -> outcome) is missing.

**Recommendation:** Add a `landmark initiative impact` view that shows:
"Initiative X completed in Q2. Target driver 'reliability' moved from 35th to
52nd percentile in Q3." This closes the full loop and makes the system
self-improving. It's just a join between initiative timestamps and snapshot
score deltas — no LLM needed.

### Gap 6: No team health trajectory — both products are snapshot-in-time

Landmark has individual timelines (v2). But neither product shows _team
capability evolution over time_. A director can't answer: "Is this team getting
stronger or weaker quarter over quarter?" Summit's what-if is future-facing but
hypothetical. Landmark's timeline is individual. Nobody shows the team's actual
trajectory.

**Recommendation:** Add `summit trajectory <team>` that shows team coverage
changes over quarters (as people join, leave, get promoted, or grow). This turns
Summit from a planning tool into a planning + tracking tool, which is where the
real stickiness lives.

### Gap 7: Cross-functional and matrix teams are undertreated

Summit v2 adds project-based teams — good. But the implementation is a static
YAML file. Real project teams form and dissolve constantly. An engineer might be
on 2-3 project teams while belonging to one reporting team. The spec doesn't
address:

- How project team rosters stay current.
- Capability analysis when a person's time is split across teams.
- Whether the same person's growth can satisfy gaps on multiple teams.

**Recommendation:** Allow project teams to reference Map's org model dynamically
(already planned) but also model allocation percentages. "Alice is 60% on
Platform, 40% on Migration" changes the capability calculus significantly.

## Competitive positioning

The specs position Forward Impact against an implied void — "no tool does this
today." That's partially true for the _combination_ but not for individual
features:

| Feature                         | Exists elsewhere?                             |
| ------------------------------- | --------------------------------------------- |
| Skill frameworks                | Progression.fyi, Snowflake, custom            |
| Team skill matrices             | TeamRetro, SkillsMap, various spreadsheets    |
| Developer analytics             | LinearB, Swarmia, Jellyfish, Pluralsight Flow |
| Survey integration              | GetDX, DX Core 4, Pulse                       |
| What-if staffing                | No mainstream tool does this well             |
| Evidence-based skill assessment | No tool connects artifacts to markers         |
| Derived vs practiced gap        | Nobody does this                              |

The unique combination is: **evidence-based skill assessment + team-as-system
modeling + what-if planning + outcome-weighted growth.** That's genuinely novel.
But the specs don't articulate this competitive wedge sharply enough. They read
as feature lists rather than as a narrative about why the _combination_ is
transformative.

## Verdict

**Summit v2 is closer to 10x than Landmark v2.** Summit's what-if scenarios,
growth alignment, and team-as-system philosophy are genuinely differentiated.
The v2 additions (evidenced capability, outcome-weighted growth) strengthen it
meaningfully.

**Landmark v2 is solid but risks being "just a dashboard."** It presents data
well but doesn't drive decisions. Without recommendations, feedback loops, or
forward-looking guidance, it's a read-only view that managers check occasionally
rather than a tool that changes how they lead.

**Together, they're 7x — not yet 10x.** The missing pieces:

1. Engineer voice and bidirectional feedback.
2. Team trajectory over time.
3. Full action-to-outcome loop.
4. Cross-product recommendations (Landmark surfacing Summit insights).
5. Abstract outcome sources beyond GetDX.

The architecture is right. The data model is rich. The philosophy (Deming,
systems thinking, capability not performance) is excellent. But the specs are
too respectful of architectural boundaries at the cost of user impact. A 10x
product doesn't care which module the insight comes from — it puts the right
information in front of the right person at the right moment.
