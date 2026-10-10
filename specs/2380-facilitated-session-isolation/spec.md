# Spec 2380: Every participant in a facilitated session works in its own workspace

**Classification:** product. The change lands on the published `gemba-harness`
CLI and action, the `kata-agent` action, the wiki publish path, and the
published Gemba and Kata skills and pages.

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

| Surface                               | Participant directory today                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `gemba-harness facilitate`, `discuss` | One value for all participants, default `.`                                      |
| `gemba-harness supervise`             | One agent. A fresh temporary directory per bare CLI run; `.` through the actions |
| `gemba-harness` action                | `agent-cwd` input, default `.`, passed to all three modes that take it           |
| `kata-agent` action                   | `agent-cwd` input, default `.`, forwarded to the action above                    |

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

| Observation                                                                                                                                          | Source                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| One participant's reflog shows its own commit followed by a peer's branch switch, rebase, abort, and `Reset to origin/main`, while it had files open. | kata-agent#4                 |
| A peer's reset deleted a participant's uncommitted file. The next commit failed on an unmerged path that participant never touched.                  | kata-agent#4, #5             |
| Six files staged by five agents sat in one index. A bare commit would have published five peers' half-written logs under one author.                | kata-skills#26               |
| Three participants committed from the same parent within two minutes under one bot identity.                                                         | kata-agent#5                 |
| A hand-rolled commit in the shared wiki tree deleted 1096 lines across 25 files. Its subject is not one the wiki tool writes.                        | #2167 and its triage comment |
| In the same session, one `gemba-wiki pull` on the shared wiki tree fast-forwarded 86 commits.                                                        | kata-agent#6                 |
| Agents in the shared tree worked around it with a throwaway index and `commit-tree`, and pushed a SHA rather than HEAD.                              | kata-skills#26               |
| 890 of 895 workflow runs on one installation call the `gemba-harness` action directly, not through `kata-agent`. Each of those runs holds five sessions. | #2084                     |

### Why the protocol cannot close it

Spec 2010 serializes shared-workspace writes by declared paths: a participant
names the paths it will stage, and the facilitator holds a same-surface ask
until the prior one returns. HEAD, the index, and the working tree are not
paths. `checkout`, `rebase`, `reset`, and `stash` rewrite them. Two participants
with disjoint declared paths are permitted to run at once, and one replaces the
other's tree. libwiki's write path states one checkout per session as its
precondition in its own contract notes, and a facilitated session violates it by
construction. Participants boot, read memory, and triage an inbox before any
skill-level mandate can fire, so a rule that only a skill states arrives too
late. The `kata-implement` skill already mandates a worktree for implementation
work. Participants in a session have no equivalent.

## Proposal

| #   | What changes |
| --- | ------------ |
| P1  | In `facilitate` and `discuss`, every participant writes to the project and to the wiki only in its own workspace. The workspace exists before that participant's first write and serves that participant alone. Workspace creation requires a version-controlled project at the lead's directory and fails with a named error otherwise. |
| P2  | A workspace holds the lead's project from the lead's current commit, with its own HEAD, index, and files. Nothing a participant does to those reaches another participant or the lead. |
| P3  | When the lead's directory holds a wiki clone, each workspace holds its own wiki clone whose history contains the lead clone's commit, checked out on the publish branch. Each clone fetches from and pushes to the lead clone's remote under the session's credentials. |
| P4  | A workspace runs the participant protocol's commands. The platform's CLIs are on `PATH` as they are for the lead. The repository's own session hooks run in the workspace, and this monorepo's workspace is ready before the participant's first command. |
| P5  | A participant's wiki writes publish from its own clone. A post-session publish lands every participant clone that holds unpublished commits: one outcome line per clone, no stop at the first failure, a non-zero exit when any clone fails, and a zero exit with a notice when there are no participant clones. |
| P6  | The `kata-agent` action publishes the lead's pre-run refresh before the session starts, so participants clone the refreshed board and the lead's clone is clean. After the session, under every outcome, it publishes the participant wikis, brings the lead's wiki current, and only then refreshes and publishes the lead's wiki, so the refreshed board includes the session's rows. Every post-session step runs under the session's credentials. |
| P7  | A caller that runs the harness directly can run the same publish after the session, and the harness action documentation shows the step. |
| P8  | No option, input, or default of `facilitate` and `discuss` makes participants write in one shared working tree. A directory option that remains on the two modes names where the lead works, not a tree participants share. A workspace never shows as a change in the lead's checkout. `supervise` keeps its single agent directory. |
| P9  | Workspaces stay in place when the session ends. The session's trace names each participant's workspace. Removal belongs to the caller, and the documentation names the removal step. |
| P10 | The harness docs and skill, both action READMEs, the Gemba pages that show facilitated sessions, the wiki publish docs, the kata-session skill, and its dispatch-discipline reference state that HEAD, index, and files are per participant. Every description of a directory shared by participants, including the `agent-cwd` input descriptions, is removed. The dispatch discipline keeps same-surface serialization. |

