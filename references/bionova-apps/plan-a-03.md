# Plan Part 03 — Edge Functions and the Shared Handler Layer

Implement the four Deno edge functions under
`services/polaris-functions/` and the eight surface-agnostic handlers
under `products/polaris/handlers/`. All paths are relative to the
`bionova-apps/` repo root.

## Edge-function behavior contracts

Kong serves the functions at `/functions/v1/{name}`. One router
dispatches to each function's module; a health path answers liveness.

| Function | Contract |
| --- | --- |
| `embed-seed` | Reads the mounted embeddings JSONL, embeds each conditions row through TEI, and upserts into `condition_embeddings` through PostgREST with `on_conflict` on the unique index from part 02. Idempotent: a repeat run adds no rows |
| `eligibility-check` | Pure scorer over the trial's single `criteria` row, with no LLM. Score rules: any exclusion match returns `not_eligible`; all inclusion criteria met returns `eligible`; an unknown inclusion answer with no exclusion failure returns `possibly_eligible`; otherwise `not_eligible`. Returns the score plus per-criterion reasons |
| `notify-updates` | A pg_net trigger on `trials.status` change invokes it through Kong with the service-role key read from a database setting. It logs a would-notify stub; email delivery stays deferred |
| `sync-listings` | A pg_cron schedule invokes it. It re-reads the staged trials and criteria seed SQL from a read-only mount and upserts every row through PostgREST. A `dry_run` flag returns counts without writes |

## Security posture

The shipped functions implement this posture; keep it on a rebuild:

- Request bodies are capped at 1 MiB. The cap is enforced on the
  declared length and again while streaming, so an understated
  `Content-Length` cannot slip an oversized body through. A breach
  returns 413.
- Every other error surfaces as a generic 500 with no internal detail.

## Handler shapes

Handlers accept a frozen `InvocationContext { data, args, options }` and
return plain data. No handler renders output, and no handler hand-authors
patient-facing copy: every prose field reads a terrain-generated seed
table.

| Handler | CLI command / web route | Returns |
| --- | --- | --- |
| `searchTrials` | `search` / `/search` | Matching trials via `match_conditions` for plain-language queries, with catalog fallback and phase, status, and location filters |
| `showTrial` | `trial <id>` / `/trials/:id` | The trial with criteria, sites, and conditions, plus `faq` and `consentSummary` prose |
| `showCondition` | `condition <id>` / `/conditions/:id` | The condition plus its `explainer` prose |
| `checkEligibility` | `eligibility <id>` / `/trials/:id/eligibility` | The edge-function score plus reasons; inserts one `interest_signals` row |
| `listSites` | `sites` / `/sites` | Sites with an optional specialty filter, each with its `description` prose |
| `listStories` | `stories` / `/stories` | Patient stories with an optional condition filter |
| `showAbout` | `about` / `/about` | Static about metadata (read from a YAML path the host can override, C7) plus the `therapies` prose list |
| `manageTrial` | `admin trial <id>` / `/admin/trials/:id` | The trial plus interest-signal aggregates; a patch mode updates an allowlisted field set through PostgREST with the staff JWT, and the handler requires a token |

## Template layer

`libtemplate` loads the shared markdown templates through the handlers
package's exported templates-dir. The CLI renders them with `libformat`;
the web surface renders React directly and uses neither. `libformat` is
not a handler dependency.

## Verification

- Per-function curl checks pass against the booted stack.
- A repeat `embed-seed` run adds no rows.
- A status UPDATE on a trial fires the pg_net trigger, and the
  would-notify line appears in the function logs.
- The cron table lists the `sync-listings` schedule.
- Handler tests pass offline with an injected fetch, and both surfaces
  return identical data for the same handler call.
- The handlers unit imports `libtemplate`'s entry symbol.

— Staff Engineer 🛠️
