# Plan 1230-a — Part 06: Documentation, protocol edit, Kata App webhook subscription

Documentation-only follow-on after Parts 02–05 land. Updates the
coordination protocol, kata-setup references, and the Kata GitHub App
webhook subscription guidance to reflect the new runtime mechanism. This
part touches **no** wiki memos — agent summaries are agent-owned per
memory-protocol.

Libraries used: none.

## Step 6.1 — Coordination protocol: runtime-mechanism note

Modified: `.claude/agents/references/coordination-protocol.md`.

After the existing "## Discussion ownership and termination" section
(around line 211), add a new subsection:

```md
### Runtime mechanism

Discussion events reach the agent team via `services/ghbridge`, not directly
via the dispatch workflow. The bridge stores per-thread state (history,
participants, open RFCs, lead) in `libindex` JSONL and re-dispatches the
workflow when a recess trigger fires. RFC long-running coordination is
expressed via the libeval `discuss` mode's `Recess` and `RequestForComment`
tools — the agent team should treat a Discussion the same way regardless of
whether it spans one workflow run or 14 days of recesses.
```

The narrative `agent-react` mentions elsewhere in this file were already
flipped to `kata-dispatch` in Part 03 Step 3.7 — Part 06 only adds the new
subsection.

Verify: `grep -i discussion .claude/agents/references/coordination-protocol.md` still returns the existing RFC and routing rows (matches spec § Success criteria row 12); `grep -F "### Runtime mechanism" .claude/agents/references/coordination-protocol.md` returns one match.

## Step 6.2 — Kata App webhook subscription guidance

Modified: `.claude/skills/kata-setup/references/github-app.md`.

The current file (lines 1–60 verified on `main`) instructs the operator to
"Disable the webhook (uncheck 'Active') — events are handled by GitHub
Actions triggers" at step 3 of "Register the App". Replace that step with:

```md
3. Enable the webhook. **Webhook URL** = `${GHBRIDGE_PUBLIC_URL}/api/webhook`.
   **Webhook secret** = a random 32-byte hex string (also set as
   `APP_WEBHOOK_SECRET` on the ghbridge process). Discussion events are
   served by `services/ghbridge`; other events still reach GitHub Actions
   via their own triggers and need no webhook URL.
```

Add a new subsection "## Webhook events" listing the two subscriptions
(`Discussion`, `Discussion comment`) — keep the existing "## Event
Subscriptions" list for the GitHub Actions trigger events (Issue comment,
PR review, PR review comment) and add a one-line note clarifying which
events reach the App webhook vs. the Actions triggers.

Modified: `.claude/skills/kata-setup/SKILL.md` — add a step instructing the operator to deploy `services/ghbridge` before flipping the App webhook URL. Reference the ghbridge README from Part 05.

Verify: `grep -F "ghbridge" .claude/skills/kata-setup/references/github-app.md` returns at least one match; `grep -F "Disable the webhook" .claude/skills/kata-setup/references/github-app.md` returns empty (the line is replaced wholesale, not qualified).

## Step 6.3 — README cross-links

Modified:
- `services/README.md` — under "Catalog", remove the `msteams` row and add `ghbridge` + `msbridge` rows. (Parts 04 and 05 each touch this file for their own rows; Part 06 confirms the merged result is consistent — if both prior parts have already landed clean entries, Step 6.3 is a no-op for this file.)
- `libraries/README.md` — under "Catalog", add `libbridge` row with the JTBD copy from `libraries/libbridge/package.json`. (Part 01 Step 1.1 created the package; this step exposes it in the catalog.)
- `websites/fit/docs/libraries/` — add an `libbridge/` index page following the sibling shape (single index page).
- `websites/fit/docs/services/index.md` (or equivalent navigation file) — make sure both bridges appear.

Verify: `just check` passes (the docs-link gate the implementer should run; no `bun run docs:check` script exists in `package.json`).

## Step 6.4 — JTBD entries

Modified: `JTBD.md`.

Add a row under "Teams Using Agents":

| Job | Hire |
|---|---|
| Maintain one agent team across multiple threaded channels | `kata-skills` + `libbridge` + `services/ghbridge` + `services/msbridge` |

Verify: `grep libbridge JTBD.md` returns the new row.

## Step 6.5 — KATA.md narrative

Modified: `KATA.md`.

`agent-react` / `agent-team` literal references were rewritten in Part 03
Step 3.7. This step only adds a one-paragraph "Threaded channels"
subsection pointing at `services/ghbridge` and `services/msbridge` and the
libeval `discuss` mode. No duplicate workflow renames here.

Verify: `git diff KATA.md` shows only the new "Threaded channels" subsection (no churn on the workflow-name lines, which Part 03 already fixed).

## Notes for the implementer

- All edits in this part are reversible — the human operator's manual
  step (App settings UI) is the only out-of-tree change and it is captured
  in Step 6.2's documentation, not enforced by code.
- Route this part to `technical-writer` via `kata-implement` — the work
  is purely documentation.
- Do **not** write to wiki memos in this part. Each agent's weekly log is
  agent-owned (per `.claude/agents/references/memory-protocol.md`) and
  edited by that agent's own session, not by the technical-writer
  documentation pass.
