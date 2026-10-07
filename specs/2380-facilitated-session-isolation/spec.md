# Spec 2380: Every participant in a facilitated session works in its own workspace

**Classification:** product. The change lands on the published `gemba-harness`
CLI and action, the `kata-agent` action, the `gemba-wiki` publish command, and
the kata-session skill.

**Persona and job:** Teams Using Agents. The primary job is Gemba's
[Stand Up and Operate an Agent Team](../../JTBD.md#teams-using-agents-stand-up-and-operate-an-agent-team):
run sessions and persist memory. The storyboard and coaching sessions serve
Kata's
[Run a Continuously Improving Agent Team](../../JTBD.md#teams-using-agents-run-a-continuously-improving-agent-team),
whose anxiety force reads "autonomy might amplify bad patterns faster than
humans can intervene".

## Problem

### One directory for every participant

`gemba-harness facilitate` and `gemba-harness discuss` run a lead and N
participants in one process. Both commands take one `--agent-cwd` value,
default `.`, and stamp it on every participant. The help text states the
consequence: "Working directory shared by participants". The facilitator and
the discusser already read a per-participant working directory from each
participant's configuration and fall back to the lead's directory only when
it is absent. The producer never fills it. `supervise`, the one-agent sibling,
already mints a fresh temporary directory per run when no directory is given.

| Surface                               | Participant directory today                                   |
| ------------------------------------- | ------------------------------------------------------------- |
| `gemba-harness facilitate`, `discuss` | One value for all participants, default `.`                   |
| `gemba-harness supervise`             | A fresh temporary directory per run                           |
| `gemba-harness` action                | `agent-cwd` input, default `.`, passed to all three modes     |
| `kata-agent` action                   | `agent-cwd` input, default `.`, forwarded to the action above |

### This is the shape of every facilitated session we ship

This monorepo's `kata-storyboard.yml` runs `discuss` with the improvement coach
and seven participants in one checkout. `kata-setup` writes
`agent-storyboard.yml` and `agent-coaching.yml` templates downstream with the
same shape. A scheduled shift runs one profile per job through a matrix, so it
has its own checkout. Every incident below is on the facilitated path and none
is on the matrix path.

### Measured

Issues
[forwardimpact/kata-agent#4](https://github.com/forwardimpact/kata-agent/issues/4),
[#5](https://github.com/forwardimpact/kata-agent/issues/5),
[forwardimpact/kata-skills#26](https://github.com/forwardimpact/kata-skills/issues/26),
and this repository's #2084 and #2085 report the same mechanism from two
installations, one month apart.

| Observation                                                                                                                                 | Source                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| One participant's reflog shows a peer's branch switch, rebase, abort, and `Reset to origin/main` between its own commits, with files open.   | kata-agent#4                  |
| A peer's reset deleted a participant's uncommitted file. The next commit failed on an unmerged path that participant never touched.         | kata-agent#4, #5              |
| Six files staged by five agents sat in one index. A bare commit would have published five peers' half-written logs under one author.       | kata-skills#26                |
| Three participants committed from the same parent within two minutes under one bot identity.                                                | kata-agent#5                  |
| A hand-rolled commit from the shared wiki tree, 86 commits behind the remote, deleted 1096 lines across 25 files. I verified it in that wiki. | #2167, kata-agent#6           |
| Agents in the shared tree worked around it with a throwaway index and `commit-tree`, and pushed a SHA rather than HEAD.                      | kata-skills#26                |
| 890 of 895 sessions on one installation ran through a workflow that calls `gemba-harness` directly, not through `kata-agent`.               | #2084                         |

### Why the protocol cannot close it

Spec 2010 serializes shared-workspace writes by declared paths: a participant
names the paths it will stage, and the facilitator holds a same-surface ask
until the prior one returns. HEAD, the index, and the working tree are not
paths. `checkout`, `rebase`, `reset`, and `stash` rewrite all three. Two
participants with disjoint declared paths are permitted to run at once, and
one replaces the other's tree. libwiki's write path documents one checkout per
session as its precondition, and a facilitated session violates it by
construction. Participants boot, read memory, and triage an inbox in the
shared tree before any skill-level mandate can fire, so a convention inside
the tree cannot close the window. The `kata-implement` skill already mandates
a worktree for implementation work. Participants in a session have no
equivalent.

## Proposal

| #   | What changes                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | In `facilitate` and `discuss`, every participant runs in its own workspace. The harness creates it before the session starts and hands it to that participant alone.                                                                                 |
| P2  | A workspace is a full working tree of the lead's project at the lead's current commit, with its own HEAD and index. Nothing a participant does to its HEAD, index, or files reaches another participant or the lead.                                   |
| P3  | When the lead's directory holds a wiki clone, each workspace holds its own wiki clone at the same commit, with the same remote and transport configuration.                                                                                           |
| P4  | A participant's wiki writes publish from its own clone. The wiki publish command can publish every participant wiki under one workspaces root: one outcome line per clone, no stop at the first failure, and a non-zero exit when any clone fails.    |
| P5  | The `kata-agent` action publishes the participant wikis in its post-run push step, with the fresh token that step already mints, and then publishes the lead's wiki as today.                                                                        |
| P6  | The shared-directory option is removed from `facilitate` and `discuss`. A caller may name the root under which workspaces are created. `supervise` keeps its single agent directory.                                                                   |
| P7  | Workspaces stay in place when the session ends. The harness reports the root. Removal belongs to the caller.                                                                                                                                           |
| P8  | The harness docs, both action READMEs, the kata-session skill, and its dispatch-discipline reference state that HEAD and index are per participant. The "shared checkout" wording is removed. The dispatch discipline keeps same-surface serialization. |

**Compatibility stance:** clean break. The shared-directory option is removed
from the two session modes with no alias.

Consequences on upgrade:

- A caller that passes the removed option to `facilitate` or `discuss` gets an
  unknown-option error. The two actions stop forwarding it for those modes.
- A session with N participants creates N working trees and N wiki clones.
  This monorepo's storyboard runs seven.
- A participant workspace carries the project files and the CLIs on `PATH`.
  It carries no installed dependency tree.
- The change ships through the release chain: the `gemba` CLI package, then
  the `gemba-harness` action, then the `kata-agent` action, then consumer
  repins.

## Scope

### Included

| Component                                                               | What changes                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `gemba-harness facilitate` and `discuss`                                | P1, P2, P3, P6, P7.                                                   |
| The participant configuration the facilitator and discusser consume     | Carries a workspace per participant. The consumers are unchanged.    |
| `gemba-wiki push`                                                       | P4.                                                                   |
| `gemba-harness` action                                                  | P6 inputs and the workspaces root as an output.                      |
| `kata-agent` action                                                     | P5 and P6.                                                            |
| kata-session skill, dispatch-discipline reference, kata-setup templates | P8. The templates pass no participant directory.                      |
| Docs: `gemba-harness` README and action README, `kata-agent` README, the Gemba harness page | P8.                                               |

### Excluded

| Excluded                                                   | Why                                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run` and `supervise` modes                                | One agent per process. `supervise` already isolates.                                                                                                     |
| The lead's own directory                                   | One actor. Its wiki is the post-run push target today, and that stays.                                                                                   |
| libwiki's write-path semantics in one clone                | Tracked by #2093 and #2070. This spec restores the one-checkout-per-session precondition those semantics assume.                                          |
| A lock, lease, or mutex over the workspace                 | Spec 2010 non-goal. Isolation removes the shared surface instead of guarding it.                                                                         |
| A `tree_ops` edit-intent class (kata-skills#26 request 2)  | With HEAD and index per participant, a tree operation touches no shared surface. There is nothing to declare.                                            |
| A hook that rejects HEAD-moving commands, or HEAD-stamped tree reports (kata-agent#4 options 2 and 3) | Both act inside the shared tree. The tree is the defect.                                                                      |
| Token minting inside the harness                           | The harness holds no App key. The post-run step already mints a fresh token for the publish.                                                              |
| The `kata-implement` worktree mandate                      | Unchanged. It nests inside the participant's workspace.                                                                                                  |

## Relation to spec 2010

Spec 2010 removed the whole-tree staging sweep (L1) and serializes same-surface
asks at the facilitator (L2). Both stay. L1's own-artifact staging now runs in
a tree that holds only the participant's artifacts. L2 still orders edits to
shared wiki rows (claims, STATUS) that collide at the remote whatever the
local topology. Spec 2010's design placed the facilitated session in a shared
checkout; this spec replaces that placement.

## Success criteria

| #   | Claim                                                                                             | Verification                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Each participant runs in a distinct working tree of the lead's project at the lead's commit.      | Run `gemba-harness facilitate` with three profiles and no workspace option. The trace records three distinct participant directories. In each, `git rev-parse --show-toplevel` equals that directory and `git rev-parse HEAD` equals the lead's HEAD at session start. |
| S2  | A participant's tree operations do not reach another participant.                                 | In one workspace run `git reset --hard` and `git checkout` of another ref. An uncommitted file in a second workspace is unchanged, and its `git status` is unchanged.                                                                     |
| S3  | Each workspace holds its own wiki clone when the lead has one.                                    | With `wiki/.git` present in the lead's directory, each workspace holds `wiki/.git`, its `origin` URL equals the lead clone's, and its HEAD equals the lead clone's HEAD at session start.                                                |
| S4  | The publish command publishes every participant wiki under a root and reports each.              | Write one row in two participant clones and leave a rebase conflict in a third. Run the publish command with the root. The two rows land on the remote, the third clone reports a refusal, the output has one line per clone, and the exit code is non-zero. |
| S5  | The shared-directory option is gone from the two session modes and kept on `supervise`.           | `gemba-harness facilitate --agent-cwd x` and `gemba-harness discuss --agent-cwd x` exit non-zero with an unknown-option message. `gemba-harness supervise --agent-cwd x` accepts the option.                                             |
| S6  | The harness reports the workspaces root.                                                          | The command's output names the root, and the root holds one directory per participant.                                                                                                                                                  |
| S7  | The `kata-agent` action publishes participant wikis with a fresh token.                           | The action's post-run push step runs the workspaces publish before the lead's publish, under the token minted in that step. The `agent-cwd` input description names `supervise` only.                                                     |
| S8  | This monorepo's storyboard session runs under the change.                                         | A `kata-storyboard` run completes with seven participants. Its log shows one publish line per participant and the lead's publish.                                                                                                       |
| S9  | No published surface describes a shared participant checkout.                                     | `rg -n 'shared checkout|shared by participants' .claude/skills/kata-session .claude/skills/gemba-harness products/gemba products/kata websites/gemba` returns no match.                                                                   |
| S10 | The help for the two session modes shows the workspaces option and no shared-directory option.    | `gemba-harness facilitate --help` and `gemba-harness discuss --help` list the workspaces root option and do not list `--agent-cwd`.                                                                                                      |
