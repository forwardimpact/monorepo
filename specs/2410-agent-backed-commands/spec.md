# Spec 2410: Agent-backed commands take a plain command line, and a small embedded agent makes the judgment calls

**Classification:** product. It lands on the published `gemba-wiki`,
`gemba-trace`, `gemba-xmr`, and `jidoka` CLIs, on the libraries behind them, on
the `gemba-wiki`, `gemba-bootstrap`, `kata-agent`, and `kata-interview`
composite actions, on the `gemba-*`, `kata-*`, and `jidoka-*` skills, and on the
`www.gemba.team` and `www.jidoka.team` pages
([team protocol § Classify Every Finding](../../.claude/agents/x-team-protocol.md#classify-every-finding)).

**Persona and job:** Teams Using Agents. The primary job is Gemba's
[Stand Up and Operate an Agent Team](../../JTBD.md#teams-using-agents-stand-up-and-operate-an-agent-team).
Its Little Hire is "run one agent session, read one trace, or chart one metric
with a single command from the platform's family". It is fired when "the
platform's loop constrains a team more than the plumbing it replaced". Kata
agents are the main callers, so the change also serves Kata's
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team),
whose Anxiety is that "autonomy might amplify bad patterns faster than humans
can intervene". `jidoka fix` serves the Big Hire of Jidoka's
[Build Quality Into Agent Instructions](../../JTBD.md#teams-using-agents-build-quality-into-agent-instructions):
keep one layered instruction architecture. The checks stay the Little Hire.
§ Compatibility weighs the price against these jobs.

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
| `claim` | An agent invented a `--ttl` option. Two agents held the same target. On 2026-10-11 the claims ledger holds 44 rows, all expired, with targets in more than ten syntaxes. Four specs carry two claims each under two ids. | #1490, #1539, the claims ledger |
| `inbox` | Ack and drop destroy mail, and no action writes to the weekly log. | bionova-apps-v2#259 |
| `gemba-trace` | An analyst fell back to raw grep for seven of ten gaps, and two studies took about 45 calls and 15 script wrappers. Specs 0570 and 1220 answered with seven more subcommands. In July the trace options still used three names for one trace file. | #408, #996, the devex-engineer log of week 29 |
| `gemba-xmr record` | No row carried the route context the metric needed, so spec 1590 added two more options. | #1467, spec 1590 |
| `jidoka instructions` | Main went red on nine cap breaches in seven weeks. Two trim pull requests were closed as superseded. About twenty trim-to-cap commits landed in the same weeks. | #610 to #1781, PRs #763 and #911 |

Two of the agent's judgments have no incident behind them: the `memo`
recipient and the `push` commit body. They follow from the rules below. The
caller passes plain words, and every call runs the agent, so each command
needs a judgment on every call.

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
   `--skill` with its `LIBHARNESS_SKILL` fallback, `--run`, and `--event-type`.
2. **One path.** No option, mode, or environment setting skips the agent, and
   no second command does the same job without it. Every call runs the agent,
   including a call with nothing to judge, unless the command refuses the input
   first. It refuses the input on a usage error or an agent name that a
   non-empty roster lacks (both usage errors), when a wiki command finds no
   wiki tree (`noop`, as today), when the wiki is mid-merge, mid-rebase, or on
   a detached head (`needs-human`), when its history is unrelated to its
   remote (`blocked`), when the remote cannot be reached (`failed`), and when
   the agent's input holds a secret (`blocked`). Library writers stay
   available to code that computes its own values, such as `product-mix`.
3. **The gates decide.** Deterministic checks accept or refuse each proposal
   and each edit. A proposal that leaves an item undecided fails the
   completeness gate. No gate exemption keys on text that the agent wrote.
4. **The command writes.** The agent proposes, and the command writes, except
   in the two fix commands. There the agent edits only the files the command
   names for it, and each fix is gated by itself: it stays when its finding is
   gone, no new finding appears, and the content gates hold. A refused fix
   returns its files to their content before the agent's first edit. A
   `failed` call keeps the work it had before the agent ran, such as a push's
   local commit.
5. **Secrets stay local.** Every text the agent receives passes the secret
   scan first: the task, the traces it is given, each file it reads, and each
   tool result. For wiki text, an operator's audited override of a finding
   lets that text through, as it lets the text publish today. Other text has
   no override. No setting lets unscanned text through. A finding ends the
   call in `blocked`.
6. **The agent runs alone.** The embedded agent loads none of the host's hooks,
   settings, or skills.
7. **Five outcomes.** When several apply, the first in this order wins:
   `blocked`, `needs-human`, `failed`.

   | Outcome | Meaning | Exit code |
   | --- | --- | --- |
   | `done` | The gates accepted the work, and the command wrote, published, or answered it. | 0 |
   | `noop` | The command had nothing to write. | 0 |
   | `failed` | A cause outside the work stopped the call: no credential, no scanner, a model error, a time limit, the network, or a peer push that held the wiki too long. A retry can succeed once the cause clears. | 3 |
   | `needs-human` | The work needs a person: the agent left an item unresolved, its proposals still failed a gate after three rounds, both sides changed one line, or a fix left findings. | 4 |
   | `blocked` | A rule refuses the work until the state it reads changes: a secret, another agent's claim, or unrelated history. | 5 |

   A usage error keeps exit code 2, and an unexpected error keeps exit code 1.
8. **Text by default, a result object on request.** `--format json` (a new
   option on the six `gemba-wiki` commands, the global option on `gemba-trace`
   and `gemba-xmr`) and `--json` on `jidoka` print one object with six fields:
   `command`, `outcome`, `reason`, `facts`, `pending`, and `next`. `facts`
   holds what the command wrote, found, or answered. `pending` lists each item
   that needs a human, with its location when it has one and its reason.
   `next` names one action that is safe to take.
9. **The agent stays out of the output.** The output names no model or cost of
   the command's own run. A new `--verbose` option on all nine commands writes
   them and the path of the run's trace file to stderr.
10. **Time and failures.** A step is one question to the agent with its up to
    three rounds. A proposer or reader step has 30 seconds, an editor run has
    180 seconds, and a `push` call spends at most 60 seconds in its agent. A
    missing credential, a missing scanner, a model error, and a time limit each
    end the call in `failed` with a reason that names the cause. A model
    credential is any credential the agent runtime accepts: an API key, an
    OAuth token, or a local login.
11. **The command carries its own agent.** No command reads an agent profile to
    learn its task. `memo` reads the profiles as data, to route.
12. **One loop.** Every agent-backed command runs on one shared agent loop.
    `gemba-wiki fix` moves onto it.
13. **The Stop hook.** This repository's Stop hook blocks the stop once on
    `needs-human` and `blocked`, so the session agent reads `next`. It does
    not block again when the stop is already a retry from that hook, and it
    never blocks on any other exit. Its timeout is 120 seconds.
14. **Safe interruption.** A `push` that its host stops at any point leaves the
    wiki with no merge or rebase in progress and the remote either at its old
    tip or at the new commit.
15. **One push at a time.** A push that meets another push in flight in the same
    wiki clone waits for it, and ends in `failed` when the wait passes its
    time limit.

### B: The commands

| Command line | The agent judges | The gates | `facts` |
| --- | --- | --- | --- |
| `gemba-wiki push` | The commit body. The subject stays the command's, and no gate reads the body. On a conflict, a merge of each conflicted file that git cannot merge by its own rules. | A base line that one side changed keeps that change. A base line that both sides changed differently stops the call in `needs-human`. Insertions from both sides at one place both stay. No merged line is absent from all three versions. No conflict marker. The secret scan, the ancestry guard, the conservation guard, and the budget gate. | The commit, the files, and each merged file. |
| `gemba-wiki log --agent <name> "<text>"` | The entry type (decision, note, or done), and the split of the text into fields. | Each field is a span of the caller's text. The entry passes the weekly-log rules. | The entry as written. |
| `gemba-wiki inbox --agent <name>` | One disposition per memo: ack, promote with an owner, drop, or unresolved. It reads the agent's summary, priorities, and claims. | Each memo gets one disposition. A promoted memo's owner is on the roster, and the memo appears in the priorities. The weekly log records each ack and drop with its reason. | Each memo with its disposition and reason. |
| `gemba-wiki memo --from <name> "<message>"` | The recipients: the agents the message addresses, every other agent when it addresses everyone, else the agents whose profile descriptions match its topic. | At least one recipient. Each recipient is on the roster. The sender is never a recipient. A message that begins with a roster name reaches that agent. | The recipients. |
| `gemba-wiki claim --agent <name> "<target>"` | The target id in the claim grammar, the branch when the text names one, the duration when the text names one, and any unexpired claim by another agent on the same work. | The id matches the grammar. Another agent's unexpired claim refuses the call when it has the same id, the same branch, or the same pull request, on the local claims and again on the remote tip that each publish fetches. A refusal on the tip drops the local row. A claim the agent names as overlapping exists. | The claim row, or the overlapping claim and its holder. |
| `gemba-trace ask --file <trace>… "<question>"` | The answer. It reads the traces with read-only trace tools, which include the multi-trace totals. | The answer holds at least one citation. Each citation names a turn that exists and quotes text that the turn holds. Each number in the answer appears in a trace-tool result of the same run. | The answer and its citations. |
| `gemba-xmr record --skill <skill> "<text>"` | The metric, the value, the route and the eligible routes, and the note. | The metric is declared in the skill's metrics reference, present in its file, or named in the text as written. The value appears in the text. Each route id is one that the text names by id or label. The unit comes from the metrics reference, else from the metric's earlier rows, else `count`. The row passes the file schema and the route-decision check. | The row as appended and its one-line XmR summary. |
| `jidoka fix` | Moves text to clear the findings of `jidoka instructions`. | The agent edits instruction layers only. Each fixed finding is gone, and no new finding appears. Every relative link in an edited file resolves. Every removed sentence appears in another file after the edit. | Each finding fixed, each move, and each finding left. |
| `gemba-wiki fix` | The prose-judgment fixes it makes today. | The agent edits wiki files only. Each fixed finding is gone, and no new audit finding appears. | Each finding fixed and each finding left. |

The claim grammar holds five forms: `spec-<n>`, `spec-<n>/<part>`, `pr-<n>`,
`issue-<n>`, and a lowercase slug of words and dashes. Code maps the common
spellings onto it: case and spaces fold (`Spec 2410` is `spec-2410`), `PR #<n>`
is `pr-<n>`, and `issue #<n>` is `issue-<n>`. A bare `#<n>` is a usage error.
`release` takes its target as the same free-text argument, maps it with the
same code, and runs no agent. Its other behaviour, including exit 0 on a
target that matches no claim, stays. The claim row's branch is the branch the
text names, else the current branch of the project checkout. When the text
names a pull request, the command reads that pull request's branch when GitHub
answers. A claim the caller already holds ends in `noop` when its row is
published, and the call publishes it when the row is only local. `claim` and
`release` run no push agent.

A fix run that leaves findings ends in `needs-human` with them in `pending`. A
finding that only a cut can clear is one the agent leaves. `jidoka jtbd --fix`
keeps its job.

### C: What leaves

| Surface | Replaced by |
| --- | --- |
| The `log` subcommands (`decision`, `note`, `done`) and the `--surveyed`, `--chosen`, `--rationale`, `--alternatives`, `--field`, and `--body` options | The free-text argument |
| The `inbox` subcommands (`list`, `ack`, `promote`, `drop`) and the `--index` and `--owner` options | One `inbox` call |
| The `memo` options `--to` and `--message` | The free-text argument |
| The `claim` options `--target`, `--branch`, `--pr`, and `--expires-at`, and the `release` option `--target` | The free-text argument and what the command can find |
| The `gemba-trace` query subcommands: `overview`, `count`, `batch`, `head`, `tail`, `search`, `tools`, `tool`, `tool-calls`, `commands`, `paths`, `compare`, `errors`, `reasoning`, `timeline`, `stats`, `init`, `turn`, and `filter` | `ask` |
| The `gemba-xmr record` options `--metric`, `--value`, `--unit`, `--note`, `--route`, and `--routes-eligible` | The free-text argument and the metrics reference |
| The private agent loop of `gemba-wiki fix`, its exits that skip the agent, its use of the technical-writer profile, and its text-only result | The shared loop, the command's own agent, and the result contract |
| `product-mix`'s call to the `record` command | A row writer in the library, which `record` shares |
| The `FIT_WIKI_SCANNER_ABSENT_OK` override | A scanner on every host that runs these commands |

## Scope

| In | Out |
| --- | --- |
| The nine commands in § B, their help and examples, and their tests | `gemba-wiki pull`. Its conflict message already points the caller to `push`. |
| The shared agent loop, the result contract, the secret scan of agent input, and the limits | `gemba-wiki audit`, `rotate`, `refresh`, `boot`, `curate`, `ledger`, `init`, and the scaffold of spec 2400 |
| `release`'s target input. `product-mix`'s row write. | `release`'s other behaviour. `product-mix`'s computation. |
| The `gemba-trace` subcommand set | The `gemba-trace` locators and pipeline commands: `runs`, `find`, `download`, `split`, `cost`, `assert`, and `by-discussion` |
| The `gemba-xmr record` input | The `gemba-xmr` read commands and the event-type rule of spec 2370 |
| `jidoka fix` | The `jidoka` checks (`instructions`, `invariants`, and `jtbd`, with its `--fix`). They stay deterministic CI gates. |
| The actions that carry the new binaries and the credential: `gemba-wiki`, `gemba-bootstrap`, `kata-agent`, and `kata-interview`, and the workflows that pin them | The `gemba-harness`, `gemba-benchmark`, `gemba-watchdog`, and `gemba-selfedit` CLIs |
| Every caller of a removed form: `.claude/skills`, `.claude/agents` (with the claim step of the team protocol), the composite actions and their READMEs, `.github`, `scripts`, the justfile, `package.json`, the library READMEs and tests, the audit hints, the CLI help examples, and the `benchmarks/fit-wiki` eval family | The result contract for commands without an agent. They keep their output. |
| The `gemba-wiki`, `gemba-trace`, `gemba-xmr`, `gemba-harness`, `jidoka-audit`, and `jidoka-layer` skills, and the gemba and jidoka pages that describe these commands and the override | The issues on the conservation guard (#2077, #2218). Spec 2390's declared removal answers them. |
| This repository's Stop hook | The hooks reference that spec 2400 writes. It takes § A13 in that spec's update procedure. |

## Compatibility

Clean break. Every surface in § C goes, and every caller moves with it, in one
merge. In this repository `npx` and `bunx` resolve the workspace binaries
first, so the agents' calls and their instructions change together at the
merge. The CI action steps run the binaries the actions pin. The new binaries
reach an action step only in the action release that also passes it the model
credential, and the actions that carry them release under a new major version.
An installation on the old major keeps its CLIs and packs as they are, and it
moves both in one update.

The change has a price. The Kata job's Anxiety is the closest: the embedded
agents act on memory with no person in the loop. The gates bound each write,
the scripted tests pin each outcome, and every agent decision lands in `facts`
or the weekly log where a person can read it.

- **Credentials.** Each of the nine commands needs a model credential wherever
  it runs, and each call costs one model run.
- **Latency.** Claude Code fires the Stop hook each time a session agent ends a
  turn, so an interactive session waits for one push run per turn, at most 60
  seconds of agent time.
- **Outages.** A model outage ends every `push`, `claim`, `log`, `memo`,
  `inbox`, and `record` in `failed`, and no `gemba-trace` command can read a
  trace. On an ephemeral runner, the unpushed memory then leaves with the
  runner. The Gemba job's "persist memory" accepts this loss as the cost of one
  path.
- **Trace reading.** A person who reads a trace needs a credential, the answer
  is model-written, and a trace with a scanner finding cannot be read through
  the CLI. The citation and number gates bound the answer.
- **Prerequisites.** The secret scanner becomes a prerequisite on every host
  that runs the nine commands.
- **Install weight.** An npm install of `jidoka` now pulls the agent runtime,
  about 224 MB on darwin-arm64, for every check user. The gear binary stays
  small.
- **Vendor coupling.** The credential ties a team closer to one vendor's
  runtime, which is the Anxiety the Gemba job names.

The change stays short of the Gemba job's Fired When condition, because each
command loses the flags and reason codes that the problem table counts, and
the price above is bounded per call.

## Success criteria

Criteria marked *live* need a model credential, and they run in the plan's
acceptance step. Criteria marked *post-merge* run after the merge. All others
run with a scripted agent.

| # | Claim | Verification |
| --- | --- | --- |
| S1 | The removed subcommands and options are gone. | The `--help` output of `gemba-wiki log`, `inbox`, `memo`, `claim`, and `release`, and of `gemba-xmr record`, names no subcommand or option that § C removes. |
| S2 | `gemba-trace` offers `ask` and the seven kept commands only. | `gemba-trace --help --json` lists exactly `ask`, `runs`, `find`, `download`, `split`, `cost`, `assert`, and `by-discussion`. |
| S3 | No caller names a removed form. | A search over `.claude`, `.github`, `libraries`, `products`, `scripts`, `websites`, `benchmarks`, `justfile`, and `package.json`, with one pattern per removed form that names its command or its argument-array entry, and one for `FIT_WIKI_SCANNER_ABSENT_OK`, returns nothing outside `specs/` and the changelogs. |
| S4 | Every call that reaches the job runs the agent. | On a host with the scanner and no model credential, in a temporary repository with a clean wiki, a recorded trace, a skill with a metrics reference, and a planted instruction finding, each of the nine commands with its JSON switch prints `outcome` `failed` and a `reason` that names the credential. |
| S5 | The result object has one shape. | For each of the nine commands, the JSON switch prints one object with exactly the keys `command`, `outcome`, `reason`, `facts`, `pending`, and `next`. |
| S6 | Each outcome keeps its exit code. | The command tests reach every outcome that each command's § B row and § A7 allow, and assert the code in § A7. |
| S7 | `push` merges a two-session prose conflict. *Live.* | Two clones each add a different bullet to one section of one summary, and each runs `gemba-wiki push`, and both exit 0 with both bullets in the remote file. |
| S8 | `push` refuses a merge that loses, invents, or marks a line. | Tests whose agent, in every round, drops one side's line, adds a line that no version holds, or leaves a conflict marker end in `needs-human`, with the remote tip unchanged. |
| S9 | `push` stops on a line both sides changed. | A test where both sides edit one base line differently ends in `needs-human` with the line in `pending`. |
| S10 | `log` writes only the caller's words. | A test whose agent writes a rationale that the text does not hold, in every round, ends in `needs-human` and writes nothing. |
| S11 | `inbox` leaves no memo untracked. | After `gemba-wiki inbox --agent <a>` on an inbox of three memos, each memo appears in the priorities or in a weekly-log line with its reason. |
| S12 | `memo` writes only to roster members. | Tests whose agent, in every round, names an unknown recipient, the sender, or nobody, end in `needs-human` and write no file. |
| S13 | A broadcast reaches every other agent. | A test of a message that addresses everyone delivers it to every roster member except the sender. |
| S14 | `claim` refuses the same work under another id. | With another agent's unexpired claim whose row carries pull request `#<n>`, `claim --agent <b> "PR #<n>"` ends in `blocked`, and `facts` names the holder. |
| S15 | A claim refused on the remote tip leaves no row. | A test whose remote tip gains another agent's claim on the same id, with no rebase conflict, ends in `blocked`, and the local claims hold no row from the call. |
| S16 | `release` maps the caller's words. | After `claim` writes `spec-<n>`, `gemba-wiki release --agent <a> "Spec <n>"` removes the row. |
| S17 | The roster rule refuses an unknown agent. | `gemba-wiki log --agent <not-on-roster> "<text>"` exits 2 and writes nothing. |
| S18 | `ask` answers only with checked citations and numbers. | Tests whose agent, in every round, gives no citation, cites a turn that does not hold the quote, or states a number that no tool result holds, end in `needs-human`. |
| S19 | `ask` answers a real question. *Live.* | `gemba-trace ask` on a recorded trace exits 0 with at least one citation. |
| S20 | `record` invents nothing. | Tests whose agent, in every round, returns a value absent from the text, an unknown metric, or a route the text does not name, append no row and end in `needs-human`. |
| S21 | `record` writes a valid row. *Live.* | `gemba-xmr record --skill <s> "<text>"` appends a row that `gemba-xmr validate` accepts. |
| S22 | `product-mix` still records its row. | `gemba-wiki product-mix` with no model credential appends its row, and `gemba-xmr validate` accepts it. |
| S23 | `jidoka fix` moves text and loses none. *Live.* | On a planted over-cap skill, `jidoka fix` then `jidoka instructions` both exit 0, each removed sentence is in another file, and every relative link in the edited files resolves. |
| S24 | A fix keeps its good work. | A test with two findings, where the agent fixes one and its edit for the other drops a sentence from every file, keeps the first fix, restores the second file, and ends in `needs-human`. |
| S25 | An editor never writes outside its files. | A test whose editor attempts a write outside its files leaves that file unchanged. |
| S26 | Secrets never reach the model. | With a planted secret in the wiki diff, in the caller's text, and in a trace, `push`, `log`, and `ask` each end in `blocked`, and the scripted agent never receives the secret. |
| S27 | A missing scanner fails the call. | On a host with no scanner, `gemba-wiki log --agent <a> "<text>"` ends in `failed` with a reason that names the scanner. |
| S28 | The agent loads no host hooks, settings, or skills. *Live.* | In a repository whose project settings carry a Stop hook that writes a marker file and a project skill, `gemba-wiki push` leaves no marker, and the run's trace lists no project skill. |
| S29 | The commands need no agent profiles. | In a repository with no `.claude/agents` directory, `jidoka fix` and `gemba-wiki fix` end in `done` on a planted finding. |
| S30 | One loop serves every command. | No command library imports the agent runtime, and the bins import only its session entry point: `rg -l '@forwardimpact/libharness' libraries/libwiki libraries/libxmr libraries/libinvariant` returns nothing, and every match in `products/gemba/bin` and `products/jidoka/bin` names the session entry point. |
| S31 | The output hides the agent's own run. | The default and JSON outputs of each command name no model or cost of the run, and `--verbose` writes both, and the trace path, to stderr. |
| S32 | A mid-merge tree no longer reports success. | On a wiki with a merge in progress, `gemba-wiki push` exits 4. |
| S33 | A run that hits a time limit fails cleanly. | A test whose agent never answers ends in `failed` within the limit, and the local commit stays. |
| S34 | An interrupted push leaves a clean wiki. | A test that kills `push` during each step leaves no merge or rebase in progress, and the remote is at its old tip or at the new commit. |
| S35 | Two pushes in one clone do not collide. | A test that starts a second `push` while one is in flight ends with both pushes landed or the second in `failed`, and no merge or rebase in progress. |
| S36 | The Stop hook blocks once. | With a stubbed `push`, the hook command exits 2 on stub exits 4 and 5, exits 0 when the hook's retry flag is set, and exits 0 on stub exit 3. |
| S37 | No `next` sentence is unsafe. | A test over every `next` sentence finds none that tells the caller to pop, apply, or drop a stash, or to declare a removal. |
| S38 | The action push holds a credential. | Every action step that runs a `gemba-wiki` command passes a model-credential input, and the action release that pins the new binaries is the one that adds it. |
| S39 | The repin follows the merge. *Post-merge.* | This repository's workflows pin the new major of `kata-agent` and `kata-interview` within one day of the change's merge. |
| S40 | The instruction layers stay within their caps. | `jidoka` passes. |

## Relation to open specs and issues

| Item | Relation |
| --- | --- |
| 2370 | Its record and read changes landed. This spec keeps its event-type rule and the `--event-type` option. Both specs edit the `gemba-xmr` skill and the gemba pages, and the later merge rebases. |
| 2380 | It gives each facilitated participant its own workspace. Until it lands, § A15 serializes the participants' pushes. Both specs edit the `gemba-wiki` skill and the wiki pages, and the later merge rebases. |
| 2390 | It lands first. Its declared-removal option stays a `push` input, and it answers #2077 and #2218. |
| 2400 | It lands first. `memo` and the roster rule read its roster. Its S8 check names `memo --to all`, which this spec replaces with a message that addresses everyone (S13). |
| #2069, #2076 | A mechanical fix can close these P0s before this spec lands. S32 then guards the result. |
| #2059, #2063 | The `next` sentences replace the refusal remedies those issues cite (S37). |
| bionova-apps-v2#259, #497 | The `inbox` gates and the roster rule close them (S11, S17). |
