# spec(1120): pathway first-visit dismissible banner

## Problem

The Pathway web UI root route drops engineers directly into entity counts,
explore cards, and "Build Your Team" CTAs with no framing of what Pathway is or
how it should be read. The JTBD this product serves —
[Empowered Engineers: Understand Expectations](../../JTBD.md#empowered-engineers-see-whats-expected-of-humans-and-agents)
— names a specific anxiety:
*"Looking up the standard might confirm gaps easier left ignored."* Without an
orienting frame on first arrival, engineers infer purpose from interaction
patterns, and the surface (rankings, counts, role definitions) can read as
evaluation rather than reference.

This came to a head in
[discussion #1005](https://github.com/forwardimpact/monorepo/discussions/1005):
BioNova HR asked for a blocking acknowledgement modal — a "Before you begin"
screen with an
`[x] I understand that Pathway is a development reference, not a performance evaluation tool`
checkbox gating UI access. The copy they wrote is good — it lands Pathway's
positioning (reference, not evaluation; visibility, not grading; invitation to
challenge the standard) — but the modal mechanism contradicts the message.
@dickolsson accepted a first-visit dismissible banner as the product-aligned
alternative: same copy, no checkbox, no gate, "Got it" not "I acknowledge."

## Persona and job

- **User:** Empowered Engineers
- **Job:** Understand Expectations — *"Help me see exactly what's expected at
  my level so I stop guessing during reviews."*
- **Force this addresses:** Anxiety — *"Looking up the standard might confirm
  gaps easier left ignored."* The banner reframes that anxiety before the
  engineer interprets the page on their own.

## Scope

| In scope | Out of scope |
| --- | --- |
| Dismissible banner on the Pathway web UI root route (`/`) in the `@forwardimpact/pathway` package | Modal, overlay, or any UI element that gates content |
| Banner copy adapted from [discussion #1005](https://github.com/forwardimpact/monorepo/discussions/1005), HR-approved | A checkbox, acknowledgement input, or any compliance affordance |
| Dismiss action via a single "Got it" button | Server-side persistence, telemetry, or per-user tracking |
| The banner does not return after dismissal in the same browser | Re-show triggers (version bumps, content changes, etc.) — v1 is dismiss-once |
| Ships in `@forwardimpact/pathway` and reaches every installation by default | Installation-specific wrappers, BioNova-only customization, environment flags |
| Banner appears only on the root route (`/`) | Banner on entity detail pages, self-assessment flow, or other Pathway routes |
| Keyboard-reachable and screen-reader-perceivable dismissal | Re-styled or re-worded variants per installation |

## Banner copy

The banner displays the following content. Headings, bold labels, bullet lists,
and the paragraph render as ordinary typography. No checkbox. No legal
language. The dismiss control is a button labelled exactly `Got it`,
positioned after the closing paragraph — **the button is a UI affordance, not
text inside the copy.**

> ### Before you begin
>
> Pathway shows what the organization expects at each engineering level — so
> that 'meets expectations' has a definition everyone can point to.
>
> **What it is:**
>
> - A reference for understanding your current role and what changes at the
>   next level
> - A starting point for career conversations, not a replacement for them
>
> **What it is not:**
>
> - A performance evaluation tool — nothing you view is tracked or reported
> - A rigid checklist — roles describe expected proficiency, not pass/fail
> - The sole basis for promotion decisions — context and manager judgment
>   remain central
>
> **What to expect:**
>
> You will notice gaps. Everyone does, at every level. The purpose is to make
> them visible and discussable — not to grade you. If something doesn't match
> the role as you experience it, say so. The standard improves when people
> challenge it.
>
> Questions? Talk to your manager or your Developer Experience Lead.

The banner uses the source text verbatim, except: the legal-acknowledgement
checkbox line `[x] I understand that Pathway is a development reference, not a
performance evaluation tool.` is intentionally dropped — see § Problem.

## Behaviour

A *first visit* means a browser session in which no prior dismissal of this
banner has been recorded for the current origin.

| # | Behaviour |
| --- | --- |
| 1 | On the first visit to the root route (`/`), the banner is visible. |
| 2 | The banner is non-blocking — landing CTAs, the stats grid, and explore cards remain interactive while the banner is shown. |
| 3 | The banner has exactly one dismiss affordance: a button labelled `Got it`. |
| 4 | Activating `Got it` (by click or keyboard) hides the banner and records the dismissal so it does not re-appear in this browser. |
| 5 | On subsequent visits to the root route where dismissal is recorded, the banner does not render. |
| 6 | The banner is keyboard-reachable: `Tab` reaches the `Got it` button, and the button activates via `Enter` or `Space`. |
| 7 | Screen readers announce the `Before you begin` heading and the body copy when the banner appears. |
| 8 | Visiting any non-root route (e.g. `/discipline`, `/track/:id`) never shows the banner, regardless of dismissal state. |
| 9 | A user who clears site data sees the banner again on next visit — acceptable; nothing depends on the dismissal being durable. |

## Success criteria

| Claim | How to verify |
| --- | --- |
| First-time visitors to the root route see the `Before you begin` banner with the copy specified in § Banner copy. | Run `npx fit-pathway serve` (or `dev`) against any installation's data directory; open `http://localhost:<port>/` in a fresh browser profile; observe the banner. |
| The banner does not gate the page — landing content is interactive before dismissal. | With the banner visible, activate any landing CTA or explore card; observe normal navigation. |
| The dismiss control is a single button labelled exactly `Got it` — no checkbox, no "I acknowledge" or "I understand" copy. | Inspect the rendered banner; confirm a single `Got it` button and no checkbox or acknowledgement input. |
| After dismissing, the banner does not return on subsequent visits in the same browser. | Dismiss the banner; reload the page; navigate to another route and back to `/`; observe no banner. |
| The banner is keyboard-dismissible. | With the banner visible, press `Tab` until focus reaches `Got it`; press `Enter`; observe the banner closes. |
| The banner is announced by assistive technology. | With a screen reader enabled, load the root route as a first-time visitor; observe the `Before you begin` heading and body copy are announced. |
| The banner ships in `@forwardimpact/pathway` and reaches every installation without per-installation configuration. | Install the package fresh against an installation that has not opted in or set any flag; the banner appears on first visit. |
| After dismissal, the landing content occupies the same vertical position it would on a returning visit (no residual gap, no leftover banner content). | Compare the landing layout immediately after dismissal with a reload in the same browser; the top of the landing content is in the same position. |
| The banner appears on `/` only. | Visit `/discipline`, `/track`, `/self-assessment` as a first-time user; observe the banner is not rendered on these routes. |

## Out of scope (explicit)

- **No checkbox.** The original BioNova request included
  `[x] I understand that Pathway is a development reference, not a performance
  evaluation tool.` This line is intentionally dropped — see § Problem.
- **No analytics.** Whether engineers dismiss, how long they read, or how often
  they return is not tracked.
- **No re-show.** Future copy revisions will not re-trigger the banner for
  engineers who have already dismissed it. If a future spec needs versioned
  re-show, it can extend this surface.
- **No installation-side customization in v1.** Installations cannot replace
  the copy, change the button label, or disable the banner. Re-evaluate if
  more than one installation files an issue requesting custom copy.

## Risks and trade-offs

- **Dismissal is browser-scoped.** An engineer using Pathway on a new laptop
  sees the banner again. Acceptable: the banner is orientation, not a one-time
  legal artifact; re-seeing the framing on a new device is not a failure mode.
- **First impression depends on placement and proportion.** A banner that
  visually dominates the landing view re-introduces the "this is heavy" feeling
  the modal had. Treated as a design concern, not a spec concern — the spec
  requires only that the banner is non-blocking and dismissible.
- **Copy is fixed at v1.** Locking the wording removes installation flexibility
  but also removes the surface where local HR pressure can re-introduce
  compliance framing. The trade is intentional.

## Related

- [Discussion #1005](https://github.com/forwardimpact/monorepo/discussions/1005)
  — original request, triage, and approval of this alternative.
- [JTBD.md § Empowered Engineers: Understand Expectations](../../JTBD.md#empowered-engineers-see-whats-expected-of-humans-and-agents)
  — the persona and job this spec serves.
- [products/pathway/](../../products/pathway/) — the package this spec
  modifies.

— Product Manager 🌱
