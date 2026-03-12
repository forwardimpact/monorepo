---
name: interview-questions
description: Create or refine engineering interview questions for Mission Fit (skill), Decomposition (capability), and Stakeholder Simulation (behaviour) interviews.
---

# Interview Questions

Create and refine interview questions that find builders — engineers who ship
with speed, taste, and obsessive curiosity. Engineers who treat code as a
creative act, AI as a default collaborator, and "I don't know yet" as the most
exciting sentence in the language.

## When to Use

- Creating new skill, capability, or behaviour questions
- Refining existing questions for quality and specificity
- Reviewing questions for alignment with the hiring philosophy
- Ensuring questions surface creative builders, not textbook regurgitators

## Hiring Philosophy

We are not hiring "senior engineers with 8+ years of Java." We are hiring people
who are _dangerously curious_, who build things because they can't stop
themselves, who have taste about code the way a chef has taste about food. The
old interview playbook — LeetCode, system design bingo, "tell me about a time" —
was designed to find a kind of engineer that is becoming obsolete.

Every question must hunt for these qualities:

1. **Obsessive curiosity** — Not "do they read docs" but "do they disappear down
   rabbit holes and come back with something unexpected?" Do they explore
   because they're _compelled_ to, not because it's on their OKRs?

2. **Taste** — Can they tell the difference between code that works and code
   that _sings_? Do they have opinions about how things should feel, not just
   function? Do they cringe at the right things?

3. **Speed to insight** — How fast do they orient in unfamiliar territory? The
   best engineers don't know everything — they figure out the right thing
   _fast_. They prototype before they plan. They ship to learn.

4. **Creative range** — Do they pull ideas from outside engineering? From
   design, music, biology, economics, games? The monoculture engineer who only
   reads Hacker News is not who we want. We want the polymath who connects dots
   nobody else sees.

5. **AI as native language** — Not "have you tried Copilot?" but "how do you
   think WITH AI?" Do they prompt, critique, iterate, and compose with AI the
   way a director works with actors? Do they know when AI is confidently wrong?
   Do they use AI to go faster AND to go deeper?

6. **Bias to shipping** — Do they get things in front of users? Do they choose
   "good enough now" over "perfect never"? Can they tell the difference between
   the two? Shipping is a muscle and a mindset — we want both.

**Kill these question patterns on sight:**

- **Trivia** — "Explain CAP theorem." "What HTTP status codes exist?" If Google
  answers it in 3 seconds, it has no business in our interview.
- **Pattern matching** — "Design a URL shortener." "How would you build
  Twitter?" These test whether someone has read the same blog posts, not whether
  they can think.
- **Tool worship** — "What's your experience with Kubernetes?" We don't care
  about their resume. We care about their brain.
- **Single right answer** — If there's one correct response, it's a quiz, not an
  interview.
- **Past-tense theatre** — "Tell me about a time when..." invites rehearsed
  stories. Put them in a live scenario and watch what happens _now_.
- **Complexity theatre** — Questions designed to make the interviewer feel smart
  rather than to reveal the candidate's thinking.

## Three Interview Types

### 1. Mission Fit Interview (Skill Questions)

**Format:** 45 minutes, Recruiting Manager + 1 Senior Engineer **Purpose:** Find
out if this person has the instincts, not just the skills.

Skill questions are conversational — but don't mistake conversational for soft.
These should feel like two builders talking shop, where the interviewer can
smell whether the candidate _actually does this_ or just talks about it.

**Schema:** `skill-questions.schema.json` **Location:**
`data/pathway/questions/skills/{skill_id}.yaml`

#### Skill Question Structure

```yaml
professionalQuestions:         # or managementQuestions
  {level}:                     # awareness | foundational | working | practitioner | expert
    - id: {abbrev}_{role}_{level_abbrev}_{number}
      text: Question text (second person, ≤150 chars)
      lookingFor:              # 2-4 indicators of a strong answer
        - Indicator 1
        - Indicator 2
      expectedDurationMinutes: 5-10
      followUps:               # Optional, 1-3 probing questions
        - Follow-up question
```

#### ID Convention for Skills

`{skill_abbrev}_{pro|mgmt}_{aware|found|work|pract|expert}_{number}`

