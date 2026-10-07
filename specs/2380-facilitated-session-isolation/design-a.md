# Design 2380-a: a workspace provisioner in the harness, a multi-clone publish in the wiki

Spec 2380 gives every facilitated-session participant its own workspace. This
design fixes which component creates the workspaces, what each holds, how the
participant wikis publish, and what the two actions pass.

## Component map

```mermaid
graph TD
    subgraph gemba-harness facilitate / discuss
        OPT["--workspaces-root<br/>(default: one temp root)"] --> PROV["WorkspaceProvisioner<br/>(GitClient + runtime injected)"]
        LEAD["lead directory<br/>checkout + wiki/ + node_modules + generated"] --> PROV
        PROV --> W1["root/&lt;profile-1&gt;<br/>worktree · wiki clone · shared deps"]
        PROV --> WN["root/&lt;profile-n&gt;<br/>worktree · wiki clone · shared deps"]
        PROV --> META["trace meta event<br/>workspacesRoot, workspaces"]
        W1 --> P1["participant 1 session<br/>(project hooks run)"]
        WN --> PN["participant n session"]
        LEAD --> LS["lead session"]
    end
    subgraph post-run (kata-agent, four wiki-action steps)
        PUB["push --workspaces-root root"] --> PULL["pull (lead)"] --> REF["refresh (lead)"] --> PUSH["push (lead)"]
    end
```

## Components

