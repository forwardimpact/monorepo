Conduct a JTBD switching interview using the `kata-interview` skill.

The skill defines the protocol: pick a product, pick one of its jobs from
`JTBD.md`, stage the right subset of synthetic data into `$AGENT_CWD`, craft
the persona in `$AGENT_CWD/CLAUDE.md` from that JTBD entry alone, then run
the session asking the persona to get the job done starting from
https://www.forwardimpact.team.

If a `Product:` or `Job:` line is appended below, honour it; otherwise
choose. Any other appended text is steering for the session — pass it
through to the agent as additional instruction.

Before crafting the persona, read `data/synthetic/story.dsl` to learn the
organization's teams, people, projects, levels, and disciplines. Seed the
persona with concrete names, emails, team memberships, and role coordinates
drawn from the DSL — the interviewee should know who they are, who their
teammates are, and what project context they're working in. Never hardcode
details from the examples below; always derive them from the current DSL.

## Worked Examples

The interviews must be deep and specific. The persona should attempt a
concrete task with real data, not just browse documentation. Below are three
examples showing the level of specificity expected. Each ties a JTBD trigger
to a specific guide workflow the persona should discover and attempt.

### Example 1: Engineer after a failed promotion

**Product:** Guide, Landmark
**Job:** Find Growth Areas
**Persona seed:** Software engineer (J060) who just had a promotion
conversation that ended with "not yet" — no specifics given. They want to
know exactly what's missing and what evidence would change the answer. They
know their discipline is Software Engineering and their track is platform.
**Data seed:** Pick a J060 software engineer from a team in the DSL. Give
the persona their name, email (`name@{domain}`), team name, manager name,
and one or two teammates by name. The persona should know their own role
coordinates (discipline, level, track) but not know the product.
**Starting situation:** The persona has no tools installed. They arrive at
https://www.forwardimpact.team wanting to find out what "senior" requires
at their organization and whether their recent work already shows it.
**What the persona should attempt:**

1. Find the Getting Started guide for engineers and install Guide.
2. Ask Guide: "What should I focus on to move from J060 to J070 in
   Software Engineering?"
3. Follow Guide's answer to check their evidence record with Landmark
   (`npx fit-landmark readiness --email ...`).
4. Identify which markers are missing and ask Guide how to build evidence
   for a specific gap (e.g. "Leads architecture for a product or platform
   area").

**Friction to watch for:** Can the persona discover the right Getting
Started page? Does the install-to-first-question path work without
undocumented steps? Does Guide give answers grounded in the standard data,
or generic advice?

### Example 2: Leader preparing a staffing case

**Product:** Pathway, Summit
**Job:** Staff Teams to Succeed
**Persona seed:** Engineering manager whose team just had a post-mortem that
surfaced the same infrastructure skill gap as the last incident. They need
to build a defensible case for a new headcount — "I think we need someone"
is not enough for the budget conversation.
**Data seed:** Pick a team manager from the DSL (an `@handle` in a `manager`
field). Give the persona their name, email, team name, team size, and the
full roster — each member's name, email, discipline, level, and track. The
persona needs enough detail to write a `summit.yaml` without inventing
anything.
**Starting situation:** The persona arrives at
https://www.forwardimpact.team looking for a way to model their team and
show the gap with evidence, not intuition.
**What the persona should attempt:**

1. Find the Getting Started guide for leaders and install Summit.
2. Create a `summit.yaml` roster for their five-person platform team.
3. Run `npx fit-summit risks platform --roster ./summit.yaml` and identify
   single points of failure.
4. Run `npx fit-summit what-if platform --roster ./summit.yaml --add
   "{ discipline: software_engineering, level: J060, track: platform }"`
   to simulate the hire and see which risks it resolves.
5. Use the output to articulate: "Adding a J060 platform engineer resolves
   the infrastructure single point of failure and the observability gap."

**Friction to watch for:** Can the persona create a valid roster without
errors? Does `validate` catch mistakes early? Is the what-if output clear
enough to use directly in a staffing conversation?

### Example 3: Engineer reviewing agent output

**Product:** Pathway, Guide
**Job:** Trust Agent Output
**Persona seed:** Senior engineer (J070) reviewing a PR from an AI coding
agent configured as a J060 platform engineer. The PR introduces a webhook
processing service. The code compiles and tests pass, but the engineer
wants to know if it meets the organization's quality bar without reading
every line.
**Data seed:** Pick a J070 software engineer from the DSL. Give the persona
their name, email, team, and the repo the PR was opened against (pick from
the team's `repos` list). The agent that produced the PR is configured as a
J060 on the platform track — include that in the persona context so they
can look up the right role definition.
**Starting situation:** The persona arrives at
https://www.forwardimpact.team wanting a way to check agent work against
their standard instead of reviewing everything manually.
**What the persona should attempt:**

1. Find the "Verify Agent Work Against the Standard" guide.
2. Run `npx fit-pathway job software_engineering J060 --track=platform` to
   see what the standard expects for the agent's configured role.
3. Drill into `npx fit-pathway skill architecture_design` to see what
   working-level architecture looks like in practice.
4. Start Guide and ask: "Does a webhook service with all logic in a single
   handler meet working-level architecture design in our standard?"
5. Use Guide's response to identify the specific areas to review instead
   of reading every line.

**Friction to watch for:** Can the persona connect the guide's instructions
to the actual CLI commands? Does Pathway's skill output clearly describe
what "working" vs "practitioner" looks like? Does Guide give a grounded
evaluation or a vague one?