Examples: `ai_aug_pro_work_1`, `cq_mgmt_pract_1`, `pd_pro_found_1`

#### Skill Question Guidelines

- **Awareness (5 min):** Get them talking about X. Not "define X" — "what's
  interesting about X to you?" If they light up, good sign.
- **Foundational (5 min):** "Show me how you'd use X." Concrete, not
  theoretical. The answer should smell like real work, not a tutorial.
- **Working (8 min):** "Walk me through a real decision you made with X." Push
  on the _why_. Add followUps that pressure-test their reasoning.
- **Practitioner (8-10 min):** "How have you changed how your team does X?"
  Listen for whether they lead by doing or by talking.
- **Expert (10 min):** "What's broken about how the industry does X, and what
  would you do about it?" The answer reveals whether they think at scale.

**What to hunt for:**

- At every level: Do they have _taste_ about this skill? Can they tell good from
  great? Do they have opinions, not just knowledge?
- At working+: How do they use AI in this area? Not "have you tried it" but "how
  has it changed your approach?" If AI hasn't changed their approach, that's a
  red flag.
- At practitioner+: Are they building the future or maintaining the past? Do
  they see where this skill is going or just where it's been?
- At every level: Do they get excited? Bored engineers write boring code.

**Duration guidance by level:**

| Level        | Duration | Depth     |
| ------------ | -------- | --------- |
| awareness    | 5 min    | Surface   |
| foundational | 5 min    | Basic     |
| working      | 8 min    | Moderate  |
| practitioner | 8-10 min | Deep      |
| expert       | 10 min   | Strategic |

### 2. Decomposition Interview (Capability Questions)

**Format:** 60 minutes, 2 Senior Engineers **Purpose:** Watch them think live.
Not what they know — how they _attack_.

Forget everything you know about system design interviews. This is not
whiteboarding boxes and arrows. This is dropping someone into a messy, real
problem and watching whether they orient like a builder or freeze like a
student.

**Schema:** `capability-questions.schema.json` **Location:**
`data/pathway/questions/capabilities/{capability_id}.yaml`

#### Capability Question Structure

```yaml
professionalQuestions:         # or managementQuestions
  {level}:                     # working | practitioner (most common)
    - id: {cap_abbrev}_{role}_{level_abbrev}_decomp_{number}
      text: Problem statement (second person, ≤200 chars)
      context: Scenario details that set up the problem
      decompositionPrompts:    # 3-5 guiding questions
        - How would you structure your approach?
        - What would you explore first?
        - How would you validate your assumptions?
        - What trade-offs would you consider?
      lookingFor:              # 2-4 indicators of strong decomposition
        - Indicator 1
        - Indicator 2
      expectedDurationMinutes: 15
      followUps:               # Optional, 1-3 twist questions
        - What if the constraint changed?
```

#### ID Convention for Capabilities

`{capability_abbrev}_{pro|mgmt}_{level_abbrev}_decomp_{number}`

Examples: `data_pro_work_decomp_1`, `ai_mgmt_pract_decomp_1`

#### Decomposition Question Guidelines

**This is NOT system design bingo.** If your question can be answered by someone
who read "Designing Data-Intensive Applications" and memorized the patterns,
throw it away. We are not testing whether they can recite the standard
architecture for a chat app. We are testing whether they can _think their way
into a problem they've never seen before_.

**What decomposition questions MUST do:**

1. **Drop them in the deep end** — The problem should feel unfamiliar. Not
   tricky-for-the-sake-of-tricky, but genuinely requiring them to orient in new
   territory. The engineer who says "I'd Google that first" is more honest than
   the one who pretends to know. Watch for intellectual honesty.

2. **Make speed of orientation visible** — How fast do they go from "I have no
   idea" to "here's how I'd start figuring this out"? That transition speed is
   one of the most valuable things you can observe. Some people get there in 30
   seconds. Some never get there.

3. **Force them to choose before they're ready** — Real engineering means making
   decisions with incomplete information. The scenario should require trade-offs
   where there's no obviously right answer. Watch: do they freeze, or do they
   make a call and explain their reasoning?

4. **Demand AI-native thinking** — If a candidate describes an approach that
   doesn't involve AI tools at any point, stop and ask "how would AI change
   this?" In 2026, an approach that ignores AI is like an approach that ignores
   the internet. It's not wrong — it's incomplete to the point of being a
   signal.

