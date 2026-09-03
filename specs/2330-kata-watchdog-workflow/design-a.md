# Design 2330-a: Repository Activity Watchdog

Spec 2330 adds a deterministic brake on Kata event chains. This design fixes the
components, the split between measurement and engagement, the credential scope,
and the failure semantics. The watchdog runs no agent. Its whole input is four
counts from the GitHub REST API and two variable records.

## Component map

```mermaid
graph LR
    CR["schedule */15<br/>+ workflow_dispatch"] --> AS["job: assess<br/>read-only, no App token"]
    AS -->|"GITHUB_TOKEN read"| API["GitHub REST<br/>commits · pulls<br/>issues · comments"]
    AS --> SUM["Run summary<br/>counts · killswitch value · verdict"]
    AS -->|"verdict = breach<br/>and not dry-run"| EN["job: engage<br/>mints the Kata App token"]
    EN -->|"Variables read+write<br/>no Secrets permission"| KS["KATA_KILLSWITCH"]
    KS --> KW["kata-shift · kata-dispatch<br/>kata-storyboard · kata-coaching<br/>kata-interview"]
```

Both jobs run the same composite action in different modes. Measurement mints no
App token at all, so a quiet run and a dry run need no secret and execute from
any branch.

## Components

| Component | Where | Role |
| --------- | ----- | ---- |
| Watchdog workflow | `.github/workflows/watchdog.yml` | The `schedule` and `workflow_dispatch` triggers, the threshold of 32 and the 2-hour window as literal numbers, the manual inputs (`dry-run`, plus dry-run-only `override-threshold` and `simulate`), and the two jobs. `assess` grants `GITHUB_TOKEN` read access to contents, issues, and pull requests and nothing else. `engage` sets `needs: assess` with `if:` on the assess verdict. Both jobs set `timeout-minutes: 5`. Each job is a sequence of `uses:` steps. |
| Watchdog action | `.github/actions/watchdog/` — `action.yml`, `watchdog.sh`, `README.md` | Each job runs `actions/checkout` with `sparse-checkout: .github/actions/watchdog` and `fetch-depth: 1`, then this action. The action mints the App token in `engage` mode and runs `watchdog.sh`. The threshold and window inputs are required and default-free, so the numbers live only in the workflow. It pins `actions/create-github-app-token` by SHA, as the workflows do. |
| Logic script | `.github/actions/watchdog/watchdog.sh` | Reads state, counts, compares, builds the reason, writes the summary, and performs the one write. It takes its inputs from the environment and its HTTP responses from a seam the tests replace, so `tests/watchdog.test.js` drives every branch against fixture payloads. |
| Credential | The existing Kata App, through `secrets.KATA_APP_ID` and `secrets.KATA_APP_PRIVATE_KEY` | The App gains `Variables: read & write` and holds no `Secrets` permission. The killswitch is an Actions variable in every workflow, action, and setup template today, which is what lets one permission cover the brake without opening secret access. |
| Killswitch variable | `KATA_KILLSWITCH` Actions variable | Unchanged contract. The truthy predicate is the one `products/kata/actions/kata-agent/action.yml` already defines. The watchdog is one more writer of the repository-scoped variable. |

## Interfaces

| Step | Job | Request |
| ---- | --- | ------- |
| Commits | assess | `GET /repos/{repo}/commits?sha={default_branch}&since={cutoff}&per_page=100` |
| Pull requests | assess | `GET /repos/{repo}/pulls?state=all&sort=created&direction=desc&per_page=100` |
| Issues | assess | `GET /repos/{repo}/issues?state=all&sort=created&direction=desc&per_page=100` |
| Comments | assess | `GET /repos/{repo}/issues/comments?since={cutoff}&sort=created&direction=desc&per_page=100` |
| Read repository state | engage | `GET /repos/{repo}/actions/variables/KATA_KILLSWITCH` for `value` and `updated_at`. A 404 reads as falsy with no timestamp. |
| Read organization state | engage | `GET /repos/{repo}/actions/organization-variables` |
| Engage | engage | `PATCH /repos/{repo}/actions/variables/KATA_KILLSWITCH`, and `POST /repos/{repo}/actions/variables` when the variable does not exist |

`cutoff` is the run start minus 2 hours. Pull requests, issues, and comments are
counted by `created_at` against the cutoff. Issues discard items that carry a
`pull_request` key. The comments endpoint covers issue and pull-request
conversation comments, which is the `issue_comment` trigger surface; it does not
return inline review comments, and the spec excludes those. Each request makes
five attempts, with 2, 4, 8, and 16-second pauses between them, so a transient
failure does not reach the fail-safe.

