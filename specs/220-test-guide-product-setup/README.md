# Guide Product Setup Test

Automated test that uses the `claude` CLI to simulate a new developer
discovering and installing the Forward Impact Guide product by reading the
public website — from a **clean project**, not by cloning the monorepo.

## Usage

```sh
./run.sh              # Run all steps
./run.sh 3            # Run from step 3 onwards
./run.sh 2 2          # Run only step 2
./run.sh --analyze    # Analyze existing ndjson logs
```

## What it tests

1. **Discovery** — Can Claude read the website and understand what Guide is?
2. **Research** — Can Claude learn the architecture and requirements from docs?
3. **Install** — Can Claude install Guide packages from npm in a clean project?
4. **Configure** — Can Claude set up framework data and generate agent profiles?
5. **Assess** — Can Claude produce an accurate assessment of the experience?

## Output

Each step produces two log files:

- `logs/<step>.ndjson` — Full ndjson stream from
  `claude --output-format=stream-json`
- `logs/<step>.txt` — Extracted human-readable text

The analysis script processes all ndjson files and reports:

- Per-step cost, duration, tool calls, and error counts
- Documentation URL coverage (which pages were fetched)
- Command coverage (which CLI commands were tried)
- Tool usage distribution
- Error patterns

## Design

The test deliberately installs from npm, not from the monorepo source. This
tests what a real external user would experience. If Guide can't be installed as
a standalone package, the test surfaces that gap.