5. **Require cross-domain moves** — The best problems need the candidate to
   think about users, business, technology, and people simultaneously. If they
   can only think about the technical layer, they're a component, not a builder.

**Interviewer stance — be a collaborator, not an examiner:**

- Let them drive. If they ask "can I start with X?" say yes. Watch their
  instinct for where to bite first.
- When they say something interesting, pull the thread: "Why that first?"
- When they miss something big, don't hint — let them discover it or not.
  Discovery is the signal.
- Probe with: "You mentioned X — how would you learn more about that in 20
  minutes with AI tools?" Watch for _how_ they'd learn, not what they'd learn.
- Challenge with: "What breaks if you're wrong about that?" — Systems thinking
  shows up here.
- If they go into rehearsed-answer mode: "Forget best practices for a second —
  what would YOU do? What's your instinct?"

**The `context` field is everything.** It's the difference between a toy problem
and a real one. Include:

- Real stakes — money, users, reputation, deadlines, careers
- Constraints that force creativity — small team, tight timeline, legacy mess
- Stakeholders who want different things — tension is where thinking shows up
- Domain details they won't know — so you can watch them learn in real time
- An obvious AI-shaped hole — something where a good builder would immediately
  think "I'd use AI for that part"

**followUps should yank the rug:**

- "The CEO just changed the priority. What do you do?"
- "You're a week in and realize the problem is different than you thought."
- "Your tech lead disagrees with your approach. They have more context. Go."

**Duration:** 15 minutes per scenario. 3-4 scenarios per hour.

### 3. Stakeholder Simulation Interview (Behaviour Questions)

**Format:** 60 minutes, 3-4 stakeholders role-playing **Purpose:** No more
storytelling. Put them in it and watch.

This is the interview that separates people who _talk about_ engineering from
people who _do_ engineering. The candidate walks into a live scenario with real
stakeholders in character. No prep. No rehearsed stories. Just: here's the
situation, these people need something from you, go.

This is the highest-signal interview we run. Protect its integrity.

**Schema:** `behaviour-questions.schema.json` **Location:**
`data/pathway/questions/behaviours/{behaviour_id}.yaml`

#### Behaviour Question Structure

```yaml
professionalQuestions:         # or managementQuestions
  {maturity}:                  # emerging | developing | practicing | role_modeling | exemplifying
    - id: {behav_abbrev}_{role}_{maturity_abbrev}_{number}
      text: Scenario description (second person, ≤300 chars)
      context: Detailed scenario setup for stakeholders
      simulationPrompts:       # 3-5 prompts for stakeholders to use
        - How would you approach this?
        - Walk me through your first steps
        - How would you communicate this?
        - What would you do if X happened?
      lookingFor:              # 2-4 indicators of strong behavioural response
        - Indicator 1
        - Indicator 2
      expectedDurationMinutes: 20
      followUps:               # Optional, 1-3 escalation prompts
        - What if the situation escalated?
```

#### ID Convention for Behaviours

`{behaviour_abbrev}_{pro|mgmt}_{emerg|dev|pract|role|exemp}_{number}`

Examples: `own_pro_emerg_1`, `sys_mgmt_pract_1`, `poly_pro_role_1`

#### Stakeholder Simulation Guidelines

**This. Is. Live.** Not "tell me about a time." Not a hypothetical. The
stakeholders are IN CHARACTER from the moment the candidate walks in. They have
motivations, pressures, and agendas. The candidate must read the room, make
decisions, and communicate — all in real time.

This is where you find out if someone can actually _build with people_, not just
build with code.

**Writing the scenario (`text` + `context`):**

The scenario must be vivid enough that stakeholders can improvise convincingly.
Flat scenarios produce flat interviews. Your scenario needs:

1. **A lit fuse** — Something just happened or is about to happen. The candidate
   can't sit back and philosophize. They need to act. Make it urgent. Make it
   messy.

2. **Stakeholders who want incompatible things** — The PM wants speed. The
   security lead wants caution. The VP wants a demo by Friday. The tech lead
   thinks the whole approach is wrong. Conflict is the canvas. Without it,
   you're testing nothing.

