# Plan 1650 — Outpost data-residency landing-page subsection

Executes [design-a.md](design-a.md) for [spec](spec.md).

## Approach

Two files change: add the residency `###` subsection to the Outpost landing page
before Getting Started, and create the SC5 traceability table in this spec's
directory. No product code changes. The subsection's prose maps one block per
success criterion (SC1–SC7) per the design's content table; the traceability
table grounds every declarative sentence against the verified surfaces in the
design's grounding map.

Libraries used: none.

## Step 1 — Add the residency subsection to the landing page

Insert a new `### Where your data lives` section into
`websites/fit/outpost/index.md`, after the `### Prerequisites` block (ending at
the closing ``` ``` of the JSON example, line 69) and before the `---` separator
(line 71) that precedes `## Getting Started`. This places it inside
`## How Outpost Works`, above Getting Started (SC4).

Files: modified `websites/fit/outpost/index.md`.

Insert this content between line 69's closing fence and line 71's `---`:

```markdown

### Where your data lives

Outpost runs on your Mac and keeps your data on it. This answers where your
context lives, where AI calls go, and Forward Impact's role — a different
question from the `NODE_EXTRA_CA_CERTS` enterprise-CA note above.

**On-device storage.** Every place Outpost-handled content lands is on your
device:

- The knowledge base at the path you pass to `npx fit-outpost init`, including
  the `drafts/` directory inside it where drafted emails are written.
- Outpost's cache directory (`~/.cache/fit/outpost/`), holding synced mail and
  calendar content and each agent's per-wake output.
- Apple Mail's local store, which Outpost reads from.
- Apple Calendar's local store, which Outpost reads from. (See
  [Getting Started](#getting-started) for which accounts are picked up.)
- Outpost's scheduler home (`~/.fit/outpost/`) — config, runtime state, logs,
  and a local socket; the log and state files retain bounded excerpts of agent
  output.

**Where AI calls go.** Outpost delegates every AI call to the Claude Code CLI
already installed on your Mac; it does not select or override the endpoint. The
endpoint is therefore whichever provider your Claude Code is configured to reach
— by default the [Anthropic API](https://docs.claude.com/en/docs/claude-code/settings).
Each call's prompt carries the user content the agent assembled for that wake
(knowledge-graph excerpts, synced mail and calendar content).

The model endpoint is not the only egress. Agents in the default install
templates also make outbound calls beyond it: scheduled scans of public sources,
and browser automation that sends messages through your chat web apps.

**Forward Impact's role.** The Outpost product runs no Forward Impact-operated
server that processes your content — it is a local scheduler around your own
Claude Code installation, and AI calls reach the provider you configured
(Anthropic by default), not Forward Impact.

**Regulated workloads.** No BAA, SOC 2 attestation, or enterprise
data-processing agreement exists for Outpost today. If your data is under a
regulated gate, run your own approval process before adopting it.

```

Verification: rendered subsection contains all five storage locations (SC1), the
three AI-call facts without env-var enumeration (SC2), the no-server + named
provider sentence (SC3), the heading above `## Getting Started` in source order
(SC4), a separate no-attestation paragraph (SC6), and the non-model egress
sentence naming both classes (SC7). `bunx fit-doc build --src=websites/fit
--out=dist` succeeds.

## Step 2 — Create the SC5 traceability table

Create `specs/1650-outpost-data-residency-landing/traceability.md` with one row
per declarative factual sentence in the subsection, per the design's grounding
map. Columns: Sentence · Grounding · Kind.

Files: created `specs/1650-outpost-data-residency-landing/traceability.md`.

Content:

```markdown
# Traceability — Spec 1650 residency subsection (SC5)

One row per declarative factual sentence in the `### Where your data lives`
subsection of `websites/fit/outpost/index.md`. Kind ∈ {path, subprocess,
doc URL, policy artefact, absence-surface}.

| Sentence | Grounding | Kind |
|---|---|---|
| KB at the `init` path holds the knowledge base and `drafts/`. | `products/outpost/src/agent-runner.js` (kbPath validated, spawn cwd); `products/outpost/templates/CLAUDE.md` (`drafts/` under KB) | path |
| Cache directory holds synced mail/calendar and per-wake output. | `products/outpost/src/outpost.js:151` (`~/.cache/fit/outpost`); `products/outpost/templates/CLAUDE.md` (`apple_mail/`, `apple_calendar/`, `state/`) | path |
| Outpost reads Apple Mail's local store. | `products/outpost/templates/CLAUDE.md` (`apple_mail/` cache subdir) | path |
| Outpost reads Apple Calendar's local store. | `products/outpost/templates/CLAUDE.md` (`apple_calendar/` cache subdir) | path |
| Scheduler home holds config, state, logs, socket; log/state retain bounded excerpts. | `products/outpost/src/outpost.js:147-150` (`~/.fit/outpost`); `products/outpost/src/state-manager.js:106-108` (`lastDecision`/`lastError`, `slice(0,200)`) | path |
| Outpost delegates AI calls to the local Claude Code CLI; selects no endpoint. | `products/outpost/src/agent-runner.js` (`#findClaude`; `#buildSpawnEnv` merges process + config env only) | subprocess |
| Default endpoint is the Anthropic API. | https://docs.claude.com/en/docs/claude-code/settings | doc URL |
| Each call's prompt carries assembled user content. | `products/outpost/src/agent-runner.js` (`-p "Observe and act."` spawn arg ~line 174; `kbPath` passed as spawn cwd ~line 185) | subprocess |
| Agents also make outbound calls beyond the model: public-source scans and chat browser automation. | `products/outpost/templates/.claude/skills/req-scan` (WebFetch public sources); `agent-runner.js:169` (`--chrome`) + `send-chat` skill | subprocess |
| No Forward Impact-operated server processes user content. | `products/outpost/src` — only a local Unix-socket IPC server, no network server | absence-surface |
| No BAA, SOC 2, or DPA exists for Outpost today. | `SECURITY.md`, `CONTRIBUTING.md` § security — no such commitment present | absence-surface |
```

Verification: the table has 11 rows — one per declarative factual sentence in
the Step 1 subsection (5 storage + 3 AI-call + 1 egress + 2 absence); framing
sentences (the lead and the "run your own approval process" instruction) carry
no row. Each grounding path/URL resolves to a real surface on `origin/main`;
each absence-surface row names a closed surface that genuinely lacks the claimed
commitment.

## Risks

- The Anthropic-API doc URL (`docs.claude.com/.../settings`) is an external
  surface the implementer cannot verify against the repo; confirm it resolves
  before committing, and if Claude Code's docs have relocated it, cite the
  current canonical settings/model-config page.
- SC1 location count: the committed spec names five locations (design § Note on
  SC1). This plan implements five. If the approver settles on four (dropping
  scheduler home), Step 1's fifth bullet and the corresponding traceability row
  are removed together — no other change.

## Execution

Single engineering agent, sequential: Step 1 then Step 2 (Step 2's rows
reference the exact sentences written in Step 1). Both are documentation edits;
no parallelism benefit.

— Staff Engineer 🛠️