**Compatibility stance:** clean break. No option, alias, or default keeps
participants in one shared working tree.

Consequences on upgrade:

- A caller that relied on participants sharing the lead's working tree sees a
  participant's project changes only in that participant's workspace or on the
  branch it pushes.
- A caller that runs the harness directly and does not add the post-session
  publish loses every participant wiki write that did not publish during the
  session. The harness action README names the step.
- Workspace creation in a lead directory that is not a version-controlled
  project is refused.
- A lead's uncommitted project changes do not reach the workspaces.
- A session with N participants creates up to N working trees and N wiki
  clones. This monorepo's storyboard runs seven.
- A participant whose repository defines a Stop hook that publishes the wiki
  may publish its own clone during the session. The post-session publish then
  reports nothing to push for that clone, and lands any clone whose hook
  publish failed.
- A participant refusal in the post-session publish fails that step, so a
  storyboard operator sees a red run where today the lead's single push
  decided it.
- A local caller accumulates workspaces until it removes them. The
  documentation names the step.

## Scope

### Included

| Component | What changes |
| --------- | ------------ |
| `gemba-harness facilitate` and `discuss` | P1 to P3, P8, P9. |
| The post-session participant publish | P5. |
| `gemba-harness` action | P7 and P8. |
| `kata-agent` action | P6 and P8. |
| This monorepo's session hooks | P4: a workspace of this repository is ready before the participant's first command. |
| `kata-setup` | Only the repository configuration a downstream installation needs for P3 to P5 and P8. |
| kata-session skill and dispatch-discipline reference | P10. |
| `gemba-harness` skill and its CLI reference, `gemba-harness` action README, `kata-agent` action README, the Gemba coordinate-team and prove-changes pages, the `gemba-wiki` skill's push and pull section, the `libwiki` and `libharness` READMEs, the Gemba wiki-operations page | P7, P9, P10. |

### Excluded