3. **Real consequences** — Not abstract "this might affect users." Concrete:
   "$2M contract depends on this." "The outage is on the front page of Hacker
   News." "Your team's credibility with leadership is on the line." Stakes
   create pressure. Pressure reveals character.

4. **AI-era dilemmas** — Weave in scenarios where AI is part of the problem or
   solution. "The AI-generated code passed review but caused the incident." "The
   team wants to adopt an AI tool that leadership hasn't approved." "A junior
   engineer shipped AI-generated code without understanding it." These are real
   scenarios happening in real companies right now.

5. **Emotional texture** — Someone is defensive. Someone is afraid. Someone is
   overconfident. The candidate who can only handle logical debates but falls
   apart with emotional stakeholders is missing a critical capability.

**`simulationPrompts` are stage directions for stakeholders:**

- Opening prompt: Launch the scenario naturally. Don't tell the candidate the
  rules — let them figure out what's happening.
- Middle prompts: Each stakeholder pushes their agenda. Create tension. If the
  candidate is coasting, one stakeholder should escalate.
- Late prompts: Introduce a twist. New information, a reversal, an emotional
  reaction. The candidate who adapts in real time is the one you want.
- Stakeholders should _push back_. If the candidate says something reasonable, a
  stakeholder should challenge it. If they say something weak, a stakeholder
  should press harder. The simulation fails if everyone just nods.

**Maturity levels are about the size of the blast radius:**

| Maturity      | Scenario Scope  | Stakeholder Dynamics        | Candidate Role                 |
| ------------- | --------------- | --------------------------- | ------------------------------ |
| emerging      | Single team     | 1-2 clear stakeholders      | IC figuring it out             |
| developing    | Team + adjacent | Conflicting perspectives    | IC owning a piece              |
| practicing    | Cross-team      | Multiple pressures          | Leading without full authority |
| role_modeling | Function-wide   | Organizational politics     | Senior IC, influence only      |
| exemplifying  | Organization    | Executive/strategic tension | Defining the playbook          |

**`lookingFor` must mirror the behaviour's maturity descriptors.** If the
behaviour definition says "practicing" means "proactively identifies and
addresses cross-team dependencies" — then `lookingFor` should be watching for
exactly that behaviour in real time, not a watered-down version.

**Duration:** 20 minutes per simulation. 3 simulations per hour.

## Quality Checklist

Every question must pass all of these. No exceptions. No "it's close enough."

- [ ] **Ungoogleable** — If someone could answer this with a search, delete it
- [ ] **No single right answer** — Multiple valid approaches, or it's a quiz
- [ ] **Reveals HOW they think** — You'd learn more watching them work than
      reading their answer
- [ ] **AI-native** — The question makes sense in a world where AI writes code.
      If it doesn't, it's already obsolete
- [ ] **Future-facing** — Probes for where things are going, not where they've
      been. We're hiring for 2027, not 2019
- [ ] **Opinionated evaluation** — The `lookingFor` items are sharp enough that
      two interviewers would agree on what they saw
- [ ] **Level-appropriate** — Complexity matches target level/maturity. Don't
      sandpaper the edges off senior questions or over-inflate junior ones
- [ ] **Second person** — "You" not "the candidate" or "one"
- [ ] **Character limit** — Skill ≤150, Capability ≤200, Behaviour ≤300
- [ ] **Would YOU want to answer this?** — If the question is boring, the
      answers will be boring. Great questions make people lean forward

## Process

### Creating New Questions

1. **Pick the entity** — Which skill, capability, or behaviour?
2. **Read the entity definition** — Load from `data/pathway/capabilities/`,
   `data/pathway/behaviours/`, or equivalent. Internalize the level
   descriptions. You're writing for _that_ level, not a generic one.
3. **Read existing questions** — Check `data/pathway/questions/`. Know what's
   covered. Don't create a duplicate with different words.
4. **Draft questions** — Follow the guidelines above. Write something that would
   make a great engineer say "oh, interesting." If you wouldn't want to answer
   the question yourself, it's not good enough.
5. **Validate** — `npx fit-map validate`
6. **Gut check against the quality checklist** — Be your own harshest critic

### Refining Existing Questions

