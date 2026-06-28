# Traceability — Spec 1650 residency subsection (SC5)

One row per declarative factual sentence in the `### Where your data lives`
subsection of `websites/fit/outpost/index.md`. Kind ∈ {path, subprocess,
doc URL, policy artefact, absence-surface}. Framing sentences (the lead and the
"run your own approval process" instruction) carry no row.

| Sentence | Grounding | Kind |
|---|---|---|
| KB at the `init` path holds the knowledge base and `drafts/`. | `products/outpost/src/agent-runner.js` (kbPath validated, passed as spawn cwd); `products/outpost/templates/CLAUDE.md` (`drafts/` under KB) | path |
| Cache directory holds all synced source content and per-wake output. | `products/outpost/src/outpost.js:151` (`~/.cache/fit/outpost`); `products/outpost/templates/CLAUDE.md` (`apple_mail/`, `apple_calendar/`, `teams_chat/`, `state/`) | path |
| Outpost reads Apple Mail's local store. | `products/outpost/templates/CLAUDE.md` (`apple_mail/` cache subdir) | path |
| Outpost reads Apple Calendar's local store. | `products/outpost/templates/CLAUDE.md` (`apple_calendar/` cache subdir) | path |
| Scheduler home holds config, state, logs, socket; log/state retain bounded excerpts. | `products/outpost/src/outpost.js:147-150` (`~/.fit/outpost`); `products/outpost/src/state-manager.js:106-108` (`lastDecision`/`lastError`, `slice(0,200)`) | path |
| Outpost delegates AI calls to the local Claude Code CLI; selects no endpoint. | `products/outpost/src/agent-runner.js` (`#findClaude`; `#buildSpawnEnv` merges process + config env only, never injects an endpoint) | subprocess |
| Default endpoint is the Anthropic API. | <https://docs.claude.com/en/docs/claude-code/settings> | doc URL |
| Each call's prompt carries assembled user content. | `products/outpost/src/agent-runner.js` (`-p "Observe and act."` spawn arg ~line 174; `kbPath` passed as spawn cwd ~line 185) | subprocess |
| Agents also make outbound calls beyond the model: public-source scans and chat browser automation. | `products/outpost/templates/.claude/skills/req-scan` (WebFetch public sources); `agent-runner.js:169` (`--chrome`) + `products/outpost/templates/.claude/skills/send-chat` | subprocess |
| No Forward Impact-operated server processes user content. | `products/outpost/src` — only a local Unix-socket IPC server (`socket-server.js`), no network server | absence-surface |
| No BAA, SOC 2, or DPA exists for Outpost today. | `SECURITY.md`, `CONTRIBUTING.md` § security — no such commitment present | absence-surface |

— Staff Engineer 🛠️
