# Spec 1930 — Gear page job-card coverage

## Persona and job

Hired by **Platform Builders** to find the shared library or service
that covers a capability before building it themselves — the Gear
product page is the marketed entry point for that search. Secondarily
hired by **Empowered Engineers**, whose libraries-tier job (*Operate a
Predictable Agent Team*, served by `libwiki` and `libxmr`) the Gear
catalog claims but the page never surfaces.

Related JTBD: *Platform Builders — Build Agent-Capable Systems*
([JTBD.md](../../JTBD.md)); *Empowered Engineers — Operate a
Predictable Agent Team* (libraries catalog § Jobs To Be Done).

## Problem

The Gear product page's "What becomes possible" section presents a
card grid under a single **For Platform Builders** heading. The
libraries catalog's Jobs To Be Done block — generated from each
library's `package.json`, so it is the catalog's own source of truth
for who hires what — lists **twelve** Platform Builder jobs and **one**
Empowered Engineers job. The page surfaces six cards:

| Catalog job (Platform Builders) | On the page? |
|---|---|
| Enable Agents on Every Surface | yes |
| Ground Agents in Context | yes |
| Integrate with the Engineering Standard | yes |
| Keep Service Contracts Typed | yes |
| Keep Services Running and Visible | yes |
| Prove Agent Changes | yes |
| Bridge Threaded Channels to the Agent Team | no |
| Ground Service Contracts in One Source | no |
| Keep Instruction Layers Honest | no |
| Ship Predictable CLIs | no |
| Ship Predictable Services | no |
| Ship Service Endpoints Without Boilerplate | no |

The Empowered Engineers job — *Operate a Predictable Agent Team* — is
absent entirely, and so is its persona heading.

Two distinct gaps follow:

- **Audience-coverage gap.** Product-page conventions
  (`websites/CLAUDE.md` § Product Pages) organize "What becomes
  possible" by persona; the convention itself states only the
  exclusion direction ("only personas with a relevant outcome
  appear"), so surfacing a persona that *does* have an outcome is a
  product call — and this spec makes it. The catalog claims an
  Empowered Engineers outcome; the page presents Gear as a
  Platform-Builders-only product. A reader hiring for agent-team
  memory or signal-vs-noise charting (`libwiki`, `libxmr`) finds
  nothing addressed to them on a marketed surface.
- **Job-coverage gap.** Six of twelve Platform Builder jobs — and the
  eight libraries that serve them (`libbridge`, `libproto`,
  `libcoaligned`, `libpreflight`, `libhttp`, `librpc`, plus `libwiki`
  and `libxmr` on the Empowered Engineers side) — are unmarketed on
  the product page. No documented selection rule exists for the
  six-card subset — neither on the page nor in the websites
  conventions — so the gap reads as propagation lag from a generated
  catalog, not as deliberate curation.

A third, smaller weakness compounds both: all six existing cards link
to the same section-top anchor of the libraries catalog, so even a
surfaced job's card does not land the reader on that job's entry.

### Recurrence

The finding was recorded as a deferred item at the 2026-06-09
product-pages review cycle and has been carried as a standing
deferred finding since, then storyboard-routed as the second
deferred-structural item of target condition TW-3 (Issue #1693). A
standing deferral consumes review-slot attention at each touching
pass without converging — the same shape that motivated the
structural route on spec 1460.

## Proposal (the product call)

The Gear page's job cards mirror the libraries catalog's Jobs To Be
Done block — completely, and grouped by persona:

- Every job in the libraries catalog's generated JTBD block surfaces
  as a card, with the job's goal as the card heading, verbatim — one
  card per job, no card without a job.
- Cards sit under per-persona headings following the product-page
  convention, ordered **For Platform Builders** first (Gear's primary
  persona per the page's situation framing), then **For Empowered
  Engineers**. The Platform Builders group keeps its existing
  persona-level framing copy; the Empowered Engineers group gets new
  framing copy in the same register — a persona-level progress
  statement derived from its job's Big Hire, per product-page
  convention item 3.
- Each card links to its own job's entry in the libraries catalog —
  the anchor GitHub generates for that job's `## <Persona>: <Goal>`
  heading — not the shared section top.
- Card body copy stays in the page's current register: one to two
  sentences of progress framing derived from the job's Big Hire, not
  a paste of the catalog text.

Full mirroring (rather than a curated subset) is the deliberate call:
the JTBD block is generated from package metadata, so any curation
layer on top of it would be a second hand-maintained selection — the
exact drift topology this page has already demonstrated. If a future
product decision wants curation, it must arrive as its own spec with
a documented selection rule.

## Scope

### In scope

- The "What becomes possible" section of the Gear product page: card
  set, persona headings, per-card links.
- Persona ordering and the persona-level framing copy, only as far as
  adding the Empowered Engineers group requires.

### Excluded

- **The libraries catalog JTBD block itself.** It is generated from
  `package.json` metadata; this spec treats it as the source of truth
  and changes nothing in it.
- **Service-tier jobs.** The services catalog lists jobs of its own
  (several shared with the libraries catalog, plus service-only
  entries such as token minting and tenant resolution). Whether those
  warrant cards on the Gear page is a separate product call; the
  page's card grid is anchored to the libraries catalog today and
  stays so under this spec.
- **The library/service count sentence** ("N libraries and M
  services"). Count drift is registry topic 2 of spec 1460 and is not
  re-solved here.
- **Drift enforcement.** A build-time assertion that the card set
  matches the generated JTBD block is a natural seventh registry
  topic for the spec 1460 gate; registering it is deferred until that
  gate lands. Issue #1693 is the tracking artifact: the follow-up is
  recorded there at this spec's PR-open announcement, so the deferral
  has an owner and a surface after this spec closes.
- **Hero, Getting Started, and all other page sections.** Accepted
  residual tension: the hero subtitle and meta description keep their
  "platform builders and agents" framing beside the new Empowered
  Engineers group; rewording marketed hero copy is a separate product
  call.
- **Other product pages** and the services/libraries hub pages under
  the docs tree.

## Success criteria (landing gate)

| Claim | Verifies via |
|---|---|
| Every job goal in the libraries catalog's generated JTBD block appears verbatim as a card heading on the Gear page | Extract the `goal` attributes from the catalog's `<job>` tags; each one matches a `###` card heading on the page, one card per job |
| The Empowered Engineers persona group is present with framing copy | The page contains a "For Empowered Engineers" heading followed by persona-level progress prose before its card grid, with the *Operate a Predictable Agent Team* card beneath it |
| No card exists without a catalog job | Each `###` card heading inside the "What becomes possible" grids matches some `goal` attribute in the catalog's JTBD block (no orphan or invented cards) |
| Each card links to its own job's catalog entry | Every card's link target ends in the GitHub heading slug of that job's generated `## <Persona>: <Goal>` heading (lowercase, punctuation stripped, spaces to hyphens); the verifier derives each expected slug from the catalog's `<job>` attributes and compares — hand-written links are not build-checked, so this check is the gate |
| Card body copy is framing, not catalog paste | No card body sentence is a verbatim substring of the catalog's JTBD block; each card body is one to two sentences — register against the job's Big Hire checked in review |
| Persona names and ordering match the proposal | The persona headings are exactly "For Platform Builders" then "For Empowered Engineers", in that order, using canonical persona names from JTBD.md |
| The page builds clean | `fit-doc` build of the fit site exits 0 with the change applied |
| The page still follows product-page conventions | Hand-written `<a>` cards are used only for these external (GitHub) links, and body headings remain at `##`/`###` — checked in review against `websites/CLAUDE.md` § Product Pages |

## Outcome metric (post-landing, not a landing gate)

Owned by the `kata-documentation` rotation, per Issue #1693:

- **Target.** Zero `errors_found` rows in the kata-documentation
  metrics series citing the Gear jobs-coverage gap across the next
  two `product-pages`/`reference` rotation passes after the change
  reaches `main`.
- **Falsifier.** A post-merge rotation pass re-defers or re-files the
  Gear jobs-coverage finding.
- **Verdict horizon.** First `product-pages` rotation pass on or
  after the change reaching `main`; verdict recorded on Issue #1693.

— Technical Writer 📝
