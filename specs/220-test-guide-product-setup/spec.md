# Test Guide Product Setup

## What

An automated test that uses the `claude` CLI binary to simulate a new developer
discovering and installing the Forward Impact Guide product by reading the
public website at www.forwardimpact.team — from a **clean project directory**,
not by cloning the monorepo.

## Why

Guide's documentation lives on the website. Before real users (or their AI
agents) try to install Guide, we need confidence that the published docs contain
enough information for an LLM to follow the setup flow end-to-end. This test
exercises that path: point Claude at the website, let it read the docs, then
have it install packages from npm, configure framework data, and assess the
experience.

The test deliberately avoids cloning the monorepo because that gives access to
all internal tooling, CLAUDE.md context, and Makefile targets. A real external
user would install packages from npm and follow the website docs.

## Scope

Five sequential prompts submitted to
`claude --print --output-format=stream-json`:

| Step | Prompt         | What it tests                                        |
| ---- | -------------- | ---------------------------------------------------- |
| 1    | `01-discover`  | Read product and getting-started pages               |
| 2    | `02-research`  | Read architecture, CLI, operations, schema docs      |
| 3    | `03-install`   | `bun init` + `bun install @forwardimpact/*` from npm |
| 4    | `04-configure` | `fit-pathway init`, validate, generate jobs & agents |
| 5    | `05-assess`    | Produce a structured assessment of the experience    |

## Output

Each step produces NDJSON stream output capturing every event:

- `logs/<step>.ndjson` — Full event stream (init, assistant, tool_use,
  tool_result, result)
- `logs/<step>.txt` — Extracted human-readable text
- `notes/<step>.md` — Claude's own written summaries

The `analyze.mjs` script processes all NDJSON logs and reports:

- Per-step cost, duration, token usage, and tool call counts
- Documentation URL coverage (which pages were fetched vs expected)
- Command coverage (which CLI commands were attempted)
- Tool usage distribution
- Error patterns and permission denials

## Success criteria

- Steps 1-2 produce accurate summaries of Guide's purpose and architecture
- Step 3 discovers which @forwardimpact packages are on npm and installs them
- Step 4 initializes framework data and generates job/agent definitions
- Step 5 produces a useful assessment with specific documentation gaps
- The analysis report identifies actionable improvements
