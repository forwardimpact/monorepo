# Spec 2380: Every participant in a facilitated session works in its own workspace

**Classification:** product. The change lands on the published `gemba-harness`
CLI and action, the `kata-agent` action, the `gemba-wiki` publish command, and
the published Gemba and Kata skills and pages.

**Persona and job:** Teams Using Agents. The primary job is Gemba's
[Stand Up and Operate an Agent Team](../../JTBD.md#teams-using-agents-stand-up-and-operate-an-agent-team):
run sessions and persist memory. The storyboard, coaching, and dispatch
sessions serve Kata's
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team),
whose anxiety force reads "autonomy might amplify bad patterns faster than
humans can intervene".

## Problem

### One directory for every participant

`gemba-harness facilitate` and `gemba-harness discuss` run a lead and N
participants in one process. Both commands take one `--agent-cwd` value,
default `.`, and stamp that one value on every participant. The help text
states the consequence: "Working directory shared by participants". The
facilitator and the discusser already read a working directory per
participant from its configuration. The commands fill every participant's
field with the same value.

| Surface                               | Participant directory today                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `gemba-harness facilitate`, `discuss` | One value for all participants, default `.`                                  |
| `gemba-harness supervise`             | One agent. A fresh temporary directory per bare CLI run; `.` through the actions |
| `gemba-harness` action                | `agent-cwd` input, default `.`, passed to all three modes that take it       |
| `kata-agent` action                   | `agent-cwd` input, default `.`, forwarded to the action above                |

### This is the shape of every facilitated session we ship

This monorepo's `kata-storyboard.yml` runs `discuss` with the improvement coach
and seven participants in one checkout. `kata-dispatch.yml` runs facilitated
and discussion sessions with six participants that implement work from a task
event, and `kata-coaching.yml` runs `facilitate` with one participant.
`kata-setup` writes `agent-storyboard.yml` and `agent-coaching.yml`
templates downstream with the same shape. A scheduled shift runs one profile
per job through a matrix, so it has its own checkout. Every incident below is
on the facilitated path and none is on the matrix path.

### Measured