| Component                                | Home                                                           | Role after this design                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkspaceProvisioner`                   | `libharness` (new class; takes `GitClient` and `runtime`)      | For each participant name: a detached worktree of the lead's repository at HEAD under `root/<name>`, or a copy of the lead directory when it is not a repository. Reuses an existing worktree at that path. When `<lead>/wiki/.git` exists, clones it into the workspace, points `origin` at the lead clone's `origin` URL, and overlays the lead clone's working tree so uncommitted state arrives too. Links the lead's `node_modules` and `generated` into the workspace. Returns name to path. |
| `GitClient`                              | `libutil`                                                      | Gains `worktreeAdd` (detached, at a ref) and `remoteSetUrl`. The provisioner uses no other git path.                                                                                                                                                                                                                         |
| Temp-root helper                         | `libharness` commands                                          | One `mkdtemp` under `TMPDIR` with the `gemba-harness-` prefix. `supervise` and the two session modes call it.                                                                                                                                                                                                                 |
| `facilitate`, `discuss` command runners  | `libharness` commands                                          | Resolve `--workspaces-root` (default: the helper), call the provisioner with the lead directory (`--facilitator-cwd` in facilitate, the current directory in discuss), build one participant configuration per name with its own `cwd`, and skip provisioning for an empty participant list. The exported option parsers stay pure and synchronous. One participant-configuration builder serves both modes and keeps the per-mode rule (facilitate requires profiles, discuss does not). |
| Trace `meta` event                       | `libharness` orchestration                                     | Carries `workspacesRoot` and the name-to-path map. The same line goes to stderr. Stdout stays the NDJSON trace.                                                                                                                                                                                                             |
| Facilitator, Discusser                   | `libharness`                                                   | Unchanged. They read `config.cwd` per participant and pass `settingSources: ["project"]`, so each workspace runs the repository's hooks.                                                                                                                                                                                      |
| `gemba-wiki push --workspaces-root`      | `libwiki` push command, factory wired in the `gemba-wiki` bin  | Discovers `root/*/wiki/.git`, builds one `WikiSync` per clone through an injected factory (`wikiDir`, `parentDir`, the shared `resolveToken`), pins the transport rule on each clone, and runs the same commit-and-push as the bare command. Prints `push[<name>]: <outcome>` in the existing outcome vocabulary. Continues past a failure and exits non-zero when any clone failed. An empty or absent root exits zero with `push: no participant workspaces`. The option is exclusive with `--wiki-root`, and the bin's no-wiki guard does not apply to it. |
| `gemba-harness` action                   | `products/gemba/actions/gemba-harness`                         | Drops `agent-cwd` from the `facilitate` and `discuss` invocations and passes `--workspaces-root`. Gains the `workspaces-root` input (default under `runner.temp`) and output, set for the two modes only. Keeps `agent-cwd` for `supervise`. Its README shows the post-session publish step.                                   |
| `kata-agent` action                      | `products/kata/actions/kata-agent`                             | Passes `workspaces-root` through. Post-run, for the two modes with wiki on: a wiki-action step `push --workspaces-root=<root>`, then `pull`, then the existing `refresh` and `push`. Every step is `if: always()` and mints its own token. `agent-cwd` is documented for `supervise` only.                                     |
| kata-session skill and dispatch discipline | `.claude/skills/kata-session`                                | State that each participant has its own HEAD, index, files, and wiki clone, and that refs and stash are shared. Keep edit-intent and same-surface serialization for shared wiki rows. Remove every shared-checkout phrase.                                                                                                     |
| Docs and skills                          | `gemba-harness` skill CLI reference, both action READMEs, Gemba coordinate-team and prove-changes pages, `gemba-wiki` skill publish section, `libwiki` README, Gemba wiki-operations page | Describe the workspace per participant, the root option and output, the publish flag, the Stop-hook interplay, and the removal step (`rm -rf <root>` then `git worktree prune`). |

## Data flow: one facilitated session in CI

```mermaid
sequenceDiagram
    participant A as kata-agent action
    participant H as gemba-harness facilitate
    participant P as WorkspaceProvisioner
    participant S as participant sessions
    participant W as gemba-wiki (one step each)
    A->>H: --workspaces-root=$RUNNER_TEMP/… --agent-profiles=a,b,c
    H->>P: provision(lead, root, [a,b,c])
    P-->>H: {a, b, c} → paths; meta event emitted
    H->>S: one session per participant, cwd = its workspace
    Note over S: project hooks run: session start links deps, pulls wiki;<br/>Stop hook may publish the clone early
    S-->>H: answers
    A->>W: push --workspaces-root=root
    W-->>A: push[a]: committed and pushed · push[b]: nothing to push · push[c]: refusal
    A->>W: pull
    A->>W: refresh
    A->>W: push
```

## Key decisions

| Decision                          | Choice                                                                                                                             | Rejected                                                                                                                                       | Why                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Isolation unit for the project    | A detached git worktree of the lead's repository; a directory copy when the lead directory is not a repository.                    | A shared-object clone. An empty temporary directory as in `supervise`. Extending the benchmark `WorkdirManager`.                               | A worktree costs seconds, shares objects, and keeps participant branches visible to the lead. A clone hides them and depends on the source's garbage collection. An empty directory holds no project. `WorkdirManager` seeds from a staging directory and manages ports and process groups for benchmark cells; it produces no git working tree. The copy keeps sandbox evaluations working. |
| Shared git surfaces               | Objects, branches, remote-tracking refs, and stash are shared. HEAD, index, and files are not.                                     | A clone per participant to separate refs too.                                                                                                  | The incidents were HEAD, index, and file clobbers. Shared refs are the property that lets the lead see participant branches. Two workspaces cannot hold one branch, and participants create their own.                                                                               |
| Default and option shape          | Isolation is the only behaviour. `--agent-cwd` is removed from the two modes. `--workspaces-root` names where workspaces live.     | Keep `--agent-cwd` as an opt-in shared mode. A list-valued `--agent-cwd` aligned with `--agent-profiles` (#2085).                              | The shared default was the defect. A positional list couples two flags and shares by default. A root is the one thing a caller legitimately chooses.                                                                                                                                 |
| Wiki per participant              | A local clone of the lead's wiki clone with the lead's remote, plus an overlay of the lead clone's working tree.                   | A symlink to the lead's wiki. A git worktree of the wiki. A fresh clone from the remote. Committing the lead's pre-run refresh before provisioning. | A symlink keeps the shared-tree hazard. libwiki publishes `master` and refuses a detached HEAD, so two worktrees cannot both hold it. A remote clone costs N network clones and a credential in the harness. The overlay carries the pre-run refresh, which the lead writes without a commit, without changing the refresh contract. |
| Toolchain in a workspace          | Link the lead's `node_modules` and `generated` into each workspace.                                                                | Run the bootstrap per workspace. Ship the CLIs on `PATH` only.                                                                                 | Participants load project settings, so this repository's session-start hook runs in every workspace and installs when the tree is absent: N installs. A link makes that hook report the tree present and skip. CLIs alone leave `bunx gemba-xmr` unresolved.                           |
| Who publishes participant wikis   | The caller, after the session, through `gemba-wiki push --workspaces-root`. A repository Stop hook may publish a clone earlier.    | The harness shells out to `gemba-wiki` at session end. Rely on Stop hooks alone. A caller loop over `push --wiki-root <ws>/wiki`.              | A long session outlives the job-start token, and the wiki action mints a fresh one per step. Stop hooks exist only where a repository defines them and run under the job-start token; the post-session publish is the durable path and is idempotent over clones a hook already pushed. A caller loop is N steps, N mints, and no aggregate exit. |
| Post-run order in `kata-agent`    | Participant publish, lead pull, refresh, lead push. Four wiki-action steps.                                                        | Keep refresh before the push step. One step that runs two commands.                                                                            | The refresh renders XmR blocks from the lead's CSVs. Participant rows reach the lead only through the remote, so the publish and the pull must precede it. The wiki action runs one command per step and mints per step.                                                               |
| Lead directory                    | Unchanged, the caller's directory.                                                                                                 | A workspace for the lead as well.                                                                                                              | One actor moves HEAD there.                                                                                                                                                                                                                                                          |
| Workspace lifetime                | Workspaces persist after the harness exits.                                                                                        | The harness removes workspaces at session end.                                                                                                 | The publish runs after the harness exits. Removal before it loses memory.                                                                                                                                                                                                            |
| Reporting channel                 | A trace `meta` event plus a stderr line.                                                                                           | A stdout line. A `workspaces.json` manifest.                                                                                                   | Stdout is the NDJSON trace when `--output` is absent. The `meta` event is the existing run-metadata idiom. The publish discovers clones by layout, so a manifest would have no reader.                                                                                                |
| Publish failure semantics         | Continue past a failing clone. Exit non-zero when any failed. Zero with a notice for an empty root.                                 | Stop at the first failure. Exit zero with per-clone lines only. Fail on an empty root.                                                         | One participant's conflict must not strand the others' memory. A zero exit would hide the refusal. The kata-agent step runs under `always()` in every mode, and a `run`-mode job has no workspaces.                                                                                   |
| Same-surface serialization        | Spec 2010 L2 stays.                                                                                                                | Drop it, since trees are isolated.                                                                                                             | Edits to shared wiki rows still collide at the remote. Isolation removes the tree hazard; L2 removes the ordering hazard.                                                                                                                                                            |

## Removals

| Removed                                                                                                                     | Home                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `--agent-cwd` on `facilitate` and `discuss`, and the "shared by participants" help text                                    | `gemba-harness` CLI definition                       |
| The scalar `cwd` parameter, its "shared working directory for all agents" docstring, and the duplicate builder in `discuss` | `libharness` commands                                |
| The per-mode `mkdtemp` in `supervise`                                                                                       | `libharness` commands (the shared helper replaces it) |
| `agent-cwd` from the `facilitate` and `discuss` invocations                                                                 | `gemba-harness` action                               |
| Every shared-checkout phrase the spec's S11 pattern names                                                                   | kata-session skill and reference, `gemba-harness` skill CLI reference, both action READMEs, Gemba coordinate-team and prove-changes pages |
| Test fixtures that pass `agent-cwd` to the two session parsers                                                              | `libharness` tests                                   |

## Contracts outside the components

- The facilitator's and discusser's per-participant `cwd` read is unchanged.
- libwiki's commit-and-push semantics in one clone are unchanged. Each
  participant clone is one session under the contract libwiki documents.
- The `gemba-wiki` action is unchanged. Its `command` input carries the flag.
- The repository's worktree hook places a nested worktree under the primary
  checkout. A participant's `kata-implement` worktree lands there.
- The release chain: the `gemba` package carries both CLI changes; a gear
  release ships the binaries; `gemba-bootstrap` repins the gear release; the
  `gemba-harness` action and then the `kata-agent` action repin; consumers
  repin `kata-agent`.

## Risks

| Risk                                                                                      | Mitigation                                                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| N worktrees and N wiki clones cost disk and time on a large repository.                   | A worktree shares objects. The wiki is small. The plan measures this monorepo's seven-participant session.              |
| The lead's wiki clone is shallow in CI, so the participant clones are shallow too.        | libwiki's publish path already handles a shallow clone.                                                                 |
| A participant's Stop-hook publish and the post-session publish both touch one clone.       | The second finds nothing to push, or lands what the first left local.                                                  |
| A linked dependency tree is shared read-only state.                                       | Participants install nothing. A skill that must install runs in a nested worktree.                                      |
| Test churn: the two session parsers' fixtures, new provisioner tests, a multi-clone publish test. | One pass in the implementation.                                                                                  |
