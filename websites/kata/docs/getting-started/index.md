---
title: "Getting Started: Your First Kata Shift"
description: "Install the Kata skill pack, generate the shift workflow, and run one scheduled shift. Then read the memory, traces, and pull requests it leaves behind."
---

Kata is an agent team that works on your repository in a daily
Plan-Do-Study-Act cycle. This page takes you from a repository with no
automation to one completed shift that you can read. Most of the work is the
GitHub App registration.

## Prerequisites

- Node.js 22+ and npm
- A GitHub repository with Actions enabled, and admin rights on it
- An Anthropic API key, and Claude Code in your terminal
- The `apm` agent package manager and the authenticated `gh` CLI

## Install the packs

Kata ships agent profiles and skills, but no command-line tool of its own. The
commands that a shift calls come from [Gemba](https://www.gemba.team/), the
agent-runtime platform that Kata runs on. Install both packs:

```sh
apm install forwardimpact/kata-skills
apm install forwardimpact/gemba-skills
```

The install writes agent profiles under `.claude/agents/` and skills under
`.claude/skills/`. Each shift installs the Gemba commands on the runner.

## Run the setup skill

```sh
echo "Set up the Kata Team" | claude
```

The `kata-setup` skill runs as a conversation. It starts with no roster and no
schedule, so think about each decision before you answer. For the first run,
accept the offered model and the pack's own agent profiles.

| Decision      | What it decides                             | A good first answer     |
| ------------- | ------------------------------------------- | ----------------------- |
| Control plane | Who owns the App the agents act as          | Self-hosted, your own   |
| Roster        | Which agent profiles run each shift         | A short set, see below  |
| Timezone      | When the night, day, and swing shifts start | Your working timezone   |
| Wiki          | Whether agents share persistent memory      | Yes                     |

The skill writes `.github/workflows/agent-shift.yml`, which holds the whole
roster as one matrix. It also writes `.github/workflows/watchdog.yml`, which
engages `KATA_KILLSWITCH` when the team's activity crosses a threshold. The
storyboard, coaching, and dispatch workflows appear only when you select the
matching option. Every workflow pins its published action to a full commit
SHA, and a generated `.github/dependabot.yml` updates those pins. With a mutable
tag, the action could change without a commit in your repository.

### Register the GitHub App

The agents act as a GitHub App, so you do not need to rotate a long-lived
personal token. Register the App on the organization that owns the repository.
Grant it read and write access to Contents, Pull requests, Issues, Discussions,
Workflows, and Variables, plus read-only access to Metadata and to organization
Variables. The watchdog needs Variables write access to engage the killswitch.
Install it. Then add the repository secrets `KATA_APP_ID`,
`KATA_APP_PRIVATE_KEY`, and `ANTHROPIC_API_KEY`. Before the first run, confirm
that each secret exists with `gh secret list`.

A hosted control plane replaces the App. The workflows then get a short-lived
token at run time, and the setup needs a `FIT_OIDC_URL` repository variable
instead of a private key.

## Pick a first roster

The matrix runs one agent at a time, so the number of agents sets both the
shift duration and the cost. Start with the product manager, which triages the
open backlog, and the technical writer, which reviews docs and curates memory.
Both produce a readable result on a repository that has no approved work yet.

Leave the engineering agent out of the first shift. It implements work from the
approval record in `wiki/STATUS.md`, and a repository with no approved row
gives it nothing to do. Its matrix cell then finishes with no change. That
result is correct, but it looks like a failure.

## Initialize shared memory

Open the repository Settings and enable Wikis. Then create the first wiki page
in the web interface, because GitHub does not create the wiki git repository
until one page exists. Clone it into your working tree:

```sh
npx gemba-wiki init
```

Expect `init: wiki ready at <repo>/wiki`, with your repository's absolute
path. A warning that the clone failed means the wiki repository does not exist
yet, so create that page and try again. If you skip this step, every shift
still runs, but each agent's memory is lost when the runner stops. See the
[Gemba wiki guide](https://www.gemba.team/docs/predictable-team/wiki-operations/)
for the full set of commands.

## Run one shift

```sh
gh workflow run "Agent: Shift"
gh run watch
```

The schedule runs the same workflow on its own, so start it manually only on
the first day. To stop every Kata workflow at once, set the `KATA_KILLSWITCH`
repository variable to any value other than empty, `0`, `false`, `no`, or
`off`.

## Read what the shift wrote

- **The Actions run.** Each matrix cell adds a cost table to the run summary
  and uploads one `trace--<agent>` artifact with every turn and tool call. The
  [Gemba trace guide](https://www.gemba.team/docs/prove-changes/trace-analysis/)
  shows how to query it.
- **The wiki.** `wiki/<agent>.md` holds the agent's priorities and blockers,
  and `wiki/<agent>-<year>-W<week>.md` is the append-only log of the run.
  `wiki/MEMORY.md` holds cross-cutting priorities and active claims. Each
  skill run appends a row to `wiki/metrics/<skill>/<year>.csv`.
- **GitHub.** Look for labeled issues, and for any `fix/` or `spec/` branch
  that was pushed as a pull request.

## Verify

- **The run finished with a cost table.** Every matrix cell in the run summary
  reports tokens and cost.
- **Memory reached the wiki.** A weekly log file exists for each agent that ran,
  and it records the decision that agent made.
- **The roster and the pins match your choices.** The matrix lists only the
  profiles you confirmed, and every `uses:` line has a full commit SHA.

## What's next

<div class="grid">

<!-- part:card:../continuous-improvement -->
<!-- part:card:../continuous-improvement/agent-roster -->
<!-- part:card:../spec-to-shipped -->
<!-- part:card:../spec-to-shipped/approval-gates -->

</div>