Issues #2054 and #2056 opened this thread. Issues #2084 and #2085,
[forwardimpact/kata-agent#4](https://github.com/forwardimpact/kata-agent/issues/4),
[#5](https://github.com/forwardimpact/kata-agent/issues/5), and
[forwardimpact/kata-skills#26](https://github.com/forwardimpact/kata-skills/issues/26)
report the same mechanism from two installations, one month apart.

| Observation                                                                                                                                                  | Source                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| One participant's reflog shows its own commit followed by a peer's branch switch, rebase, abort, and `Reset to origin/main`, while it had files open.         | kata-agent#4                  |
| A peer's reset deleted a participant's uncommitted file. The next commit failed on an unmerged path that participant never touched.                          | kata-agent#4, #5              |
| Six files staged by five agents sat in one index. A bare commit would have published five peers' half-written logs under one author.                        | kata-skills#26                |
| Three participants committed from the same parent within two minutes under one bot identity.                                                                 | kata-agent#5                  |
| A hand-rolled commit in the shared wiki tree deleted 1096 lines across 25 files. Its subject is not one the wiki tool writes.                                | #2167 and its triage comment  |
| In the same session, one `gemba-wiki pull` on the shared wiki tree fast-forwarded 86 commits.                                                                | kata-agent#6                  |
| Agents in the shared tree worked around it with a throwaway index and `commit-tree`, and pushed a SHA rather than HEAD.                                       | kata-skills#26                |
| 890 of 895 workflow runs on one installation call the `gemba-harness` action directly, not through `kata-agent`. Each of those runs holds five sessions.    | #2084                         |

### Why the protocol cannot close it

Spec 2010 serializes shared-workspace writes by declared paths: a participant
names the paths it will stage, and the facilitator holds a same-surface ask
until the prior one returns. HEAD, the index, and the working tree are not
paths. `checkout`, `rebase`, `reset`, and `stash` rewrite them. Two participants
with disjoint declared paths are permitted to run at once, and one replaces the
other's tree. libwiki's write path states one checkout per session as its
precondition in its own contract notes, and a facilitated session violates it by
construction. Participants boot, read memory, and triage an inbox in the shared
tree before any skill-level mandate can fire, so a convention inside the tree
cannot close the window. The `kata-implement` skill already mandates a worktree
for implementation work. Participants in a session have no equivalent.

## Proposal

| #   | What changes                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | In `facilitate` and `discuss`, every participant runs in its own workspace. The harness creates it before the session starts and hands it to that participant alone. When at least one participant is provisioned, the lead's directory must be a version-controlled project; otherwise the command fails with a named error. |
| P2  | A workspace holds the lead's project at the lead's current commit, with its own HEAD, index, and files. Nothing a participant does to those reaches another participant or the lead.                                                                                                                                                       |
| P3  | When the lead's directory holds a wiki clone, each workspace holds its own wiki clone at the lead clone's commit, checked out on the publish branch. Each clone fetches from and pushes to the lead clone's remote under the session's credentials. |
| P4  | A workspace runs the participant protocol's commands. The platform's CLIs are on `PATH` as they are for the lead. The repository's own session hooks run in the workspace, and this monorepo's bootstrap prepares a workspace without a reinstall. |
| P5  | A participant's wiki writes publish from its own clone. The wiki publish command can publish every participant wiki under one workspaces root: one outcome line per clone, no stop at the first failure, a non-zero exit when any clone fails, and a zero exit with a notice when the root holds no workspaces.                              |
| P6  | The `kata-agent` action publishes the lead's pre-run refresh before the session starts, so participants clone the refreshed board and the lead's clone is clean. After the session, under every outcome, it publishes the participant wikis, brings the lead's wiki current, and only then refreshes and publishes the lead's wiki, so the refreshed board includes the session's rows. Every post-session step runs under the session's credentials. |
| P7  | A caller that runs the harness directly runs the same publish after the session. The harness action exposes the workspaces root as an output for that purpose, and its documentation shows the step.                                                                                                                                      |
| P8  | The shared-directory option is removed from `facilitate` and `discuss`, and the harness action rejects it for those modes. A caller may name the root under which workspaces are created. Without one, the root is a fresh temporary directory outside the lead's checkout. `supervise` keeps its single agent directory. |
| P9  | Workspaces stay in place when the session ends. The harness reports the root and each participant's workspace in its trace and on standard error. Removal belongs to the caller, and the documentation names the removal step.                                                                                                             |
| P10 | The harness docs and skill, both action READMEs, the Gemba pages that show facilitated sessions, the wiki publish docs, the kata-session skill, and its dispatch-discipline reference state that HEAD, index, and files are per participant. Every description of a shared participant directory, including the `agent-cwd` input descriptions, is removed or scoped to `supervise`. The dispatch discipline keeps same-surface serialization. |

**Compatibility stance:** clean break. The shared-directory option is removed
from the two session modes with no alias.

Consequences on upgrade:

- A caller that passes the removed option to `facilitate` or `discuss` gets an
  unknown-option error from the CLI and from the harness action. The
  `kata-agent` action documents its input for `supervise` only.
- A caller that runs the harness directly and does not add the post-session
  publish loses every participant's wiki writes with the runner. The harness
  action README names the step.
- A `facilitate` or `discuss` run whose lead directory is not a
  version-controlled project is refused.
- A lead's uncommitted project changes do not reach the workspaces.
- A session with N participants creates N working trees and N wiki clones.
  This monorepo's storyboard runs seven.
- A participant whose repository defines a Stop hook that publishes the wiki
  may publish its own clone during the session. The post-session publish then
  reports nothing to push for that clone, and lands any clone whose hook
  publish failed.
- A participant refusal in the post-session publish fails that step, so a
  storyboard operator sees a red run where today the lead's single push
  decided it.
- A local caller accumulates workspaces until it removes the root. The
  documentation names the step.

## Scope

### Included

| Component                                                                                                                                                                                                                                                                   | What changes                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `gemba-harness facilitate` and `discuss`                                                                                                                                                                                                                                    | P1 to P3, P8, P9.                                                               |
| `gemba-wiki push`                                                                                                                                                                                                                                                           | P5.                                                                             |
| `gemba-harness` action                                                                                                                                                                                                                                                      | P7 and P8: the root as input and output, no shared directory for the two modes. |
| `kata-agent` action | P6 and P8. |
| This monorepo's bootstrap script                                                                                                                                                                                                                                            | P4: a workspace of this repository is ready without a reinstall.                |
| kata-session skill and dispatch-discipline reference                                                                                                                                                                                                                        | P10.                                                                            |
| `gemba-harness` skill and its CLI reference, `gemba-harness` action README, `kata-agent` action README, the Gemba coordinate-team and prove-changes pages, the `gemba-wiki` skill's push and pull section, the `libwiki` and `libharness` READMEs, the Gemba wiki-operations page | P7, P9, P10.                                                                    |

The kata-setup facilitated templates pass no participant directory today and
do not change.

### Excluded

| Excluded                                                                                              | Why                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `run` and `supervise` modes                                                                           | One agent per process.                                                                                                                      |
| The lead's own directory                                                                              | One actor.                                                                                                                                  |
| libwiki's write-path semantics in one clone                                                           | Tracked by #2093 and #2070. This spec restores the one-checkout-per-session precondition those semantics assume.                             |
| Stale reads in a shared tree (the closed #2165 and #2166, kata-skills#26's read-side half)            | Each participant pulls its own clone. The team protocol's pull-before-claim stays.                                                          |
| A lock, lease, or mutex over the workspace                                                            | Spec 2010 non-goal. Isolation removes the shared surface instead of guarding it.                                                            |
| A `tree_ops` edit-intent class (kata-skills#26 request 2)                                             | With HEAD, index, and files per participant, a tree operation touches no shared surface.                                                    |
| A hook that rejects HEAD-moving commands, or HEAD-stamped tree reports (kata-agent#4 options 2 and 3) | Both act inside the shared tree. The tree is the defect.                                                                                    |
| Token minting inside the harness                                                                      | The harness holds no App key. The wiki action mints per step.                                                                               |
| The `kata-implement` worktree mandate                                                                 | Unchanged. It works from a workspace.                                                                                                       |
| The `gemba-wiki` action | Unchanged. Its command input carries the publish flag. |
| A participant that writes into the lead's checkout by path (#2056's criterion) | Isolation gives each participant its own directory. A deliberate write elsewhere is a protocol violation, and the kata-session skill states the rule. |

## Relation to spec 2010

Spec 2010 removed the whole-tree staging sweep (L1) and serializes same-surface
asks at the facilitator (L2). Both stay. L1's own-artifact staging now runs in
a tree that holds only the participant's artifacts. L2 still orders edits to
shared wiki rows (claims, STATUS) that collide at the remote whatever the
local topology. Spec 2010's design assumed the facilitated session ran in a
shared checkout; this spec removes that assumption.

## Success criteria

| #   | Claim                                                                                        | Verification                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Each participant runs in a distinct copy of the lead's project at the lead's commit.         | Run `gemba-harness facilitate` with three profiles; the trace event the design names lists three distinct workspaces, and in each `git rev-parse HEAD` equals the lead's HEAD at session start.                                          |
| S2  | A participant's tree operations do not reach another participant.                            | Run `git reset --hard` and check out a new branch in one workspace; a second workspace's uncommitted file and `git status` are unchanged.                                                                                                 |
| S3  | Each workspace holds its own wiki clone at the lead clone's commit.                          | Each workspace holds `wiki/.git` whose HEAD equals the lead clone's HEAD on the publish branch and whose `origin` URL equals the lead clone's.                                                                                            |
| S4  | A workspace of this repository is ready without a reinstall. | In a fresh workspace of this monorepo, the session-start bootstrap exits 0 and reports the workspace ready without running the install. |
| S5  | The publish command publishes every participant wiki under a root and reports each. | With a row appended to its own weekly log in two participant clones, and in a third clone an edit to a prose line that the remote changed after the clone, the publish lands the two rows, reports the third clone's conflict, prints one line per clone, and exits non-zero. |
| S6  | The publish command handles a root with no workspaces.                                       | With an empty or absent root, the publish prints the notice and exits 0.                                                                                                                                                                  |
| S7  | The shared-directory option is gone from the two session modes and kept on `supervise`. | `gemba-harness facilitate --agent-cwd x` and `gemba-harness discuss --agent-cwd x` exit non-zero with an unknown-option message, and `gemba-harness supervise --help` lists `--agent-cwd`. |
| S8  | The harness reports the workspaces without breaking the trace stream.                        | With no `--output`, every stdout line parses as NDJSON, one event carries the root and each participant's workspace, and the same report appears on standard error.                                                                        |
| S9  | A lead directory that is not a version-controlled project is refused.                        | `gemba-harness facilitate` with a lead directory that holds no repository exits non-zero and names the precondition.                                                                                                                      |
| S10 | The harness action passes the root and no shared directory for the two modes. | Read the action's `facilitate` and `discuss` invocations: each carries the root option and neither carries `--agent-cwd`; the action defines the root as an input and an output, and it fails when `agent-cwd` is set with either mode. |
| S11 | The `kata-agent` action publishes in the required order. | Read the action's wiki steps: before the session, the refresh then its publish; after the session, in order, the participant publish, the lead pull, the refresh, and the lead publish, every post-session step guarded for every outcome. |
| S12 | The `agent-cwd` input is documented for `supervise` only. | `rg -n 'agent-cwd' products/gemba/actions/gemba-harness products/kata/actions/kata-agent`: every description hit names `supervise` only. |
| S13 | No published surface describes a shared participant directory. | `rg -n -i 'shared checkout\|shared by (the )?participant\|share one checkout\|shared tree\|shared-workspace\|share .--agent-cwd' .claude/skills/kata-session .claude/skills/gemba-harness .claude/skills/gemba-wiki products/gemba/actions products/kata/actions libraries/libwiki/README.md libraries/libharness/README.md websites/gemba` returns no match. |
| S14 | No published `facilitate` or `discuss` example carries the shared-directory option. | `rg -n -B4 'agent-cwd' .claude/skills/gemba-harness websites/gemba`: every hit sits in a `supervise` invocation or its description. |
| S15 | The documentation shows the post-session publish step and the removal step. | Read the harness action README and the harness skill's CLI reference: each shows the publish step, and the harness docs name the removal step. |
| S16 | The help for the two session modes shows the root option and no shared-directory option. | `gemba-harness facilitate --help` and `gemba-harness discuss --help` list the root option and do not list `--agent-cwd`. |

Post-deployment validation target, not an acceptance gate: a `kata-storyboard`
run on this monorepo completes with seven participants after the release
chain lands, and its log shows one publish line per participant before the
lead's post-session refresh.