**Window coverage.** Two counters discard items the endpoint returns. The issues
endpoint returns pull requests, and the comments endpoint filters on `updated`
rather than `created`, so a full first page can hold fewer than 32 qualifying
items and still hide older ones inside the window. Both counters therefore treat
a full first page whose oldest item is still inside the window as an uncovered
window, which is a breach. The other two need no such rule: commits are filtered
server-side by `since`, and pull requests are undiscarded, so for both a full
page is itself a count of 100 and already a breach. Pagination never runs.

**Committer dates.** The commits counter filters on committer date. A push that
rewrites 32 or more committer dates on the default branch therefore trips it.
The repository squash-merges, so this is a force-push case, and a false stop
there is the intended fail-safe behaviour rather than a defect.

## Decision order

```mermaid
stateDiagram-v2
    [*] --> Count
    Count --> Quiet: every count under 32
    Count --> Breach: any count at or over 32
    Count --> Breach: the issues or comments window is uncovered
    Count --> Breach: any counter unreadable after its retries
    Breach --> Report: dry-run (exit 0)
    Breach --> ReadState: engage job starts
    ReadState --> Skip: either scope truthy
    ReadState --> Skip: repository value falsy, updated_at inside the window
    ReadState --> Write: otherwise (exit 1)
    Quiet --> [*]
    Report --> [*]
    Skip --> [*]
```

Counting always runs first, so every run summary carries the four counts. An
operator deciding whether to clear reads the current activity level from the
latest run, including while the switch is already engaged. The summary also
records the killswitch's current value on every run, which is how an unexplained
clear becomes visible within 15 minutes.

The second Skip branch is the resume path. A human clears the switch by writing
a falsy value rather than deleting the variable, which leaves an `updated_at`
the watchdog reads. The watchdog then stays quiet for one window while the burst
that caused the stop drains out of it. The README states this, because deleting
the variable gives no timestamp and no quiet window.

The written value is pipe-separated, because an ISO timestamp contains colons.
It names every breached counter, not the first, in the shape
`watchdog|issues=47/32|comments=38/32|2026-09-02T16:49:00Z`.
An unreadable or uncovered counter appears as `issues=unreadable` or
`issues=uncovered` in the same position, and outranks a threshold breach on the
same counter. Every such value is truthy.

## Failure semantics

| Condition | Result | Why |
| --------- | ------ | --- |
| Every count under 32 | Quiet, exit 0, no engage job | Normal operation. |
| Any count at or over 32 | Engage, exit 1 | The deterministic contract. |
| The issues or comments window uncovered, or any counter unreadable after five attempts | Engage, exit 1, reason names the counter | Doubt stops the line. An unnecessary stop costs idle agent time. A silent watchdog costs an unbounded token spend. |
| Killswitch already truthy at either scope | Skip, exit 0 | The line is already stopped. A rewrite would destroy a human's reason string. |
| Killswitch cleared inside the window | Skip, exit 0 | The resume path. Without it the next run re-engages on the same drained burst. |
| Token mint or variable write fails | Exit 1, no state change, summary names the failure | The next run in 15 minutes recomputes the same window and retries. |

The engage job exits non-zero on every outcome except Skip, so an engagement and
a failed write both show red in the Actions list. This is the one fail-open
path: an expired credential leaves the brake absent. It fails red on every run
rather than going quiet, which is why the summary distinguishes a write failure
from an engagement.

## Key decisions

