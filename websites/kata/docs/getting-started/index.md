---
title: "Getting Started: Your First Kata Shift"
description: "Install the Kata skill pack. Generate the shift workflow. Run one scheduled shift. Read the memory, traces, and pull requests it leaves behind."
---

Kata is an agent team that works your repository on a daily Plan-Do-Study-Act
cycle. This page takes you from a repository with no automation to one completed
shift you can read. Most of the work is the GitHub App registration.

## Prerequisites

- Node.js 22+ and npm
- A GitHub repository with Actions enabled, and admin rights on it
- An Anthropic API key, and Claude Code in your terminal
- The `apm` agent package manager and the authenticated `gh` CLI

## Install the packs

Kata ships agent profiles and skills. It ships no command-line tool of its own.
The commands a shift calls belong to [Gemba](https://www.gemba.team/), the
agent-runtime platform Kata runs on. Install both packs:

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

The `kata-setup` skill runs as a conversation. It assumes no roster and no
schedule, so answer each decision with intent. Accept the offered model and the
pack's own agent profiles for the first run.

| Decision      | What it settles                             | A good first answer     |
| ------------- | ------------------------------------------- | ----------------------- |
| Control plane | Who owns the App the agents act as          | Self-hosted, your own   |
| Roster        | Which agent profiles run each shift         | A short set, see below  |
| Timezone      | When the night, day, and swing shifts start | Your working timezone   |
| Wiki          | Whether agents share persistent memory      | Yes                     |

The skill writes `.github/workflows/agent-shift.yml`, which holds the whole
roster as one matrix. Storyboard, coaching, and dispatch workflows appear only
when you select the matching option. Every workflow pins its published action to
a full commit SHA, and a generated `.github/dependabot.yml` raises those pins. A
mutable tag would let the action change with no commit in your repository.

### Register the GitHub App

The agents act as a GitHub App, so you rotate no long-lived personal token.
Register it on the organization that owns the repository. Grant read and write
access to Contents, Pull requests, Issues, Discussions, and Workflows, plus
read-only Metadata. Install it. Then add the repository secrets `KATA_APP_ID`,
`KATA_APP_PRIVATE_KEY`, and `ANTHROPIC_API_KEY`. Confirm each one resolves with
`gh secret list` before the first run.

A hosted control plane replaces the App entirely. The workflows then mint a
short-lived token at run time, and the setup needs a `FIT_OIDC_URL` repository
variable instead of a private key.

## Pick a first roster

The matrix runs one agent at a time, so the roster length sets both the shift
duration and the spend. Start with the product manager, which triages the open
backlog, and the technical writer, which reviews docs and curates memory. Both
produce a readable result on a repository that holds no approved work yet.

Leave the engineering agent out of shift one. It implements from the approval
record in `wiki/STATUS.md`, and a repository with no approved row gives it
nothing to do. Its cell then finishes with no change. That is correct, and it
reads like a failure.

## Initialize shared memory

Open repository Settings and enable Wikis. Then create the first wiki page in
the web interface. GitHub creates no wiki git repository until one page exists.
Clone it into your working tree:

```sh
npx gemba-wiki init
```

Expect `init: wiki ready at <repo>/wiki`, with your repository's absolute
path. A warning that the clone failed means the
wiki repository is still absent, so create that page and try again. If you
skip this step, every shift still runs. Each agent's memory then dies with the
runner. See the
[Gemba wiki guide](https://www.gemba.team/docs/predictable-team/wiki-operations/)
for the command surface.

## Run one shift

```sh
gh workflow run "Agent: Shift"
gh run watch
```

The schedule fires the same workflow on its own, so trigger it by hand only on
day one. To halt every Kata workflow at once, set the `KATA_KILLSWITCH`
repository variable. Use any value other than empty, `0`, `false`, `no`, or
`off`.

## Read what the shift wrote

- **The Actions run.** Each matrix cell appends a cost table and uploads one
  `trace--<agent>` artifact of every turn and tool call. The
  [Gemba trace guide](https://www.gemba.team/docs/prove-changes/trace-analysis/)
  shows how to query it.
- **The wiki.** `wiki/<agent>.md` carries priorities and blockers, and
  `wiki/<agent>-<year>-W<week>.md` is the append-only log of the run.
  `wiki/MEMORY.md` carries cross-cutting priorities and active claims. Each
  skill run appends a row to `wiki/metrics/<skill>/<year>.csv`.
- **GitHub.** Look for labeled issues, and for any `fix/` or `spec/` branch
  pushed as a pull request.

## Verify

- **The run finished with a cost table.** Every matrix cell in the run summary
  reports tokens and spend.
- **Memory reached the wiki.** A weekly log file exists for each agent that ran,
  and it names the decision that agent made.
- **The roster and the pins match your intent.** The matrix lists the profiles
  you confirmed and no others, and every `uses:` line names a full commit SHA.

## What's next

<div class="grid">

<!-- part:card:../continuous-improvement -->
<!-- part:card:../continuous-improvement/agent-roster -->
<!-- part:card:../spec-to-shipped -->
<!-- part:card:../spec-to-shipped/approval-gates -->

</div>
