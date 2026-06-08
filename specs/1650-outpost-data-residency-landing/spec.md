# Spec 1650 — outpost landing page answers data-residency before getting started

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Empowered Engineer carrying regulated-industry data (pharma, healthcare, finance) | [Be Prepared and Productive](../../JTBD.md#empowered-engineers-be-prepared-and-productive) | The Anxiety force named in this job — *"Delegating awareness to a system feels like losing control"* — has a specific shape for this buyer class: the question *where does my context end up* is the load-bearing facet of "losing control." Today's Outpost landing page does not answer it. The Big Hire is reachable only after the buyer leaves the page to ask elsewhere, which converts the landing page from a hire-the-product surface into a redirect-and-wait surface for this buyer class. |

## Problem

The Outpost landing page describes Outpost as a background AI task system
that builds a knowledge graph and drafts email responses *"using your full
context."* It does not, on the page, answer the three questions a
regulated-industry buyer asks before the install step:

1. Where does the knowledge graph live — on this device, or a cloud
   service?
2. Where do AI calls go — which endpoint, and what data travels with
   each call?
3. Does Forward Impact offer a BAA, SOC 2, or enterprise stance, or is
   the product not appropriate for regulated workloads?

The `NODE_EXTRA_CA_CERTS` hint in the Prerequisites section gestures at
enterprise networking, which is a different question from data
residency. The page treats data flow as implicit; the regulated buyer
needs it explicit and *before* the install command.

The blocker landed in `kata-interview run-8` (an Outpost user-testing
session against the Empowered Engineers persona — engineering manager at
a Phase-3 oncology pharma company) against the supported platform — not
as a platform gap. The same shape applies to any healthcare or
financial-services buyer whose data class is in-scope of an external
gate.

### Why the landing page is the right surface

Three facts about Outpost as shipped already determine the answer to all
three questions. The page does not surface them.

| Question | What Outpost does today | Where the buyer can see it |
|---|---|---|
| Where does the knowledge graph live? | The per-agent knowledge graph lives at the KB path the user passes to `npx fit-outpost init`. Outpost's on-disk cache of synced user content (mail, calendar, chat extracts, per-agent triage state) lives under the Outpost cache directory. Email and calendar inputs come from Apple Mail and Apple Calendar's local stores; the landing page already discloses that any account synced inside those apps (an IMAP'd Gmail account, a CalDAV-synced Google Calendar) is picked up. (Outpost's own operational files — scheduler config, state, logs, socket — are stored separately and are not part of the residency answer.) | Not surfaced as a data-flow story; the residency framing is missing even though the IMAP/CalDAV pickup point already exists in the Getting Started callout. |
| Where do AI calls go? | Outpost delegates AI calls to the user's locally installed Claude Code CLI; the subprocess sends prompts to whichever endpoint the user's Claude Code installation is configured to reach. The default endpoint is the Anthropic API; alternative endpoints (Bedrock, Vertex, custom proxies) are reached when the user has configured Claude Code accordingly. Outpost itself does not select or override the endpoint. | Not surfaced on the landing page. |
| Forward Impact's data-processing role? | The Outpost product does not run a Forward Impact-operated server that processes user content; it is a local scheduler around the user's own Claude Code installation. Forward Impact does ship hosted services elsewhere in the catalog (Kata bridges, Guide stack), but Outpost itself is not one of them. | Not surfaced on the landing page. |

The product already has a defensible answer. The page does not deliver
it.

### Why a small landing-page change is the right shape

The same `kata-interview run-8` session surfaced three other
landing-page findings on the same buyer journey (#1500 platform
constraint — merged via PR #1504; #1502 `brew install claude` ordering
— closed; #1503 read-only brief vs. draft-on-behalf separation — spec
1640 in flight). Two were mechanical reorders; #1503 is a product
change. The data-residency finding sits between those: factual, not a
product change, but load-bearing enough that omitting it on the
landing page determines whether the buyer reaches the install step at
all.

The triage call on Issue #1501 — *"product-aligned spec, tight scope.
The architecture already supports a defensible answer; the page just
doesn't surface it"* — names that shape. This spec captures it.

## Scope

### In scope

| Component | What changes |
|---|---|
| The Outpost landing page. | A new subsection answers the three data-residency questions above with text that is factually accurate to the as-shipped architecture, carrying the on-device storage entities, the Claude Code subprocess data path, and Forward Impact's role. The subsection is distinguishable from the existing `NODE_EXTRA_CA_CERTS` enterprise-networking note, which addresses a different question. The same subsection carries an explicit suitability statement for regulated workloads. The position of the subsection within the page is a success-criterion concern (SC4), not an in-scope claim. |

### Out of scope

- **A standalone data-handling guide page.** The landing-page subsection
  is the surface the user-testing blocker landed on; a longer guide
  page can follow if a downstream finding surfaces the need. This spec
  does not commit to one.
- **A BAA program, SOC 2 attestation, or enterprise data-processing
  agreement.** None exist today; the spec does not assume they will.
  Wording must match shipped artefacts.
- **Changes to the landing page's hero, "What becomes possible," or
  "Core Skills" sections.** The finding is about data flow, not
  capabilities or value proposition. The other sections are unchanged.
- **Changes to other product landing pages.** Map, Pathway, Guide,
  Landmark, and Summit may have analogous gaps but a different
  data-flow shape (Guide ships a hosted service stack; others differ).
  A separate spec covers each surface when its user-testing or audit
  signal lands.
- **Configuration changes, code changes, or new product surfaces.**
  The architecture already supports the answer; the spec is a
  documentation change against the existing landing-page surface.
- **A `--data-policy` or similar CLI surface on `fit-outpost`.** The
  landing page is the surface a buyer reads before install; CLI
  surfaces are out of scope.
- **Changes to how Outpost spawns Claude Code, what arguments it
  passes, or which endpoint Claude Code uses.** The spec describes the
  shipped behavior; it does not modify it.
- **Outpost's own log files, scheduler config, runtime state file, and
  Unix socket.** These live alongside the scheduler home directory on
  disk but hold operational data, not user content the regulated buyer
  asks about; SC1's closed set excludes them.

## Decisions

**Factual where-data-lives subsection chosen over a "not suitable for
regulated workloads" disclaimer-only approach.** The architecture
supports the factual answer; the disclaimer-only path would understate
what is shipped and lose the buyer class the page should appeal to. The
boundary rule: every sentence in the subsection corresponds to a
shipped artefact (code path, install command, runtime configuration, or
published policy) that a reader can verify.

**Subsection placed before Getting Started.** The user-testing finding
lands the Anxiety force *before* install consideration. A buyer who
reads install commands first and discovers the data question later has
already paid the install-decision cost on incomplete information. The
placement claim is graded by SC4; this decision records the rationale.

**Longer guide page deferred to a separate spec when a follow-on signal
lands.** Bundling a longer guide here would expand scope past the
surfaced finding.

**Data residency, not enterprise networking.** The existing
`NODE_EXTRA_CA_CERTS` Prerequisites note covers enterprise networking
(CA trust). The new subsection covers data residency (where data lives,
where AI calls go, what travels with them). The two notes coexist; the
spec adds the second without modifying the first.

**Scope of SC1 follows what the landing page advertises.** SC1's
closed set covers the on-device locations for the data sources the
landing page currently advertises as Outpost capabilities (Apple Mail
and Apple Calendar via the Core Skills section). The Outpost cache
directory holds other synced-content subdirectories (e.g.,
`teams_chat/`) that ship with the install templates but are not yet
advertised on the landing page; expanding the Core Skills table to
advertise an additional source must also extend SC1's closed set,
under a follow-on spec or as part of the same change.

**Reuse existing landing-page disclosures.** Where the landing page
already discloses a relevant fact (e.g., that any account synced inside
Mail.app or Calendar.app — including an IMAP'd Gmail or a CalDAV-synced
Google Calendar — is picked up), the data-residency subsection links
or quotes the existing disclosure rather than authoring a parallel
phrasing. This is an editorial preference for the implementing change,
not a success-criterion gate.

## Success criteria

| SC | Claim | Verification |
|---|---|---|
| SC1 | The regulated-industry buyer can name where Outpost's on-device user content lives without leaving the landing page. | A reviewer reading the rendered subsection finds at least these four named locations, scoped to the data sources the landing page itself advertises (today: Apple Mail and Apple Calendar via the Core Skills section): (1) the KB path the user passes to `npx fit-outpost init`; (2) Outpost's on-disk cache directory for synced user content; (3) the upstream Apple Mail local store Outpost reads from; (4) the upstream Apple Calendar local store Outpost reads from. The cache landing path (2) and the upstream read sources (3, 4) are distinct items and the reviewer counts them separately. Outpost's operational files (logs, scheduler config, state, socket) need not appear and do not count as residency answers if they do. |
| SC2 | The regulated-industry buyer can name where Outpost's AI calls go without leaving the landing page. | A reviewer reading the rendered subsection finds two facts stated: (i) Outpost delegates AI calls to the user's local Claude Code installation and does not itself select or override the endpoint; (ii) the endpoint is therefore whichever provider the user's Claude Code is configured to reach (default: the Anthropic API). The subsection does not enumerate Claude Code's env vars or provider-specific configuration mechanisms — those belong to Claude Code's own documentation. |
| SC3 | The regulated-industry buyer can name Forward Impact's data-processing role without leaving the landing page. | A reviewer reading the rendered subsection finds two distinct claims stated within the subsection itself: (i) the Outpost product does not run a Forward Impact-operated server that processes user content; (ii) at least one third-party provider Claude Code reaches by default is named within the subsection (so the buyer does not read claim (i) as "no third-party server"). Claim (ii) may reuse the provider name that satisfies SC2(ii); SC3 still grades a distinct claim sentence inside the subsection. |
| SC4 | The data-residency subsection appears before the Getting Started heading in the page's reading order. | In the source Markdown of the Outpost landing page, the subsection's heading appears above the `## Getting Started` H2 and below the page's hero block. The heading level (H2 sibling vs. H3 nested under "How Outpost Works") is a design-phase choice and is not graded by SC4. |
| SC5 | Every factual claim in the subsection is traceable to a shipped artefact. | The implementing PR description carries a mapping table with one row per declarative sentence in the subsection. Each row pairs the sentence with either a specific path Outpost reads or writes, a specific subprocess Outpost spawns, a specific URL on Claude Code's published documentation, or a specific Forward Impact policy artefact. A row whose artefact column is empty, or whose artefact is a vague gesture without a path or URL, fails SC5. |
| SC6 | The subsection carries an explicit suitability statement for regulated workloads, structurally distinct from the SC3 data-processing-role claim. | A reviewer reading the rendered subsection finds at least one sentence that names whether the product is suitable for regulated workloads and why (or under what gate the buyer must apply). The suitability sentence appears in a paragraph or top-level list item separate from the SC3 sentences so a reviewer can highlight it independently. (Traceability to a shipped artefact, including the no-BAA/SOC 2/DPA-unless-shipped constraint, is covered by SC5 for every sentence in the subsection; SC6 does not duplicate that gate.) |

## Provenance

- Issue #1501 — `kata-interview run-8` user-testing finding, regulated-industry
  Empowered Engineer persona (pharma R&D / Phase-3 oncology).
- Sibling cluster from the same session: #1500 (closed via PR #1504),
  #1502 (closed), #1503 (spec 1640 / PR #1508 in flight).
- JTBD.md § Empowered Engineers — Be Prepared and Productive (the
  Anxiety force matches the persona's blocker shape).
- Outpost landing page (surface the spec changes).
- Outpost product surfaces relevant to the residency answer: the
  user-specified KB path passed to `init`, the Outpost on-disk cache
  directory, the upstream Apple Mail and Apple Calendar local stores,
  and the Claude Code subprocess Outpost spawns when an agent wakes.