| Decision | Choice | Rejected alternative and why |
| -------- | ------ | ---------------------------- |
| Brake mechanism | Write `KATA_KILLSWITCH` | Disable each workflow through the Actions API. That fragments one documented control into N enablement states a human must reverse one at a time, and it leaves the killswitch record blank. |
| Credential | The existing Kata App, gaining `Variables: read & write` and no `Secrets` permission | A second App with its key in a default-branch Actions Environment. That makes the containment a permission boundary an agent cannot cross, at the cost of a second App to register, install, and rotate. The operator chose one credential. The scoping choice is what limits the cost: because the killswitch is a variable and not a secret, the brake needs no secret access. |
| Containment | A gate and a stated residual | A claim that no agent can reach the switch. Agent sessions run under the same App token, so that claim would be false. The controls are the skill rule, the trust-sensitive merge rule on both routes, and the value the watchdog records on every run. The brake is robust against a chain that is not trying to defeat it. |
| Job shape | Separate read-only `assess` and token-minting `engage` | One job. Every quiet run would then mint the write token, and a dry run could not execute from a branch, which leaves the engage and fail-safe criteria testable only by landing a change on the default branch. |
| Logic home | A local composite action, with the logic in a script the test suite drives | A published sibling action, which puts a repository, an App grant, a subtree split, and a SHA pin in the critical path of the brake. An inline wall in the workflow, which `.github/CLAUDE.md` § Local composite actions forbids and which no test could reach. |
| Workflow name | `watchdog.yml` | `kata-watchdog.yml`. That name enters the `kata-*` glob, so it would force an exclusion in the `kata-workflows` enumeration topic and make the killswitch sentence in `KATA.md` ambiguous. The watchdog runs no agent, so it is repository CI, not a Kata surface. |
| Comment counter scope | Conversation comments only | Also inline review comments. Those are not a `kata-dispatch` trigger, and one review panel legitimately posts many, so counting them would stop the team on ordinary review activity. |
| Concurrency | No concurrency group | A named group. `.github/workflows/kata-dispatch.yml` documents that a newly pending run in a group cancels the previously pending one, so a group could drop a watchdog run silently. The action is short and idempotent, so an overlap is harmless. |
| Killswitch read | Both scopes, through the API, in the engage job | The `vars` context, or the repository scope alone. `vars` carries no `updated_at` and binds at job start. Reading only the repository scope lets a repository variable the watchdog created outlive a human's organization-scope clear. |
| Resume | Quiet for one window after a human clears | Nothing, or a stored high-water mark. Without the rule the next run re-engages on a burst that is still inside the window, and the human cannot resume at all. Stored state is a file an agent could reach. |
| Measured signal | Repository artifacts: commits, pull requests, issues, comments | Token spend or agent turns. Those are internal to the run that is misbehaving. External evidence survives a harness that reports its own cost wrongly, and each LLM platform already carries its own spend cap. |
| Actor filter | None. Count every author | Count only Kata App activity. A filter adds a judgment the watchdog must make and gives sprawl a place to hide. The threshold clears the known scheduled batches instead. |
| Unreadable or uncovered count | Engage, after five attempts | Skip the counter and continue. A watchdog that goes quiet under an API failure is worst at the moment it matters. |
| Threshold home | Literal numbers in the workflow, with default-free action inputs | `.kata/settings.json`, repository variables, or action defaults. The first is agent-read repository content. The second lives on the surface the watchdog defends. The third puts the numbers in two files. |
| Reason string | Names every breached counter | Names the first. A run where two counters breach would then record half the evidence a human needs to judge the stop. |
| Verification lever | Fixture-driven tests, plus a `dry-run` mode for a live rehearsal | A live test run. That writes a truthy value and halts every Kata surface until a human clears it, which makes the two most load-bearing criteria untestable without an outage. |

## Surfaces the change touches

| Surface | Edit |
| ------- | ---- |
| `kata-setup` `github-app.md` | The permission table gains `Variables: read & write`, with the reason: the killswitch is a variable, and the App holds no `Secrets` permission. |
| `kata-setup` SKILL.md | The setup report names the variables permission. The killswitch prose already says "variable" and needs no change. |
| Agent skills that write to GitHub | One rule: no agent writes `KATA_KILLSWITCH`. Only a human clears it, and only the watchdog sets it. |
| `KATA.md` § Killswitch | This repository also runs `watchdog.yml`, which sets the variable automatically on a commit, pull-request, issue, or comment-rate breach, and which does not gate on the variable itself. The paragraph is prose, outside the enumerated workflow table, as the `kata-interview` mention already is. |
| `.github/CLAUDE.md` § Local composite actions | One `watchdog` row. The `sibling-composite-actions` enumeration is untouched, because the action is local. |
| `kata-release-merge` SKILL.md | Both homes of the `.kata/` rule, the checklist item and the § Settings diffs prose, gain the two watchdog paths. The prose lead-in becomes "Guardrail diffs", because a workflow is not a settings file. |
| `kata-security-update` SKILL.md | The same two paths. Dependabot bumps the action's pinned dependency under the `/.github/actions/*` glob, and those pull requests route to this skill rather than the merge gate. |
| `websites/kata/docs/continuous-improvement/index.md`, `.../getting-started/index.md` | Qualify "every workflow" as "every Kata workflow", matching the two homes that already carry the qualifier. |
| `.github/actions/watchdog/README.md` | The credential scope, the threshold and its grounding, the clear-by-writing-a-falsy-value rule, and the containment residual. |

## Clean break

The design removes no existing path, because the killswitch contract is the path
it uses. It adds no second brake, no second credential, and no fallback. One
variable stops the team, and the watchdog is one more writer of that variable.
No environment variable, no repository data file, and no agent decision sits
between a breach and the write.