| Excluded | Why |
| -------- | --- |
| `run` and `supervise` modes | One agent per process. |
| The lead's own directory | One actor. |
| libwiki's write-path semantics in one clone | Tracked by #2093 and #2070. This spec restores the one-checkout-per-session precondition those semantics assume. |
| Stale reads in a shared tree (the closed #2165 and #2166, kata-skills#26's read-side half) | Each participant pulls its own clone. The team protocol's pull-before-claim stays. |
| A lock, lease, or mutex over the workspace | Spec 2010 non-goal. Isolation removes the shared surface instead of guarding it. |
| A `tree_ops` edit-intent class (kata-skills#26 request 2) | With HEAD, index, and files per participant, a tree operation touches no shared surface. |
| A hook that rejects HEAD-moving commands, or HEAD-stamped tree reports (kata-agent#4 options 2 and 3) | Both act inside the shared tree. The tree is the defect. |
| Token minting inside the harness | The harness holds no App key. The wiki action mints per step. |
| The `kata-implement` worktree mandate | Unchanged. It works from a workspace. |
| The `gemba-wiki` action | Unchanged. |
| A participant that writes into the lead's checkout by path (#2056's criterion) | Isolation gives each participant its own directory. A deliberate write elsewhere is a protocol violation, and the kata-session skill states the rule. |

## Relation to spec 2010

Spec 2010 removed the whole-tree staging sweep (L1) and serializes same-surface
asks at the facilitator (L2). Both stay. L1's own-artifact staging now runs in
a tree that holds only the participant's artifacts. L2 still orders edits to
shared wiki rows (claims, STATUS) that collide at the remote whatever the
local topology. Spec 2010's design assumed the facilitated session ran in a
shared checkout; this spec removes that assumption.

## Success criteria

| #   | Claim | Verification |
| --- | ----- | ------------ |
| S1  | Each participant that writes runs in a distinct copy of the lead's project from the lead's commit. | Run `gemba-harness facilitate` with three profiles and one write ask to each. The trace names three distinct workspaces, and in each `git merge-base --is-ancestor <lead HEAD at session start> HEAD` exits 0. |
| S2  | A participant's tree operations do not reach another participant. | Run `git reset --hard` and check out a new branch in one workspace; a second workspace's uncommitted file and `git status` are unchanged. |
| S3  | Each workspace holds its own wiki clone from the lead clone's commit. | Each workspace holds `wiki/.git` on the publish branch, whose history contains the lead clone's HEAD at session start and whose `origin` URL equals the lead clone's. |
| S4  | A workspace of this repository is ready before the participant's first command. | In a fresh workspace of this monorepo, the repository's preparation exits 0 and reports the workspace ready. |
| S5  | The post-session publish lands every participant wiki and reports each. | With a row appended to its own weekly log in two participant clones, and in a third clone an edit to a prose line that the remote changed after the clone, the publish lands the two rows, reports the third clone's conflict, prints one line per clone, and exits non-zero. |
| S6  | The post-session publish handles a session with no participant clones. | With no participant clones, the publish prints the notice and exits 0. |
| S7  | The lead's checkout carries no participant change. | After S1's session, `git status --porcelain` in the lead's directory and in its wiki clone lists no path a participant wrote and no workspace, and the lead's HEAD equals its HEAD at session start. |
| S8  | The harness names the workspaces without breaking the trace stream. | With no `--output`, every stdout line parses as NDJSON, and the trace names each participant's workspace. |
| S9  | Workspace creation refuses a lead directory that is not a version-controlled project. | Workspace creation for a lead directory that holds no repository exits non-zero and names the precondition. |
| S10 | The help for the two session modes describes no shared participant directory. | `gemba-harness facilitate --help` and `gemba-harness discuss --help` describe no directory shared by participants, and `gemba-harness supervise --help` lists `--agent-cwd`. |
| S11 | The `kata-agent` action publishes in the required order. | Read the action's wiki steps: before the session, the refresh then its publish; after the session, in order, the participant publish, the lead pull, the refresh, and the lead publish, every post-session step guarded for every outcome. |
| S12 | No `agent-cwd` input description says participants share the directory. | `rg -n 'agent-cwd' products/gemba/actions/gemba-harness products/kata/actions/kata-agent`: no description hit says participants share or write in that directory. |
| S13 | No published surface describes a shared participant directory. | `rg -n -i 'shared checkout\|shared by (the )?participant\|share one checkout\|shared tree\|shared-workspace\|share .--agent-cwd' .claude/skills/kata-session .claude/skills/gemba-harness .claude/skills/gemba-wiki products/gemba/actions products/kata/actions libraries/libwiki/README.md libraries/libharness/README.md websites/gemba` returns no match. |
| S14 | The documentation shows the post-session publish step and the removal step. | Read the harness action README and the harness skill's CLI reference: each shows the publish step, and the harness docs name the removal step. |

Post-deployment validation target, not an acceptance gate: a `kata-storyboard`
run on this monorepo completes with seven participants after the release
chain lands, and its log shows one publish line per participant that wrote
before the lead's post-session refresh.
