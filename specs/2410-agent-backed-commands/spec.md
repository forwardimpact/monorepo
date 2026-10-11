# Spec 2410: Agent-backed commands take a plain command line, and a small embedded agent makes the judgment calls

**Classification:** product. It lands on the published `gemba-wiki`,
`gemba-trace`, `gemba-xmr`, and `jidoka` CLIs, on the libraries behind them, on
the `gemba-wiki`, `kata-agent`, and `kata-interview` composite actions, on the
`gemba-*`, `kata-*`, and `jidoka-*` skills, and on the `www.gemba.team` and
`www.jidoka.team` pages
([team protocol § Classify Every Finding](../../.claude/agents/x-team-protocol.md#classify-every-finding)).

**Persona and job:** Teams Using Agents. The primary job is Gemba's
[Stand Up and Operate an Agent Team](../../JTBD.md#teams-using-agents-stand-up-and-operate-an-agent-team).
Its Little Hire is "run one agent session, read one trace, or chart one metric
with a single command from the platform's family". It is fired when "the
platform's loop constrains a team more than the plumbing it replaced". `jidoka
fix` serves the Big Hire of Jidoka's
[Build Quality Into Agent Instructions](../../JTBD.md#teams-using-agents-build-quality-into-agent-instructions):
keep one layered instruction architecture. The checks stay the Little Hire.
§ Compatibility states the price of the change against both jobs' Anxiety.

## Problem

Agents are the main callers of these commands. The skills and agent profiles
call them on 62 lines in 18 files
(`rg -c 'gemba-wiki (push|log|inbox|memo|claim|fix)|gemba-trace [a-z]|gemba-xmr record|jidoka (instructions|fix)' .claude/skills .claude/agents`),
and the Stop hook runs `push` each time a session agent ends a turn. Each
command below carries a judgment call that the caller must make before the
command runs, or after the command refuses. The caller makes it with flags,
indexes, and reason codes.

### The flag surfaces carry the caller's judgment

| Command | Surface today | The judgment the caller carries |
| --- | --- | --- |
| `gemba-wiki push` | One fixed commit message for every push. A rebase conflict on a prose file fails with `conflict`, and the caller resolves it by hand. The command can end with more than a dozen distinct failure and refusal reasons. | Merge two sessions' prose. Read the reason code and pick the next step. |
| `gemba-wiki log` | Three subcommands and nine options. A decision entry takes four separate fields. | Classify the entry. Split the text into fields. |
| `gemba-wiki inbox` | Four subcommands. Each action takes a 0-based `--index`, and the indexes shift after each removal. Ack and drop both delete the memo and record nothing. | Decide each memo's fate. Track the shifted indexes. |
| `gemba-wiki memo` | `--from`, `--to`, and `--message`. | Pick the recipient. |
| `gemba-wiki claim` | Seven options. It refuses only the caller's own duplicate. The team protocol has the caller check the other agents' claims by hand first. | Spot another agent's claim on the same work, under the same id or another one. |
| `gemba-trace` | 26 subcommands. The spec keeps seven that locate, split, cost, and assert, and treats the other nineteen as queries. | Pick and chain the queries that answer one question. |
| `gemba-xmr record` | Eleven options. A route-bearing metric needs `--route` and takes `--routes-eligible`. | Map a run's outcome to a declared metric, its value, and the route ids. |
| `jidoka instructions` | Reports a length breach. No command fixes it. | Move text and lose no content. |

### The callers pay for it

| Command | What happened | Record |
| --- | --- | --- |
| `push` | A mid-merge refusal printed "nothing to push" at exit 0. One agent's residue conflict then blocked the Stop-hook push of every peer. | #2069, #2076 |
| `push` | Nine of fifteen refusal strings fail the imperative audit. The residue-conflict text tells the operator to pop another agent's stash. | #2063, #2059 |
| `push` | Nine specs patched the publish path between June and September: 1750, 1780, 1890, 1900, 1920, 1960, 1970, 2010, and 2030. One release-engineer run needed five rebases to land a one-line fix. | The specs; the release-engineer log of week 24 |
| `log` | A typo in `--agent` creates a log for an agent that does not exist. | bionova-apps-v2#497 |
| `claim` | An agent invented a `--ttl` option. Two agents held the same target. On 2026-10-11 the claims ledger holds 44 rows, all expired, with targets in six syntaxes. Three specs carry two claims each under two ids. | #1490, #1539, the claims ledger |
| `inbox` | Ack and drop destroy mail, and no action writes to the weekly log. | bionova-apps-v2#259 |
| `gemba-trace` | An analyst fell back to raw grep for seven of ten gaps, and two studies took about 45 calls and 15 script wrappers. Specs 0570 and 1220 answered with seven more subcommands. In July the trace options still used three names for one trace file. | #408, #996, the devex-engineer log of week 29 |
| `gemba-xmr record` | No row carried the route context the metric needed, so spec 1590 added two more options. | #1467, spec 1590 |
| `jidoka instructions` | Main went red on nine cap breaches in seven weeks. Two trim pull requests were closed as superseded. About twenty trim-to-cap commits landed in the same weeks. | #610 to #1781, PRs #763 and #911 |

Two of the agent's judgments have no incident behind them: the `memo`
recipient and the `push` commit body. They follow from the one-path rule
below. Every call runs the agent, so each command needs a judgment on every
call.

### One command already works the other way

`gemba-wiki fix` runs an embedded agent on the prose-judgment findings of the
wiki audit. It audits again after each round, and the audit decides the
result. It flags what the agent cannot fix. The caller types one command and
makes no judgment call. The loop lives inside that one command, and it returns
text only. No other command can reuse it.

## Proposal

Each command in scope becomes an agent-backed command. A caller uses it like
any other CLI command. Inside, a small agent with a narrow scope makes the
judgment call, and deterministic checks decide whether the work stands.

### A: The contract every agent-backed command keeps

1. **A plain command line in.** The caller passes arguments and options. A
   command that needs the caller's words takes them as one free-text argument.
   The caller never writes a prompt, passes a schema, or sees the agent. The
   identity options stay: `--agent` and `--from` (spec 1740), and on `record`
   `--skill` with its `LIBHARNESS_SKILL` fallback, `--run`, and `--event-type`
   (spec 2370).
2. **One path.** No option, mode, or environment setting skips the agent, and
   no second command does the same job without it. Every call runs the agent,
   including a call with nothing to judge, unless the command refuses the input
   first. It refuses the input on a usage error, on an agent name that a
   non-empty roster lacks (a usage error), when the wiki tree is absent
   (`noop`, as today), when the wiki is mid-merge or mid-rebase
   (`needs-human`), and when the agent's input holds a secret (`blocked`).
   Library writers stay available to code that computes its own values, such
   as `product-mix`.
3. **The gates decide.** Deterministic checks accept or refuse each proposal
   and each edit. A proposal that leaves an item undecided fails the
   completeness gate. No gate exemption keys on text that the agent wrote.
4. **The command writes.** The agent proposes, and the command writes, except
   in the two fix commands. There the agent edits only the files the command
   names for it. Its edits stay only when the gates accept every one of them.
   Otherwise every file returns to its content before the call. A `failed`
   push keeps the session's local commit for the next push.
5. **Secrets stay local.** Every text the agent receives passes the secret
   scan first: the task, each file it reads, and each tool result. An
   operator's audited override of a finding lets that text through, as it lets
   the text publish today. No setting lets unscanned text through. A finding
   ends the call in `blocked`. A missing scanner ends it in `needs-human`.
6. **The agent runs alone.** The embedded agent loads none of the host's hooks,
   settings, or skills.
7. **Five outcomes.** When several apply, the first in this order wins:
   `blocked`, `needs-human`, `failed`.

   | Outcome | Meaning | Exit code |
   | --- | --- | --- |
   | `done` | The gates accepted the work, and the command wrote or published it. | 0 |
   | `noop` | The command had nothing to write. | 0 |
   | `failed` | No verdict yet, and a retry can succeed: credentials, a model error, a time limit, the network, or proposals that still failed a gate after three rounds. The local work stays. | 3 |
   | `needs-human` | A person must decide or act first: the agent declined an item, both sides changed one line, or the input needs a fact the agent cannot supply. | 4 |
   | `blocked` | A rule refuses the work until the state it reads changes: a secret, another agent's claim, unrelated history, or a write outside the agent's files. | 5 |

   A usage error keeps exit code 2, and an unexpected error keeps exit code 1.
8. **Text by default, a result object on request.** `--format json` (a new
   option on the six `gemba-wiki` commands, the global option on `gemba-trace`
   and `gemba-xmr`) and `--json` on `jidoka` print one object with six fields:
   `command`, `outcome`, `reason`, `facts`, `pending`, and `next`. `facts`
   holds what the command wrote or found. `pending` lists each item that needs
   a human, with its location when it has one and its reason. `next` names one
   action that is safe to take.
9. **The agent stays out of the output.** The output names no model or cost of
   the command's own run. `--verbose` writes them and the path of the run's
   trace file to stderr.
10. **Failures are named.** A missing credential, a model error, and the time
    limit each end the call in `failed` with a reason that names the cause. A
    model credential is any credential the Claude Code runtime accepts: an API
    key, an OAuth token, or a local login. Each step of an agent run has a time
    limit of 30 seconds.
11. **The command carries its own agent.** No command reads an agent profile to
    learn its task. `memo` reads the profiles as data, to route.
12. **One loop.** Every agent-backed command runs on one shared agent loop.
    `gemba-wiki fix` moves onto it.
13. **The Stop hook.** This repository's Stop hook blocks the stop once on
    `needs-human` and `blocked`, so the session agent reads `next`. It does
    not block again when the stop is already a retry from that hook, and it
    never blocks on `failed`. Its timeout is 120 seconds.

### B: The commands

| Command line | The agent judges | The gates | `facts` |
| --- | --- | --- | --- |
| `gemba-wiki push` | The commit body. The subject stays the command's. On a conflict, a merge of each conflicted file. | A base line that one side changed keeps that change. A base line that both sides changed differently stops the call in `needs-human`. Insertions from both sides at one place both stay. No merged line is absent from all three versions. No conflict marker. The secret scan, the ancestry guard, the conservation guard, and the budget gate. | The commit, the files, and each merged file. |
| `gemba-wiki log --agent <name> "<text>"` | The entry type (decision, note, or done), and the split of the text into fields. | Each field is a span of the caller's text. The entry passes the weekly-log rules. | The entry as written. |
| `gemba-wiki inbox --agent <name>` | One disposition per memo: ack, promote with an owner, or drop. It reads the agent's summary, priorities, and claims. | Each memo gets one disposition. A promoted memo's owner is on the roster, and the memo appears in the priorities. The weekly log records each ack and drop with its reason. | Each memo with its disposition and reason. |
| `gemba-wiki memo --from <name> "<message>"` | The recipients: the agents the message addresses, every other agent when it addresses everyone, else the agents whose profile descriptions match its topic. | At least one recipient. Each recipient is on the roster. The sender is never a recipient. | The recipients. |
| `gemba-wiki claim --agent <name> "<target>"` | The target id in the claim grammar. Any unexpired claim by another agent on the same work under another id. The duration, when the text names one. | The id matches the grammar. Another agent's unexpired claim on the same id refuses the call, on the local claims and again on the remote tip that the publish fetches. A refusal on the tip drops the local row. A claim the agent names as overlapping exists. | The claim row, or the overlapping claim and its holder. |
| `gemba-trace ask --file <trace>… "<question>"` | The answer. It reads the traces with read-only trace tools, which include the multi-trace totals. | Each citation names a turn that exists and quotes text that the turn holds. Each number in the answer appears in a trace-tool result of the same run. | The answer and its citations. |
| `gemba-xmr record --skill <skill> "<text>"` | The metric, the value, the route and the eligible routes, and the note. | The metric is declared in the skill's metrics reference, present in its file, or named in the text as written. The value appears in the text. Each route id is one that the text names by id or label. The unit comes from the metrics reference, else from the metric's earlier rows, else `count`. The row passes the file schema and the route-decision check. | The row as appended and its one-line XmR summary. |
| `jidoka fix` | Moves text to clear the findings of `jidoka instructions`. | The agent edits instruction layers only. The instruction check passes. Every relative link in an edited file resolves. Every removed sentence appears in another file after the edit. | Each finding fixed, each move, and each finding left. |
| `gemba-wiki fix` | The prose-judgment fixes it makes today. | The audit. The agent edits wiki files only. | Each finding fixed and each finding left. |

The claim grammar holds four forms: `spec-<n>`, `pr-<n>`, `issue-<n>`, and a
lowercase slug of words and dashes. The claim row's branch is the current
branch of the project checkout. Its pull request is the open pull request for
that branch when GitHub answers, and it is empty otherwise. A claim the caller
already holds ends in `noop` when the row is published, and the call publishes
it when the row is only local. `claim` and `release` publish their row through
the publish flow with their own row re-apply, and they run no push agent.
`release` matches `--target` through the claim grammar, and a release that
matches no claim exits 1. A fix run that leaves findings ends in `needs-human`
with the findings in `pending`. A `jidoka fix` cut that removes a sentence from
every file is a finding left for a person. `jidoka jtbd --fix` keeps its job.

### C: What leaves

| Surface | Replaced by |
| --- | --- |
| The `log` subcommands (`decision`, `note`, `done`) and the `--surveyed`, `--chosen`, `--rationale`, `--alternatives`, `--field`, and `--body` options | The free-text argument |
| The `inbox` subcommands (`list`, `ack`, `promote`, `drop`) and the `--index` and `--owner` options | One `inbox` call |
| The `memo` options `--to` and `--message` | The free-text argument |
| The `claim` options `--target`, `--branch`, `--pr`, and `--expires-at` | The free-text argument and what the command can find |
| The `gemba-trace` query subcommands: `overview`, `count`, `batch`, `head`, `tail`, `search`, `tools`, `tool`, `tool-calls`, `commands`, `paths`, `compare`, `errors`, `reasoning`, `timeline`, `stats`, `init`, `turn`, and `filter` | `ask` |
| The `gemba-xmr record` options `--metric`, `--value`, `--unit`, `--note`, `--route`, and `--routes-eligible` | The free-text argument and the metrics reference |
| The private agent loop of `gemba-wiki fix`, its exits that skip the agent, its use of the technical-writer profile, and its text-only result | The shared loop, the command's own agent, and the result contract |
| `product-mix`'s call to the `record` command | A row writer in the library, which `record` shares |
| The `FIT_WIKI_SCANNER_ABSENT_OK` override | A scanner on every host that runs these commands |

## Scope

| In | Out |
| --- | --- |
| The nine commands in § B, their help and examples, and their tests | `gemba-wiki pull`. Its conflict message points the caller to `push`. |
| The shared agent loop, the result contract, the secret scan of agent input, and the time limit | `gemba-wiki audit`, `rotate`, `refresh`, `boot`, `curate`, `ledger`, `init`, and the scaffold of spec 2400 |
| `release`'s target matching and its exit on no match. `product-mix`'s row write. | `release`'s other behaviour. `product-mix`'s computation. |
| The `gemba-trace` subcommand set | The `gemba-trace` locators and pipeline commands: `runs`, `find`, `download`, `split`, `cost`, `assert`, and `by-discussion` |
| The `gemba-xmr record` input | The `gemba-xmr` read commands and the event-type rule of spec 2370 |
| `jidoka fix` | The `jidoka` checks (`instructions`, `invariants`, and `jtbd`, with its `--fix`). They stay deterministic CI gates. |
| The `gemba-wiki` action's credential input, and every step that runs `push` through it | The `gemba-harness`, `gemba-benchmark`, `gemba-watchdog`, and `gemba-selfedit` CLIs |
| Every caller of a removed form: `.claude/skills`, `.claude/agents` (with the claim step of the team protocol), the composite actions and their READMEs, `.github`, `scripts`, the justfile, `package.json`, the library READMEs, the audit hints, and the CLI help examples | The result contract for commands without an agent. They keep their output. |
| The `gemba-wiki`, `gemba-trace`, `gemba-xmr`, `gemba-harness`, `jidoka-audit`, and `jidoka-layer` skills, and the gemba and jidoka pages that describe these commands | The issues on the conservation guard (#2077, #2218). Spec 2390's declared removal answers them. |
| This repository's Stop hook | The hooks reference that spec 2400 writes. It takes § A13 in that spec's update procedure. |

## Compatibility

Clean break. Every surface in § C goes, and every caller moves with it, in one
merge. The workspace CLIs and the instructions then change together. This
repository's CI runs the gear binaries that `FIT_GEAR_RELEASE` pins, so
between the merge and the repin its CI agents run the old binaries with the
new instructions. In that window their `log`, `inbox`, `memo`, `claim`, and
`record` calls fail as usage errors, and `push` keeps working. The release
engineer cuts the gear release and the repin as the next actions after the
merge. An installation takes the new packs and the new CLIs in one update.

The change has a price.

- **Credentials.** Each of the nine commands needs a model credential wherever
  it runs, and each call costs one model run.
- **Latency.** Claude Code fires the Stop hook each time a session agent ends a
  turn, so an interactive session waits for one push run per turn, bounded by
  § A10 and § A13.
- **Outages.** A model outage ends every push in `failed`. On an ephemeral
  runner, the unpushed memory then leaves with the runner.
- **Trace reading.** A person who reads a trace now needs a credential, and the
  answer is model-written. The citation and number gates bound it.
- **Prerequisites.** The secret scanner becomes a prerequisite on every host
  that runs the nine commands.
- **Install weight.** An npm install of `jidoka` now pulls the agent runtime,
  about 224 MB on darwin-arm64. The gear binary uses the `claude` executable on
  the path.
- **Vendor coupling.** The credential ties a team closer to one vendor's
  runtime, which is the Anxiety the Gemba job names. The `jidoka` checks stay
  deterministic CI gates, so the Jidoka job's Anxiety about "another gate that
  slows every commit" stays where it is, while its install grows.

## Success criteria

Criteria marked *live* need a model credential. All others run with a
scripted agent.

| # | Claim | Verification |
| --- | --- | --- |
| S1 | The removed subcommands and options are gone. | The `--help` output of `gemba-wiki log`, `inbox`, `memo`, and `claim`, and of `gemba-xmr record`, names no subcommand or option that § C removes. |
| S2 | `gemba-trace` offers `ask` and the seven kept commands only. | `gemba-trace --help --json` lists exactly `ask`, `runs`, `find`, `download`, `split`, `cost`, `assert`, and `by-discussion`. |
| S3 | No caller names a removed form. | A search over `.claude`, `.github`, `libraries`, `products`, `scripts`, `websites`, `justfile`, and `package.json`, with one pattern per removed form that names its command (for example `gemba-wiki log (decision\|note\|done)`), returns nothing outside `specs/` and the changelogs. |
| S4 | Every call that reaches the job runs the agent. | In a temporary repository with a clean wiki, a recorded trace, a skill with a metrics reference, a planted instruction finding, and no model credential, each of the nine commands with its JSON switch prints `outcome` `failed` and a `reason` that names the credential. |
| S5 | The result object has one shape. | For each of the nine commands, the JSON switch prints one object with exactly the keys `command`, `outcome`, `reason`, `facts`, `pending`, and `next`. |
| S6 | Each outcome keeps its exit code. | The command tests reach every outcome that each command can reach and assert the code in § A7. |
| S7 | `push` merges a two-session prose conflict. *Live.* | Two clones each add a different bullet to one section of one summary, and each runs `gemba-wiki push`. Both exit 0, and the remote file holds both bullets. |
| S8 | `push` refuses a merge that loses or invents a line. | A test whose agent drops one side's line in every round, and one whose agent adds a line that no version holds, end in `failed`, with the remote tip unchanged and no rebase in progress. |
| S9 | `log` writes only the caller's words. | A test whose agent writes a rationale that the text does not hold in every round ends in `failed` and writes nothing. |
| S10 | `inbox` leaves no memo untracked. | After `gemba-wiki inbox --agent <a>` on an inbox of three memos, the inbox is empty, and each memo appears in the priorities or in a weekly-log line with its reason. |
| S11 | `memo` writes only to roster members. | Tests whose agent names an unknown recipient, the sender, or nobody write no file. |
| S12 | A broadcast reaches every other agent. | A test of a message that addresses everyone delivers it to every roster member except the sender. |
| S13 | `claim` refuses the same work under another id. | With another agent's unexpired claim on a spec whose row carries pull request `#<n>`, a test of `claim --agent <b> "PR #<n>"` ends in `blocked`, and `facts` names the holder. |
| S14 | A claim refused on the remote tip leaves no row. | A test whose remote tip gains another agent's claim on the same id ends in `blocked`, and the local claims hold no row from the call. |
| S15 | `release` matches the claim grammar. | After `claim` writes `spec-<n>`, `gemba-wiki release --agent <a> --target "spec <n>"` removes the row, and a target that matches no claim exits 1. |
| S16 | The roster rule refuses an unknown agent. | `gemba-wiki log --agent <not-on-roster> "<text>"` exits 2 and writes nothing. |
| S17 | `ask` answers only with checked citations and numbers. | Tests whose agent cites a turn that does not hold the quote, or states a number that no tool result holds, in every round end in `failed`. |
| S18 | `ask` answers a real question. *Live.* | `gemba-trace ask` on a recorded trace exits 0 with at least one citation. |
| S19 | `record` invents nothing. | Tests whose agent returns a value absent from the text, an unknown metric, or a route the text does not name, in every round, append no row and end in `failed`. |
| S20 | `record` writes a valid row. *Live.* | `gemba-xmr record --skill <s> "<text>"` appends a row that `gemba-xmr validate` accepts. |
| S21 | `product-mix` still records its row. | `gemba-wiki product-mix` with no model credential appends its row, and `gemba-xmr validate` accepts it. |
| S22 | `jidoka fix` moves text and loses none. *Live.* | On a planted over-cap skill, `jidoka fix` then `jidoka instructions` both exit 0, each removed sentence is in another file, and every relative link in the edited files resolves. |
| S23 | A refused editor run leaves no change. | A test whose editor writes outside its files ends in `blocked`, a test whose editor removes a sentence from every file ends in `failed`, and in both every file matches its content before the call. |
| S24 | Secrets never reach the model. | With a planted secret in the wiki diff, in the caller's text, and in a trace, `push`, `log`, and `ask` each end in `blocked`, and the scripted agent receives no call. |
| S25 | The agent loads no host hooks, settings, or skills. *Live.* | In a repository whose project settings carry a Stop hook that writes a marker file and a project skill, `gemba-wiki push` leaves no marker, and the run's trace lists no project skill. |
| S26 | The commands need no agent profiles. | In a repository with no `.claude/agents` directory, `jidoka fix` and `gemba-wiki fix` end in `done` on a planted finding. |
| S27 | One loop serves every command. | No package behind the nine commands outside the agent runtime imports the Agent SDK: `rg -l '@anthropic-ai/claude-agent-sdk' libraries/libcli libraries/libwiki libraries/libxmr libraries/libinvariant products/gemba/bin products/jidoka/bin` returns nothing. |
| S28 | The output hides the agent's own run. | The default and JSON outputs of each command name no model or cost of the run, and `--verbose` writes both, and the trace path, to stderr. |
| S29 | A mid-merge tree no longer reports success. | On a wiki with a merge in progress, `gemba-wiki push` exits 4. |
| S30 | A run that hits the time limit fails cleanly. | A test whose agent never answers ends in `failed` within the limit, and the local commit stays. |
| S31 | The Stop hook blocks once. | Run with a stubbed `push` that exits 4, the hook command exits 2, and run again with the hook's retry flag set, it exits 0. With a stub that exits 3 it exits 0. |
| S32 | No `next` sentence is unsafe. | A test over every `next` sentence finds none that tells the caller to pop, apply, or drop a stash, or to declare a removal. |
| S33 | The CI memory push holds a credential. | The `gemba-wiki` action declares an `anthropic-api-key` input, and every step that runs `push` through the action passes it. |
| S34 | The repin follows the merge. | This repository's repin of `FIT_GEAR_RELEASE` to the gear release that ships the change lands within one day of the change's merge. |
| S35 | The instruction layers stay within their caps. | `jidoka` passes. |

## Relation to open specs and issues

| Item | Relation |
| --- | --- |
| 2370 | Its record and read changes landed. This spec keeps its event-type rule and the `--event-type` option. Both specs edit the `gemba-xmr` skill and the gemba pages, and the later merge rebases. |
| 2390 | It lands first. Its declared-removal option stays a `push` input, and it answers #2077 and #2218. |
| 2400 | It lands first. `memo` and the roster rule read its roster. Its S8 check names `memo --to all`, which this spec replaces with a message that addresses everyone (S12). |
| 2380 | Independent. Both specs edit the `gemba-wiki` skill and the wiki pages, and the later merge rebases. |
| #2069, #2076 | A mechanical fix can close these P0s before this spec lands. S29 then guards the result. |
| #2059, #2063 | The `next` sentences replace the refusal remedies those issues cite (S32). |
| bionova-apps-v2#259, #497 | The `inbox` gates and the roster rule close them (S10, S16). |
