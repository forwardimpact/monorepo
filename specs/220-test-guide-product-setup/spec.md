# Test Guide Product Setup

## What

An automated test that uses the `claude` CLI binary to simulate a new user
discovering and installing the Forward Impact Guide product by reading the public
website at www.forwardimpact.team.

## Why

Guide's documentation lives on the website. Before real users (or their AI
agents) try to install Guide, we need confidence that the published docs contain
enough information for an LLM to follow the setup flow end-to-end. This test
exercises that path: point Claude at the website, let it read the docs, then have
it clone, install, configure, and verify Guide.

## Scope

Five sequential prompts submitted to `claude -p`:

| Step | Prompt            | What it tests                                       |
| ---- | ----------------- | --------------------------------------------------- |
| 1    | `01-discover`     | Read product and getting-started pages               |
| 2    | `02-deep-dive`    | Read architecture, CLI reference, operations docs    |
| 3    | `03-install`      | Clone the monorepo and install dependencies          |
| 4    | `04-configure`    | Run `make quickstart` to bootstrap env, data, config |
| 5    | `05-verify`       | Start services and verify end-to-end functionality   |

## Test workspace

The runner script (`run.sh`) creates a workspace **outside** the monorepo at
`/home/user/guide-setup-test/`. Each step writes notes and logs to that
workspace so results are inspectable after the run.

## Success criteria

- Steps 1-2 produce accurate summaries of Guide's purpose and architecture
- Step 3 successfully clones and installs dependencies
- Step 4 bootstraps the environment without manual intervention
- Step 5 starts services and gets a response from the agent (TEI/vector
  failures are acceptable in minimal environments)
