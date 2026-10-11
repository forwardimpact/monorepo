# Spec 2410: Agent-backed commands take a plain command line, and a small embedded agent makes the judgment calls

**Classification:** product. It changes the published `gemba-wiki`,
`gemba-trace`, `gemba-xmr`, and `jidoka` CLIs and the actions, skills, and
pages around them
([team protocol § Classify Every Finding](../../.claude/agents/x-team-protocol.md#classify-every-finding)).

**Persona and job:** Teams Using Agents. The primary job is Gemba's
[Stand Up and Operate an Agent Team](../../JTBD.md#teams-using-agents-stand-up-and-operate-an-agent-team).
Its Little Hire is "run one agent session, read one trace, or chart one metric
with a single command from the platform's family". It is fired when "the
platform's loop constrains a team more than the plumbing it replaced". Kata
agents are the main callers, so the change also serves Kata's
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team).
`jidoka fix` serves the Big Hire of Jidoka's
[Build Quality Into Agent Instructions](../../JTBD.md#teams-using-agents-build-quality-into-agent-instructions):
keep one layered instruction architecture. The checks stay the Little Hire.
§ Compatibility weighs the price against all three jobs.

## Problem

Agents are the main callers of these commands. The skills and agent profiles
call them on 62 lines in 18 files
(`rg -c 'gemba-wiki (push|log|inbox|memo|claim|fix)|gemba-trace [a-z]|gemba-xmr record|jidoka (instructions|fix)' .claude/skills .claude/agents`).
The Stop hook runs `push` each time a session agent ends a turn. Each command
below carries a judgment call that the caller must make before the command runs,
or after the command refuses. The caller makes it with flags, indexes, and
reason codes.

### The flag surfaces carry the caller's judgment

| Command | Surface today | The judgment the caller carries |
| --- | --- | --- |
| `gemba-wiki push` | One fixed commit message for every push. A rebase conflict on a prose file fails with `conflict`, and the caller resolves it by hand. The command can end with more than a dozen distinct failure and refusal reasons. | Merge two sessions' prose. Read the reason code and pick the next step. |
| `gemba-wiki log` | Three subcommands and nine options. A decision entry takes four separate fields. | Classify the entry. Split the text into fields. |
| `gemba-wiki inbox` | Four subcommands. Each action takes a 0-based `--index`, and the indexes shift after each removal. Ack and drop both delete the memo and record nothing. | Decide each memo's fate. Track the shifted indexes. |
| `gemba-wiki memo` | `--from`, `--to`, and `--message`. | Pick the recipient. |
| `gemba-wiki claim` | Seven options. It refuses only the caller's own duplicate. The team protocol has the caller check the other agents' claims by hand first. | Spot another agent's claim on the same work, under the same id or another one. |
| `gemba-trace` | 26 subcommands. | Pick and chain the queries that answer one question. |
| `gemba-xmr record` | Eleven options. A route-bearing metric needs `--route` and takes `--routes-eligible`. | Map a run's outcome to a declared metric, its value, and the route ids. |
| `jidoka instructions` | Reports a length breach. No command fixes it. | Move text and lose no content. |

### The callers pay for it

| Command | What happened | Record |
| --- | --- | --- |
| `push` | A mid-merge refusal printed "nothing to push" at exit 0. One agent's residue conflict then blocked the Stop-hook push of every peer. | #2069, #2076 |
| `push` | Nine of fifteen refusal strings fail the imperative audit. The residue-conflict text tells the operator to pop another agent's stash. | #2063, #2059 |
| `push` | Eight specs patched the publish path in June: 1750, 1780, 1890, 1900, 1920, 1960, 1970, and 2030. One release-engineer run needed five rebases to land a one-line fix. | The specs; `release-engineer-2026-W24-part10` |
| `log` | A typo in `--agent` creates a log for an agent that does not exist. | bionova-apps-v2#497 |
| `claim` | An agent invented a `--ttl` option. Two agents held the same target. On 2026-10-11 the claims ledger holds 44 rows, all expired, with targets in more than ten syntaxes. Four specs carry two claims each under two ids. | #1490, #1539, the claims ledger |
| `inbox` | Ack and drop destroy mail, and no action writes to the weekly log. | bionova-apps-v2#259 |
| `gemba-trace` | An analyst fell back to raw grep for seven of ten gaps, and two studies took about 45 calls and 15 script wrappers. Specs 0570 and 1220 answered with seven more subcommands. In July the trace options still used three names for one trace file. | #408, #996, the devex-engineer log of week 29 |
| `gemba-xmr record` | No row carried the route context the metric needed, so spec 1590 added two more options. | #1467, spec 1590 |
| `jidoka instructions` | Main went red on nine cap breaches in seven weeks. Two trim pull requests were closed as superseded. About twenty trim-to-cap commits landed in the same weeks. | #610 to #1781, PRs #763 and #911 |

Deterministic rules close part of this table: the refusal texts (#2063, #2059),
the mid-merge exit (#2069, #2076), the `--agent` typo, the unrecorded
inbox actions, and the claim syntaxes, which one parse of the claim text
removes. The rest calls for judgment: merging two sessions' prose, reading a
trace, mapping a run's outcome to a metric, spotting another agent's claim on
the same work, and moving instruction text. Four of the agent's judgments have
no incident behind them: the `memo` recipient, the `push` commit body, the
`log` field split, and the `inbox` disposition. They come from this spec's
product decision that every call runs the agent.

### One command already works the other way

`gemba-wiki fix` runs an embedded agent on the prose-judgment findings of the
wiki audit. It audits again after each round, and the audit decides the
result. It flags what the agent cannot fix. The caller types one command and
makes no judgment call. Its round loop lives inside that one command, and it
returns text only.

## Proposal

Each command in scope becomes an agent-backed command. A caller uses it like
any other CLI command. Inside, a small agent with a narrow scope makes the
judgment call, and deterministic checks decide whether the work stands.

### A: The contract every agent-backed command keeps

1. **A plain command line in.** The caller passes arguments and options. A
   command that needs the caller's words takes them as one free-text argument.
   The caller never writes a prompt, passes a schema, or sees the agent. The
   identity options stay: `--agent` and `--from` (spec 1740), and on `record`
   `--skill` with its `LIBHARNESS_SKILL` fallback, `--run`, and `--event-type`.
   `--wiki-root`, `--today`, `--date`, `push --paths`, spec 2390's
   `push --remove`, and `release --expired` also stay.
2. **One path.** No option, mode, or environment setting skips the agent, and no
   second command does the same job without it. Every call runs the agent,
   including a call with nothing to judge, unless the command refuses its input
   before the agent starts:

   | Refusal before the agent starts | Commands | Outcome |
   | --- | --- | --- |
   | A usage error | All nine | Usage error |
   | An agent name that a non-empty roster lacks | `log`, `inbox`, `memo`, `claim` | Usage error |
   | No wiki tree | The six `gemba-wiki` commands | `noop`, as today |
   | The wiki is mid-merge, mid-rebase, or on a detached head | `push`, `claim` | `needs-human` |
   | The wiki history is unrelated to its remote | `push`, `claim` | `blocked` |
   | The remote cannot be reached, or the relationship to it cannot be confirmed | `push`, `claim` | `failed` |
   | Another publish holds the wiki clone | `push`, `claim` | `failed` |
   | The task or a given trace holds a secret | All nine | `blocked` |

   A refusal before the agent starts writes nothing. The commands that stay
   beside these nine do other jobs: `rotate` seals logs for the fix pre-pass,
   and the kept `gemba-trace` commands feed pipelines. The libraries' exported
   writers stay available to code that computes its own values, such as
   `product-mix`. The skills teach only the commands.
3. **The gates decide.** Deterministic checks accept or refuse each proposal
   and each edit. A proposal that leaves an item undecided fails the
   completeness gate. No gate exemption keys on text that the agent wrote.
4. **The command writes.** The agent proposes, and the command writes, except
   in the two fix commands. There the agent edits only the files the command
   names for it. A fix is gated with every other fix that shares a file with
   it. Such a group stays when its findings are gone, no new finding appears,
   and the content gates hold on the final files. A refused group returns its
   files to their content before the agent's first edit. A call that ends in
   `failed` or `blocked` after the agent starts returns every file the agent
   touched. A `failed` push keeps the session's changes committed for the next
   push.
5. **Secrets reach no model unscanned.** Every text the agent receives passes
   the secret scan first: the task, the traces it is given, and each tool
   result, including each file it reads. A finding before the agent starts
   ends the call in `blocked`. A finding during the run withholds that text,
   stops the agent, and ends the call in `blocked`. For wiki text, an
   operator's audited override of a finding lets that text through, and the
   override record notes that the text also went to the model provider. Other
   text has no override. No setting lets unscanned text through.
6. **The agent runs alone.** The embedded agent loads none of the host's hooks,
   settings, skills, project instructions, memory, or MCP servers. Managed
   policy settings that an administrator sets still apply. A credential that
   lives only in Claude Code settings does not reach the agent.
7. **Five outcomes.** The refusals of § A2 and the secret findings of § A5 take
   the outcomes those sections give. Otherwise a call whose agent did not finish
   ends in `failed`. Otherwise, when several outcomes apply, the first in this
   order wins: `blocked`, `needs-human`, `failed`.

   | Outcome | Meaning, with examples | Exit code |
   | --- | --- | --- |
   | `done` | The gates accepted the work, and the command wrote, published, or answered it. | 0 |
   | `noop` | The command had nothing to write. | 0 |
   | `failed` | A cause outside the work stopped the call: no credential, no scanner, a model error, a time limit, the network, a scan that could not run, a busy clone, or a push the remote rejected twice. A retry can succeed once the cause clears. | 3 |
   | `needs-human` | The work needs a person: an unresolved item, proposals that still failed a gate after three rounds, a line both sides changed, findings a fix left, an overlap only the agent saw, or a wiki state a person must settle (mid-merge, a budget breach, a conservation refusal, or conflict markers). | 4 |
   | `blocked` | A rule refuses the work until the state it reads changes: a secret, another agent's claim on the same id, or unrelated history. | 5 |

   A usage error keeps exit code 2, and an unexpected error keeps exit code 1.
   The Stop-hook mode of § A13 maps these codes to the hook's own codes.
8. **Text by default, a result object on request.** `--format json` (a new
   option on the six `gemba-wiki` commands, the global option on `gemba-trace`
   and `gemba-xmr`) and the global `--json` on `jidoka` print one object with
   six fields: `command`, `outcome`, `reason`, `facts`, `pending`, and `next`.
   `facts` holds what the command wrote, found, or answered. `pending` lists
   each item that needs a human, with its location when it has one and its
   reason. `next` names one action that is safe to take. The text output
   writes `next` to stderr.
9. **The agent stays out of the output.** The output names no model or cost of
   the command's own run. A new `--verbose` option on all nine commands writes
   them and the path of the run's trace file to stderr.
10. **Limits and failures.** A proposer (`push`, `log`, `inbox`, `memo`,
    `claim`, `record`) returns a proposal that the command writes. Each of its
    questions has 30 seconds for all its rounds, and one call spends at most
    60 seconds in its agent. A reader (`ask`) has 120 seconds per run. An
    editor (the two fix commands) has 180 seconds per run. A `push` call ends
    within 110 seconds in all. A missing credential, a missing scanner, a host
    that refuses to run the agent, a model error, and a time limit each end
    the call in `failed` with a reason that names the cause. A model
    credential is any credential the agent runtime accepts from the
    environment or a local login.
11. **The command carries its own agent.** No command reads an agent profile to
    learn its task. The roster rule and `memo` read the profiles as data.
12. **One behaviour.** All nine commands apply the limits of their kind, the
    same scans, the same isolation, and the same result contract.
    `gemba-wiki fix` takes them on.
13. **The Stop hook.** `gemba-wiki` ships the Stop-hook rule as a mode of
    `push`, so every installation runs the same rule. The rule blocks the stop
    once on `needs-human` and `blocked`, so the session agent reads `next`. It
    does not block again when the stop is already a retry from the hook, and
    it never blocks on any other exit. Run by hand, it does not wait for hook
    input.
14. **Safe interruption.** A `push` or `claim` that its host stops at any point
    leaves no merge or rebase in progress and the remote at its old tip or at
    the new commit. Every `gemba-wiki` command, in scope or not, first brings
    an interrupted publish's working tree in line, unless a live publish holds
    the clone.
15. **One publish at a time.** A push or claim that meets another publish in
    flight in the same wiki clone ends in `failed` at once and writes nothing.
    A push's uncommitted work waits for the next push. A `release` that meets
    one exits 1, as its other refusals do. A publish whose holder has gone
    does not hold the clone. Every publish checks the claim rows it carries
    against the remote tip it fetches.
16. **Removed forms name their replacement.** A call of a removed subcommand or
    option ends in a usage error whose message names the new form. A removed
    subcommand counts as one only in the place a subcommand takes. These
    messages stay for the next two releases of each CLI after the second
    merge. A host that still sets the removed `FIT_WIKI_SCANNER_ABSENT_OK`
    gets no effect from it.

### B: The commands

| Command line | The agent judges | The gates | `facts` |
| --- | --- | --- | --- |
| `gemba-wiki push` | The commit body. The subject stays the command's. On a conflict, a merge of each conflicted prose file that git cannot merge by its own rules. | The body passes the secret scan, and no other gate reads it. A base line that one side changed keeps that change. A base line that both sides changed differently stops the call in `needs-human`. Insertions from both sides at one place both stay. No merged line is absent from all three versions. No conflict marker. A conflicting row in a named ledger stops the call in `needs-human`, as spec 2390 decides. The secret scan, the ancestry guard, the conservation guard, and the budget gate. | The commit, the files, and each merged file. |
| `gemba-wiki log --agent <name> "<text>"` | The entry type (decision, note, or done), and the split of the text into fields. | Each field is a span of the caller's text. A note's heading is the text before its first colon, else `Note`. The entry passes the weekly-log rules. | The entry as written. |
| `gemba-wiki inbox --agent <name> ["<instruction>"]` | One disposition per memo: ack, promote with an owner, drop, keep, or unresolved. It reads the agent's summary, priorities, and claims, and the caller's instruction when given. | Each memo gets one disposition. A promoted memo's owner is on the roster, and the memo appears in the priorities. The weekly log records every disposition with its reason. A kept or unresolved memo stays in the inbox. | Each memo with its disposition and reason. |
| `gemba-wiki memo --from <name> "<message>"` | The recipients, when the message does not open with names: the agents whose profile descriptions match its topic. | At least one recipient. Each recipient is on the roster. The sender is never a recipient. A message that opens with names, or with `all` or `everyone`, goes to exactly those agents, or to every agent but the sender. | The recipients. |
| `gemba-wiki claim --agent <name> "<text>"` | Whether another agent's unexpired claim with the same branch or pull request covers the same work. | Another agent's unexpired claim on the same id refuses the call, on the local claims and again on each fetched remote tip. A refusal on the tip drops the local row. An overlap the agent confirms ends the call in `needs-human`. | The claim row, or the overlapping claim and its holder. |
| `gemba-trace ask --file <trace>… "<question>"` | The answer. It reads the traces with read-only trace tools, which include the multi-trace totals. | The answer holds at least one citation. Each citation names a turn that exists and quotes text that the turn holds. Each number in the answer appears in a trace-tool result of the same run. | The answer and its citations. |
| `gemba-xmr record --skill <skill> "<text>"` | The metric, the value, the route and the eligible routes, and the note. | The metric is declared in the skill's metrics reference, present in its file, or named in the text as written. The value appears in the text, and the note is a span of it. Each route id is one that the text names by id or label. The unit comes from the metrics reference, else from the metric's earlier rows, else `count`. The row passes the file schema and the route-decision check. | The row as appended and its one-line XmR summary. |
| `jidoka fix` | Moves text to clear the findings of `jidoka instructions`. | The agent edits instruction layers only. Each fixed finding is gone, and no new finding appears. Every relative link outside code in an edited file resolves. Every removed sentence appears, after the edit, in a file that the layer it left links to. Every added sentence appeared in an instruction layer before the edit. | Each finding fixed, each move, and each finding left. |
| `gemba-wiki fix` | The prose-judgment fixes it makes today, except rewordings. | The agent edits wiki files only. Each fixed finding is gone, and no new audit finding appears. A removed line's content appears in a wiki file after the edit, and an added line's content appeared in a wiki file before it, compared without regard to case, spacing, punctuation, or number format. A line that a finding's own rule asks to remove or add is exempt, such as a duplicate row, a settled claim, a stale priority row, a required heading, or a marker. | Each finding fixed and each finding left. |

**Memo names.** A message opens with names when, after an optional greeting
word (`hello`, `hi`, `dear`, or `to`), its first words are roster ids or their
title-case forms (`Product Manager` for `product-manager`). The names run
until the first word that is no roster name. Commas and `and` between names
are skipped. The sender's own name is skipped.

**Claim text.** Code parses the claim text, and the agent judges none of it.
`on branch <b>` names the branch, else the claim takes the current branch of
the project checkout, and a detached head leaves it empty. `for <n> day(s)`
names the duration, which must be one to seven days, else one day. `PR #<n>`
names the claim's pull request, and when the text names no pull request, the
command reads the open pull request of the branch when GitHub answers. What
remains maps onto the claim grammar: `spec-<n>`, `spec-<n>/<part>`, and
`issue-<n>` when the text names one, else `pr-<n>` when it names a pull
request, each with an optional `-<activity>` suffix from the words that
follow, or else a lowercase slug of the words. Case and spaces fold
(`Spec 2410 review` is `spec-2410-review`), and `part <k>` adds `/<kk>`. A
bare `#<n>`, a duration outside the range, or a text with nothing left to map
is a usage error. A claim the caller already holds ends in `noop` when its row
is published, and the call publishes it when the row is only local.

**Release.** `release` takes its target as the same free-text argument, parses
it with the same code, and runs no agent. It keeps its output and its exit
codes, including exit 0 on a target that matches no claim and exit 1 on a
refusal, a busy clone, or a conflict outside its row.

**Fixes.** A fix run that leaves findings ends in `needs-human` with them in
`pending`. A finding that only a removal of content from every layer, or only a
rewording, can clear is one the agent leaves. The deterministic rotation and
re-bisect pre-pass of `gemba-wiki fix` stays. `jidoka jtbd --fix` keeps its
job.

### C: What leaves

| Surface | Replaced by |
| --- | --- |
| The `log` subcommands (`decision`, `note`, `done`) and the `--surveyed`, `--chosen`, `--rationale`, `--alternatives`, `--field`, and `--body` options | The free-text argument |
| The `inbox` subcommands (`list`, `ack`, `promote`, `drop`) and the `--index` and `--owner` options | One `inbox` call with an optional instruction. A reader reads the inbox in the agent's summary file. |
| The `memo` options `--to` and `--message` | The free-text argument |
| The `claim` options `--target`, `--branch`, `--pr`, and `--expires-at`, and the `release` option `--target` | The free-text argument |
| The nineteen `gemba-trace` subcommands that answer questions: `overview`, `count`, `batch`, `head`, `tail`, `search`, `tools`, `tool`, `tool-calls`, `commands`, `paths`, `compare`, `errors`, `reasoning`, `timeline`, `stats`, `init`, `turn`, and `filter`, and the `--signatures` option | `ask`. `runs`, `find`, `download`, `split`, `cost`, `assert`, and `by-discussion` stay: they locate, fetch, split, and check traces for pipelines and evals. |
| The `gemba-xmr record` options `--metric`, `--value`, `--unit`, `--note`, `--route`, and `--routes-eligible` | The free-text argument and the metrics reference. A new metric with no reference and no earlier rows records unit `count`. |
| The private round loop of `gemba-wiki fix`, its exits that skip the agent, its use of the technical-writer profile, its text-only result, and its rewording fixes | The shared behaviour of § A12 and the result contract. A rewording goes to a person. |
| Every exit code of the nine commands that § A7 does not keep, and the offline "saved locally" success of `claim` | § A7 |
| `product-mix`'s call to the `record` command | A library writer that `record` shares |
| The `FIT_WIKI_SCANNER_ABSENT_OK` override | A scanner on every host that runs these commands |

## Scope

| In | Out |
| --- | --- |
| The nine commands in § B, their help and examples, and their tests | `gemba-wiki pull`, apart from the § A14 sync and the lock. Its conflict message already points the caller to `push`. |
| The shared behaviour, the result contract, the secret scan of agent input, the limits, and the publish lock | `gemba-wiki audit`, `rotate`, `refresh`, `boot`, `curate`, `ledger`, `init`, and the scaffold of spec 2400, apart from the § A14 sync |
| `release`'s target input and its busy-clone exit. `product-mix`'s row write. | `release`'s other behaviour. `product-mix`'s computation. |
| The `gemba-trace` subcommand set | The kept `gemba-trace` commands |
| The `gemba-xmr record` input | The `gemba-xmr` read commands and the event-type rule of spec 2370 |
| `jidoka fix` | The `jidoka` checks (`instructions`, `invariants`, and `jtbd`, with its `--fix`). They stay deterministic CI gates. |
| The actions that carry the new binaries and the credential: `gemba-wiki`, `gemba-bootstrap`, `kata-agent`, and `kata-interview`, and every pin of them in this repository's workflows | The `gemba-harness`, `gemba-benchmark`, `gemba-watchdog`, and `gemba-selfedit` CLIs |
| Every caller of a removed form or an old exit code: `.claude/skills` (with the inbox step of `kata-wiki-curate`), `.claude/agents` (with the claim and inbox steps of the team protocol), the composite actions and their READMEs, `.github`, `scripts`, the justfile, the root documents, `package.json`, the library READMEs and tests, the audit hints, the CLI help examples, and the `benchmarks/fit-wiki` eval family | The result contract for commands without an agent. They keep their output. |
| The `gemba-wiki`, `gemba-trace`, `gemba-xmr`, `gemba-harness`, `jidoka-audit`, and `jidoka-layer` skills, and the gemba and jidoka pages that describe these commands and the override | The issues on the conservation guard (#2077, #2218). Spec 2390's declared removal answers them. |
| This repository's Stop hook, the Stop-hook command in the `kata-setup` hooks reference that spec 2400 writes, and two entries in the `kata-setup` changelog of spec 2390: one adds the credential input to an installation's action steps, and one moves its packs and actions together | |

## Compatibility

Clean break. Every surface in § C goes, and every caller moves with it. The
change lands in two merges. The first merge ships the CLIs, the libraries,
and the actions. A gear release, the action releases under their new majors,
and this repository's repins follow it. The second merge moves the skills, the
agent profiles, the protocol, and the pages. Bare command names resolve to the
pinned gear binaries. In this repository `bunx` resolves to the workspace
package, and elsewhere `npx` resolves to the newest published package. So in
each window some caller meets a CLI and instructions of different ages. § A16
covers that: an agent that follows an old instruction gets a usage error that
names the new form, and its next call succeeds. An installation that calls
`npx` with older packs gets the same help until it updates its packs. An
installation on the old action majors keeps its pinned binaries until the two
changelog entries move its packs, actions, and credential together.

The change has a price, weighed here against the three jobs.

- **Credentials and cost.** Each of the nine commands needs a model credential
  wherever it runs. Each call costs one fast-model run, and S45 and S46 bound
  a push run's cost.
- **Latency.** Claude Code fires the Stop hook each time a session agent ends a
  turn, so an interactive session waits for one push run per turn, at most
  110 seconds, and S46 bounds the common empty push.
- **Outages.** A model outage ends every `push`, `claim`, `log`, `memo`,
  `inbox`, `record`, and fix call in `failed`, and no command can answer a
  question about a trace. A `claim` with no network now fails where it saved
  locally before. On an ephemeral runner, the unpushed memory leaves with the
  runner. This works against the Gemba Big Hire's "persist memory", and the
  spec accepts it as the price of one path.
- **Trace reading.** A person or a script that asks about a trace needs a
  credential, and the answer is model-written. Scripts that parse the JSON of
  `overview` or `stats` today lose that output. The kept commands still give
  structured output: `runs`, `find`, `cost`, `download`, and `assert --query`.
  A trace with a scanner finding cannot be asked about through the CLI. The
  citation and number gates and S23 bound the answer.
- **Fix coverage.** `gemba-wiki fix` no longer rewords, and `jidoka fix` only
  moves text, so a breach that needs a cut, which most of the cited trim work
  was, still goes to a person.
- **Prerequisites.** The secret scanner becomes a prerequisite on every host
  that runs the nine commands, and a host that runs the gear binaries needs the
  agent runtime on its path. Each of these and the credential is a setup step
  that the Kata job weighs against direct prompting.
- **Install weight.** An npm install of `jidoka` now pulls the agent runtime,
  about 224 MB on darwin-arm64, for every check user, and a cold `npx` run
  downloads it first. That weighs on the Jidoka Little Hire, a single check
  before commit, and on its Anxiety about slowing every commit. The checks
  themselves keep their output (S48).
- **Vendor coupling.** The credential ties a team closer to one vendor's
  runtime, which is the Anxiety the Gemba job names.
- **Autonomy.** The Kata job's Anxiety is that "autonomy might amplify bad
  patterns faster than humans can intervene". The embedded agents act on
  memory with no person in the loop. The gates bound each write, and every
  agent decision lands in `facts` or the weekly log where a person can read
  it.

The Fired When conditions are: the platform's loop constrains a team more than
the plumbing it replaced (Gemba), the loop becomes harder to operate than
direct prompting (Kata), and the checks block more work than the drift they
catch (Jidoka). The spec judges that the change stays short of all three. The
Gemba and Kata callers lose the judgment that the problem table counts, the
price above is bounded per call except during a model outage, and the setup
steps are one-time. The Jidoka checks block no more work than today, because
they stay as they are.

## Success criteria

"A test" means a test under `bun run test` with a scripted agent. Criteria
marked *live* need a model credential, and they run in the plan's acceptance
step. Criteria marked *post-merge* run after the second merge.

| # | Claim | Verification |
| --- | --- | --- |
| S1 | The removed subcommands and options are gone. | The `--help` output of `gemba-wiki log`, `inbox`, `memo`, `claim`, and `release`, of `gemba-xmr record`, and of `gemba-trace` names no subcommand or option that § C removes. |
| S2 | `gemba-trace` offers `ask` and the seven kept commands only. | `gemba-trace --help --json` lists exactly `ask`, `runs`, `find`, `download`, `split`, `cost`, `assert`, and `by-discussion`. |
| S3 | No caller names a removed form. *Post-merge.* | `rg` over `.claude`, `.github`, `scripts`, `websites`, `benchmarks`, the root documents, `justfile`, and `package.json` for each removed subcommand and option, written with its command, and for `FIT_WIKI_SCANNER_ABSENT_OK`, returns nothing outside `specs/` and the changelogs, and the same search over `libraries` and `products` matches only the removed-form messages of § A16 and their tests. |
| S4 | Every call that reaches the job runs the agent. | On a host with the scanner and no model credential, in a temporary repository with a clean wiki and a reachable remote, a recorded trace, a skill with a metrics reference, and a planted instruction finding, each of the nine commands with its JSON switch prints `outcome` `failed` and a `reason` that names the credential. |
| S5 | The result object has one shape. | For each of the nine commands, the JSON switch prints one object with exactly the keys `command`, `outcome`, `reason`, `facts`, `pending`, and `next`. |
| S6 | Each outcome keeps its exit code. | Tests reach every outcome that each command's § B row and § A2 and § A7 allow, and assert the code in § A7. |
| S7 | A removed form names its replacement. | For each removed subcommand and option, a call exits 2 with a message that names the new form, and `gemba-wiki log --agent <a> "done"` is taken as free text. |
| S8 | `push` merges a two-session prose conflict. *Live.* | Two clones each add a different bullet to one section of one summary, and each runs `gemba-wiki push`, and both exit 0 with both bullets in the remote file. |
| S9 | `push` refuses a merge that loses, invents, or marks a line. | Tests whose agent, in every round, drops one side's line, adds a line that no version holds, or leaves a conflict marker end in `needs-human`, with the remote tip unchanged. |
| S10 | `push` stops on a line both sides changed. | A test where both sides edit one base line differently ends in `needs-human` with the line in `pending`. |
| S11 | `push` leaves the clone in line with the remote. | After a test push that merges a peer's change, `git status` in the wiki clone shows no change, and a second push ends in `noop`. |
| S12 | `log` writes only the caller's words. | A test whose agent writes a rationale that the text does not hold, in every round, ends in `needs-human` and writes nothing. |
| S13 | `inbox` leaves no memo untracked. | After a test of `gemba-wiki inbox --agent <a>` on an inbox of three memos, each memo has a weekly-log line with its disposition and reason. |
| S14 | The curator can act on one memo. | A test of `gemba-wiki inbox --agent <a> "promote the memo about <topic>, keep the rest"` promotes one memo, keeps the others, and ends in `done`. |
| S15 | `memo` writes only to roster members. | Tests whose agent, in every round, names an unknown recipient, the sender, or nobody end in `needs-human` and write no file. |
| S16 | Opening names fix the recipients. | Tests show that `"Hello <Title Case of b>, <Title Case of c>: …"` and `"Hi <b> and <c>, …"` go to `b` and `c`, that `"Hello <b>, please …"` goes to `b`, that `"everyone: …"` goes to every agent but the sender, and that an agent that adds `d`, in every round, ends the call in `needs-human`. |
| S17 | `claim` refuses the same id. | With another agent's unexpired claim on `spec-<n>`, a test of `claim --agent <b> "Spec <n>"` ends in `blocked`, and `facts` names the holder. |
| S18 | An overlap the agent confirms goes to a person. | With another agent's unexpired claim whose row carries pull request `#<n>`, a test of `claim --agent <b> "spec <m> PR #<n>"` whose agent confirms the overlap ends in `needs-human` and writes no row. |
| S19 | Claim text parses one way. | Tests show that `"Spec 2410 review on branch feat-x for 3 days"` yields id `spec-2410-review`, branch `feat-x`, and three days, that `"spec 2410 part 1"` yields `spec-2410/01`, that `"PR #12 merge"` yields `pr-12-merge`, and that `"#12"`, `"for 9 days"`, and `"on branch x"` exit 2. |
| S20 | `claim` and `release` round-trip. | After a test of `claim --agent <a> "Spec <n> part 1"`, `release --agent <a> "spec <n> part 1"` removes the row. |
| S21 | Claims from one branch do not collide. | A test where two agents claim different work from `main` lands both rows. |
| S22 | A local claim is checked when a push carries it. | A test where `claim` writes a row locally and fails to publish, and a peer then publishes the same id, ends the next `push` with that row dropped and the claim in `pending`. |
| S23 | `ask` answers trace questions correctly. *Live.* | On a recorded trace, five runs of `gemba-trace ask`, each with all five questions, answer the turn count, the error count, the call count of one tool, the text of one turn, and the run cost with the values that the kept `cost` command and the trace file give. |
| S24 | `ask` answers only with checked citations and numbers. | Tests whose agent, in every round, gives no citation, cites a turn that does not hold the quote, or states a number that no tool result holds, end in `needs-human`. |
| S25 | `record` invents nothing. | Tests whose agent, in every round, returns a value absent from the text, an unknown metric, a note that is no span of the text, or a route the text does not name, append no row and end in `needs-human`. |
| S26 | `record` writes a valid row. *Live.* | `gemba-xmr record --skill <s> "<text>"` appends a row that `gemba-xmr validate` accepts. |
| S27 | `product-mix` still records its row. | `gemba-wiki product-mix` with no model credential appends its row, and `gemba-xmr validate` accepts it. |
| S28 | `jidoka fix` moves text and loses none. *Live.* | On a planted over-cap skill, `jidoka fix` then `jidoka instructions` both exit 0, each removed sentence is in a file that its source layer links to, and every relative link outside code in the edited files resolves. |
| S29 | A fix keeps its good work. | A test with two findings in two files, where the agent fixes one and its edit for the other drops a sentence from every file, keeps the first fix, restores the second file, and ends in `needs-human`. |
| S30 | The fix commands add no new content. | Tests whose agent, in every round, adds a sentence to an instruction layer or a line to the wiki that no file held before end in `needs-human` and restore the file. |
| S31 | `gemba-wiki fix` loses no memory and keeps its rule fixes. | A test whose agent deletes lines that appear in no other wiki file ends in `needs-human`, and tests of a duplicate metrics row, a split `### Decision` line, and a reshaped H1 end in `done`. |
| S32 | An editor never writes outside its files. | A test whose editor attempts a write outside its files leaves that file unchanged. |
| S33 | The fix commands need no agent profiles. | In a repository with no `.claude/agents` directory, tests of `jidoka fix` and `gemba-wiki fix` whose agent fixes a planted finding end in `done`. |
| S34 | Secrets never reach the model. | With a planted secret in the wiki diff, in the caller's text, in a trace, and in a file an editor reads, tests of `push`, `log`, `ask`, and `jidoka fix` each end in `blocked`, the scripted agent never receives the secret, and the editor's files are unchanged. |
| S35 | An override is recorded with its model exposure. | A test of `gemba-wiki log` with an audited override of a planted finding ends in `done`, and the override record names the model provider. |
| S36 | A missing scanner fails the call. | On a host with no scanner, `gemba-wiki log --agent <a> "<text>"` ends in `failed` with a reason that names the scanner. |
| S37 | The agent loads no host hooks, settings, skills, memory, or servers. *Live.* | In a repository whose project settings carry a Stop hook that writes a marker file, a project skill, a project memory file, and a project MCP server, `gemba-wiki push` leaves no marker, and the run's trace lists none of the others. |
| S38 | The output hides the agent's own run. | The default and JSON outputs of each command name no model or cost of the run, and `--verbose` writes both, and the trace path, to stderr. |
| S39 | A mid-merge tree no longer reports success. | On a wiki with a merge in progress, `gemba-wiki push` exits 4. |
| S40 | A run that hits a time limit fails cleanly. | A test of `push` whose agent never answers ends in `failed` within 60 seconds, and the local commit stays, and tests of `ask` and `jidoka fix` end in `failed` within 120 and 180 seconds. |
| S41 | An interrupted publish leaves a clean wiki. | A test that kills `push` during each step, then runs `gemba-wiki boot`, leaves no merge or rebase in progress, the remote at its old tip or the new commit, and `git status` with only the session's own work. |
| S42 | Two publishes in one clone do not collide. | A test that starts a second `push` while one is in flight ends with the first landed and the second in `failed`, and a test with a lock left by a killed push lands the next push. |
| S43 | The Stop hook blocks once. | With a stubbed `push`, the Stop-hook mode exits 2 on stub exits 4 and 5, exits 0 when the hook's retry flag is set, exits 0 on every other stub exit, and returns at once when stdin is a terminal, and `.claude/settings.json` calls that mode. |
| S44 | No `next` sentence is unsafe. | A test over every `next` sentence finds none that tells the caller to pop, apply, or drop a stash, or to declare a removal, and every one passes the imperative audit that #2063 cites. |
| S45 | A push run stays cheap. *Live.* | The cost that `gemba-wiki push --verbose` reports for a one-file push is below 5 US cents. |
| S46 | An empty push stays quick and cheap. *Live.* | `gemba-wiki push --verbose` with nothing outgoing reports an agent time below 15 seconds and a cost below 1 US cent. |
| S47 | The roster rule refuses an unknown agent. | `gemba-wiki log --agent <not-on-roster> "<text>"` exits 2 and writes nothing. |
| S48 | The checks stay as they are. | `jidoka instructions`, `jidoka invariants`, and `jidoka jtbd` give the same output on a fixed fixture repository before and after the change. |
| S49 | The action push holds a credential. | `rg -B2 -A8 'gemba-wiki' products/*/actions .github/workflows` shows an `anthropic-api-key` input on every step that runs an agent-backed `gemba-wiki` command, and `products/gemba/actions/gemba-wiki/action.yml` declares that input. |
| S50 | The setup changelog moves installations. *Post-merge.* | `rg -n 'anthropic-api-key' .claude/skills/kata-setup/references/changelog.md` finds the credential entry, the same file holds the pack-and-action entry, and `rg -n 'push --stop-hook' .claude/skills/kata-setup/references` finds the hooks line. |
| S51 | The CLIs ship before the instructions. *Post-merge.* | `git merge-base --is-ancestor` passes for the gear release tag and for each repin commit that the release issue lists, against the second merge. |
| S52 | The instruction layers stay within their caps. *Post-merge.* | `jidoka` passes. |

## Relation to open specs and issues

| Item | Relation |
| --- | --- |
| 2370 | Its open parts (the release train that repins the agent workflows, the product-mix flag, and the history rewrite) land first. This spec keeps the event-type rule and `--event-type`, and it rebases its release chain and the product-mix seam onto them. |
| 2380 | It gives each facilitated participant its own workspace. Until it lands, a participant's push that meets another in flight fails at once, and its work waits for the next push. Both specs edit the `gemba-wiki` skill and the wiki pages, and the later merge rebases. |
| 2390 | It lands first. Its declared-removal option stays a `push` input, its ledger-row conflict rule holds, and it answers #2077 and #2218. Its `kata-setup` changelog takes this spec's two entries. |
| 2400 | It lands first. `memo` and the roster rule read its roster. Its S8 check names `memo --to all`, which this spec replaces with a message that opens with `everyone` (S16). Its hooks reference takes the Stop-hook mode. |
| #2069, #2076 | A mechanical fix can close these P0s before this spec lands. S39 then guards the result. |
| #2059, #2063 | The `next` sentences replace the refusal remedies those issues cite (S44). |
| bionova-apps-v2#259, bionova-apps-v2#497 | The `inbox` gates and the roster rule close them (S13, S47). |