1. **Read the questions** from `data/pathway/questions/`
2. **Run the quality checklist** — Flag everything that fails. Be ruthless.
3. **Apply the philosophy** — Does this question find builders? Or does it find
   people who are good at interviews? If someone could pass this question by
   reading a "top 50 interview questions" blog post, kill it.
4. **Sharpen `lookingFor`** — Vague indicators waste everyone's time. "Good
   communication skills" tells the interviewer nothing. "Reframes a technical
   decision in terms the PM cares about" tells them exactly what to watch for.
5. **Add `context`** to decomposition/simulation questions that lack scenario
   depth. If the context is thin, the role-play will be thin.
6. **Add `followUps`** that introduce genuine curveballs, not small variations
7. **Validate** — `npx fit-map validate`

### Writing `lookingFor` Items

`lookingFor` items are the interviewer's scoring rubric. Fuzzy items produce
fuzzy evaluations. Sharp items produce signal.

- **Observable** — Something you can _see_ or _hear_ them do. Not a trait. Not a
  vibe. An action.
- **Specific** — Not "good communication" but "translates a latency issue into
  revenue impact for the VP without being asked"
- **Aligned to level** — Use vocabulary from the entity's level descriptions. An
  awareness-level `lookingFor` and an expert-level one should look completely
  different.
- **2-4 items** — More than 4 means you haven't decided what actually matters

**Strong examples:**

- "Starts by reframing the problem before proposing solutions"
- "Names the second-order effects before being prompted"
- "Reaches for AI tools as a first instinct, not an afterthought"
- "Takes ownership of the gap instead of explaining why it's someone else's"
- "Gets specific — names tools, estimates timelines, identifies the first
  concrete step"

**Weak examples that should never appear:**

- "Good problem-solving skills" — meaningless
- "Knowledge of microservices" — tests recall, not thinking
- "Strong communication" — not observable, not specific
- "Shows leadership" — vague to the point of uselessness

### Writing `decompositionPrompts`

These are the interviewer's playbook for pulling on threads. Each prompt opens a
different dimension of the problem. They should feel like a conversation between
two builders, not cross-examination.

- Each prompt covers a distinct angle — don't overlap
- Open-ended enough that the candidate reveals _their_ framework, not yours
- Progress from "where do you start?" to "what blows up?"
- At least one prompt about people, not systems
- At least one prompt about learning and discovery

**Pattern:**

1. "Where do you bite first?" — Reveals their instinct for prioritization
2. "What would you need to learn, and how would you learn it fast?" — Reveals
   curiosity, resourcefulness, and whether AI is in their toolkit
3. "How would you know if you're wrong?" — Reveals intellectual honesty
4. "Who needs to know about this and what do you tell them?" — Reveals taste in
   communication, not just ability to communicate

### Writing `simulationPrompts`

These are stage directions for the actors. The stakeholders who role-play need
to know how to push, when to escalate, and where the emotional beats are. A flat
simulation prompt produces a flat simulation.

- Tell the stakeholder exactly how to push back — not "challenge them" but
  "express frustration that the last three approaches didn't work"
- Create conversational momentum — not an interrogation, a _situation_
- Increase heat as the simulation progresses
- Include emotional and political dynamics — this is where real engineering
  happens

**Pattern:**

1. "You're the PM. Open with: we need to ship this by Thursday. What's your
   plan?" — Immediate pressure
2. "You're the tech lead. Push back: you think this approach creates technical
   debt that nobody will want to own" — Tension
3. "You're the VP. You need something to show the board. Ask: can you give me
   the one-sentence version of where we are?" — Communication under pressure
4. "Escalate: the PM just got a Slack message that the client is threatening to
   walk. Relay it. Watch what the candidate does." — Adaptability under fire

## File Locations

| Type       | Data Location                                       | Schema Location                                             |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Skill      | `data/pathway/questions/skills/{skill_id}.yaml`     | `products/map/schema/json/skill-questions.schema.json`      |
| Capability | `data/pathway/questions/capabilities/{cap_id}.yaml` | `products/map/schema/json/capability-questions.schema.json` |
| Behaviour  | `data/pathway/questions/behaviours/{behav_id}.yaml` | `products/map/schema/json/behaviour-questions.schema.json`  |

Questions are located in `data/pathway/questions/`.

## Validation

Always run after creating or modifying questions:

```sh
npx fit-map validate
```
