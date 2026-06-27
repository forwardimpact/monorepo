# Kata — Brand Implementation

> The Kata realization of the [shared design language](../index.md): a
> monochrome design system for the Kata Agent Team, built around the metaphor
> of a **mid-century Toyota production floor**. Six agent personas — the
> **Staff Engineer**, **Release Engineer**, **Security Engineer**, **Product
> Manager**, **Technical Writer**, and **Improvement Coach** — work the line
> together, the way Taiichi Ohno's foremen worked the shop floor in the 1940s
> and 50s.
>
> The brand evokes the dignity of practiced work: pressed suits, soft flat
> caps, andon cords, kanban rails, the chalk circle on a polished concrete
> floor. Stamp-ink red on a white card. The calm authority of someone who has
> stood on the gemba long enough to know what good looks like.

This file specifies what is Kata-specific: the production-floor metaphor, the
six agent personas, the concrete color palette, the typography choices, the
type scale, the layout patterns, the agent visual language, and the CSS design
tokens. For the abstract design language — color, typography, spacing,
components, motion, and accessibility — see [../index.md](../index.md).

Kata is a typography- and motif-driven brand. It does not ship a character
system or illustrated scenes; its visual identity is carried by the PDSA wheel,
the kanban-rail texture, the hanko stamp ink, and the slab-serif wordmark.

---

## 1. The Production-Floor Metaphor

"The shop floor" — _gemba_ — draws from three simultaneous meanings:

1. **The Toyota Production System era**: 1940s–50s post-war Japan. Taiichi Ohno
   walking the floor in a soft cap and pressed suit, drawing chalk circles,
   asking "why" five times. The unglamorous discipline of making work visible
   and improving it one experiment at a time.
2. **Kata as deliberate practice**: A pattern repeated until it becomes reflex.
   The improvement kata and coaching kata are the same five questions day after
   day, against an ever-moving target condition. Repetition is the point, not
   the problem.
3. **Industrial restraint**: Letterpress typography, stamped paperwork, cotton
   lab coats, brass keys, manila folders, hand-lettered signage. Tools designed
   for forty-year service lives. Nothing decorative; nothing wasted.

The name **Kata** captures all three: a form practiced by hand, on the floor,
with the calm conviction that the next iteration will be a little better than
this one.

The metaphor surfaces in motif and wordmark. The UI itself is clean and
functional, not themed like a heritage poster.

---

## 2. The Six Agent Personas

Kata's "products" are the six agent personas — each a recognizable archetype
from the mid-century shop floor, mapped to a contemporary engineering role.

| Agent                 | Question it answers                                                |
| --------------------- | ------------------------------------------------------------------ |
| **Staff Engineer**    | What is the next experiment, and how do we run it?                 |
| **Release Engineer**  | Is the line moving, and is the next release ready to ship?         |
| **Security Engineer** | Is the floor safe — supply chain, dependencies, secrets?           |
| **Product Manager**   | What enters the line, and what is ready to merge into main?        |
| **Technical Writer**  | Is the manual accurate, and does the wiki reflect what we learned? |
| **Improvement Coach** | What is the current condition, and what did we learn yesterday?    |

Each agent has its own visual motif — drawn from the production-floor metaphor
— that surfaces in headings and accent marks, but never in structural UI.

| Agent                 | Motif                                  |
| --------------------- | -------------------------------------- |
| **Staff Engineer**    | The drafting bench (set-square, plan)  |
| **Release Engineer**  | The shipping bay (crate, stamp)        |
| **Security Engineer** | The night watch (brass key, lantern)   |
| **Product Manager**   | The kanban rail (cards on a wire)      |
| **Technical Writer**  | The archivist's desk (pen, ledger)     |
| **Improvement Coach** | The Ohno circle (chalk ring, notebook) |

### The PDSA Wheel

Above the six personas sits the **PDSA wheel** — a four-quadrant chalk circle
marked **P · D · S · A** clockwise, the spine of [KATA.md](../../KATA.md) made
visible. It is the brand's repeating motif, used as:

- The optional accent above the second `A` in the **KATA** wordmark.
- A section divider on long pages — drawn at 16px, `--gray-300` stroke, centred,
  with 96px of vertical breathing room either side.
- A loading state — the wheel rotates one quadrant per 800ms, looping P → D → S
  → A → P, respecting `prefers-reduced-motion` (static wheel).

Each agent's "phase coverage" in [KATA.md § Skills](../../KATA.md#skills) maps
to wheel quadrants, so the wheel is also functional: a Staff Engineer profile
page may show the wheel with **P** and **D** lit; an Improvement Coach profile
may show **S** lit. Lit quadrants use a 1.5px stroke; unlit quadrants use a
0.5px stroke. No fills.

```text
       P
   ╱─ ─ ─╲
  ╱       ╲
 │ A     D │
  ╲       ╱
   ╲─ ─ ─╱
       S
```

---

## 3. Color Palette

### Core Palette

Warm-tinted grays, pulled toward the _sumi_ ink and pressed-paper end of the
ramp. Slightly cooler than Forward Impact Engineering's sandstone bias, slightly
more graphite — think of a black-and-white photograph that has been kept in a
manila folder for seventy years.

| Token          | Hex       | Usage                                       |
| -------------- | --------- | ------------------------------------------- |
| `--white`      | `#ffffff` | Page canvas                                 |
| `--white-warm` | `#f8f6f1` | Alternate section backgrounds, card fills   |
| `--gray-50`    | `#f1efe9` | Elevated surfaces, code blocks              |
| `--gray-100`   | `#e4e1d9` | Hover states, active tabs, tag backgrounds  |
| `--gray-200`   | `#cfcbc1` | Borders (strong), secondary button outlines |
| `--gray-300`   | `#aeaba2` | Tertiary text, disabled states              |
| `--gray-400`   | `#74716a` | Secondary text, descriptions                |
| `--gray-500`   | `#5d5b55` | Body text                                   |
| `--gray-700`   | `#33312d` | Emphasis text, card headings                |
| `--gray-900`   | `#161513` | Headlines, primary text, filled buttons     |
| `--black`      | `#080706` | Maximum contrast, hero headings             |

### The Warm Signal: Hanko (Stamp Ink)

A vermillion red drawn from the Japanese hanko (signature stamp) used to mark
approved paperwork on the shop floor. Reads as ink on a card — the visible trace
of a decision made.

| Token       | Hex       | Usage                                  |
| ----------- | --------- | -------------------------------------- |
| `--ink-50`  | `#fbf3f1` | Warm section backgrounds               |
| `--ink-100` | `#f4ddd7` | Highlighted cards, selected states     |
| `--ink-200` | `#e8b8ac` | Warm borders, active indicators        |
| `--ink-400` | `#c25a47` | Warm tertiary elements                 |
| `--ink-600` | `#8a3624` | Warm accent text (used very sparingly) |

**Usage rule:** Hanko appears in backgrounds, borders, the terminal prompt, the
andon-cord highlight, and the stamp-mark accent. **Never in body text or
interactive elements.** It is the single warm signal — the ink on the card, not
the card itself.

All grays are warm-tinted with a subtle graphite shift (~3–5% pull toward
neutral-warm). The difference accumulates across a page — quieter than
sandstone, but still warmer than pure neutral. Like archival paper.

---

## 4. Typography

### Font Selection

| Role               | Font                             | Fallback                                                    |
| ------------------ | -------------------------------- | ----------------------------------------------------------- |
| **Display / Hero** | `"Roboto Slab"` (Google Fonts)   | `"Rockwell", Georgia, "Times New Roman", serif`             |
| **Headings**       | `"IBM Plex Sans"` (Google Fonts) | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| **Body**           | `"IBM Plex Sans"`                | Same                                                        |
| **Mono / Code**    | `"IBM Plex Mono"` (Google Fonts) | `"SF Mono", Consolas, "Liberation Mono", monospace`         |

**Roboto Slab** is Kata's reading of the family's display serif: an industrial
slab serif that evokes mid-century training manuals, factory signage, and
stencilled crate markings — the vocabulary of writing things down on the shop
floor.

**IBM Plex Sans** is the sans pairing — a typeface designed explicitly to evoke
mid-century corporate identity, with the geometric calm of a 1950s form. It
pairs naturally with Roboto Slab through shared mid-century DNA.

**IBM Plex Mono** completes the family — typewriter cadence without the
typewriter's irregularity, suited for terminals and ledger-style data.

### Type Scale

| Token                  | Size              | Weight | Line Height | Font          | Color        |
| ---------------------- | ----------------- | ------ | ----------- | ------------- | ------------ |
| `--text-hero`          | `4rem` (64px)     | 700    | 1.05        | Roboto Slab   | `--black`    |
| `--text-display`       | `2.75rem` (44px)  | 600    | 1.1         | Roboto Slab   | `--gray-900` |
| `--text-h1`            | `2rem` (32px)     | 600    | 1.2         | IBM Plex Sans | `--gray-900` |
| `--text-h2`            | `1.5rem` (24px)   | 600    | 1.25        | IBM Plex Sans | `--gray-900` |
| `--text-h3`            | `1.25rem` (20px)  | 500    | 1.3         | IBM Plex Sans | `--gray-700` |
| `--text-body`          | `1rem` (16px)     | 400    | 1.65        | IBM Plex Sans | `--gray-500` |
| `--text-body-emphasis` | `1rem` (16px)     | 500    | 1.65        | IBM Plex Sans | `--gray-700` |
| `--text-small`         | `0.875rem` (14px) | 400    | 1.5         | IBM Plex Sans | `--gray-400` |
| `--text-badge`         | `0.75rem` (12px)  | 600    | 1           | IBM Plex Sans | `--gray-700` |
| `--text-mono`          | `0.875rem` (14px) | 400    | 1.6         | IBM Plex Mono | `--gray-500` |

The Kata display weight is heavier than Forward Impact Engineering's (700
vs 400) — slab serifs carry mid-century industrial weight, more poster than
journal.

### Hero Pattern

```text
Roboto Slab, 64px, weight 700:

  Practice the form.
  Trust the process.

IBM Plex Sans, 18px, weight 400, gray-400:

  The Kata Agent Team is Forward Impact's autonomous and continuously
  improving agentic development team. Six agent personas walk the line
  together — planning, shipping, hardening, triaging, documenting, and
  coaching — one daily kata at a time.
```

### Suite Wordmark

The Kata wordmark sets the four letters **KATA** in Roboto Slab 700 with
generous letter-spacing (`0.18em`). Above the second `A` sits a small **PDSA
wheel** — the four-quadrant chalk circle defined in
[§ 2 The PDSA Wheel](#the-pdsa-wheel) — sized at 0.5em. The wheel acts as the
brand's signature: a quiet visible reminder that every Kata page is a turn of
the cycle.

```text
   K A T A
        ⊕     ← PDSA wheel (P · D · S · A clockwise)
```

At very small sizes (under 16px wordmark height), the PDSA wheel reduces to a
simple **stroke-only** circle in `--gray-700` — the quadrant marks are dropped,
but the no-fill rule is preserved. Below 8px wordmark height the wheel is
omitted entirely.

---

## 5. Layout Patterns

The Kata Agent Team is **internal**. It has no public marketing site. The brand
surfaces in four real places, ordered by how often a contributor or agent
encounters them:

### Surface 1 — The Internals Page

The canonical home is `websites/fit/docs/internals/kata/index.md` — sibling to
`internals/operations/`, `internals/librepl/`. This is
where the brand renders for human contributors browsing the docs site.

```text
┌──────────────────────────────────────────────┐
│  Forward Impact Engineering Internals  ›  Kata  │
│                                              │
│     Kata                                     │  ← Roboto Slab 700, 44px
│                                              │
│     Practice the form. Trust the process.    │  ← Roboto Slab 600, 24px
│                                              │
│     Six agent personas walk the line —       │  ← IBM Plex Sans, gray-400
│     planning, shipping, hardening, triaging, │
│     documenting, and coaching — one daily    │
│     kata at a time.                          │
│                                              │
├──────────────────────────────────────────────┤
│  ─── PDSA wheel section divider ───          │
├──────────────────────────────────────────────┤
│  The Six Personas                            │  ← H2
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│ │Staff │ │Releas│ │Securi│ │Prodct│ │Writer│ │Coach │ │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘│
├──────────────────────────────────────────────┤
│  The PDSA Loop · Workflows · Trust Boundary  │
│  Coordination Channels · Metrics · Auth      │
├──────────────────────────────────────────────┤
│  ─── PDSA wheel section divider ───          │
├──────────────────────────────────────────────┤
│  Background: kanban-rail texture             │
│     "Without standards, there can be no      │  ← Roboto Slab 600
│      kaizen."                                │
│                  — Taiichi Ohno              │
└──────────────────────────────────────────────┘
```

### Surface 2 — `KATA.md` Rendered on GitHub

`KATA.md` at the repo root is read by every agent at the start of a Kata run
(per the L1 instruction layer). On GitHub it renders as plain flavored markdown
— the brand cannot inject CSS — so the brand surfaces through **structural
cues** only: section headings that match the persona names, the hanko stamp
emoji-equivalent (`🟥`) reserved for the Trust Boundary section.

### Surface 3 — Agent Comments and PR/Issue Bodies

When a Kata agent posts on a PR or issue (via `kata-dispatch`), it signs with
its persona. The signature line is a single line of IBM Plex Mono using the
convention:

```text
— {persona icon} {Persona Name} · {phase} · {run-id}
```

Example: `— 📐 Staff Engineer · Plan · run-2026-04-28-night`. The icon is the
persona's icon glyph; the phase is one of P/D/S/A; the run-id ties the comment
back to the trace artifact.

### Surface 4 — Storyboard Markdown and Wiki Summaries

Daily storyboard files (`wiki/storyboard/{YYYY-MM-DD}.md`) and per-agent wiki
summaries (`wiki/{persona}.md`) follow a fixed Kata template — the brand's
typographic discipline applied to plain markdown. Persona name as H1, current
condition as a blockquote, target condition as a level-2 heading, the five kata
questions as level-3 subsections, metrics as a mono-table.

### Navigation Pattern (Internals Page)

The Kata internals page lives inside the Forward Impact Engineering docs nav.
Within the Kata section, sub-nav routes to each persona:

```text
Forward Impact Engineering Docs  ›  Internals  ›  Kata  ›  Staff · Release · Security · Product · Writer · Coach
```

Current persona is bold (`600`). Others are regular (`400`) in `--gray-400`. The
persona switcher is a horizontal row at the top of any persona sub-page.

### Warm/Cool Section Rhythm

```text
Section 1: white (#ffffff)          — Hero
Section 2: warm (#f8f6f1)           — Agent persona cards
Section 3: white (#ffffff)          — How a daily kata runs
Section 4: ink-50 (#fbf3f1) + rail  — Ohno quote
Section 5: white (#ffffff)          — CTA / read the playbook
Footer:    gray-900 (#161513)       — Dark footer (inverted), licenses
```

The kata-rail texture is Kata's equivalent of Forward Impact Engineering's
contour lines: a repeating thin horizontal line in `--gray-100` on
`--white-warm` or `--ink-50` sections, evoking the wire on which kanban cards
slide. 1px stroke, spaced 28px apart, opacity 0.35. Never on pure white
backgrounds.

### Concrete Components

The component patterns in [../index.md § 5](../index.md#5-components)
instantiate with Kata colors:

- **Buttons (Primary):** `background: --gray-900`, text `#ffffff`. Hover shifts
  background to `--black`. The warm signal does not appear on interactive
  elements — the brand's stamp-mark accent lives on cards, paper, and the
  terminal prompt, never on a button or link.
- **Buttons (Secondary / Product):** `border: 1.5px solid --gray-200`, text
  `--gray-900`. Hover darkens border to `--gray-700`.
- **Cards:** `background: --white` (on warm bg) or `--white-warm` (on white bg),
  `border: 1.5px solid --gray-200`. Selected/active state adds a `--ink-400`
  left edge — the kanban-card "approved" stamp.
- **Terminal / Code Blocks:** `background: --gray-900` (`#161513`), text
  `#ebe8e1`, prompt `❯` in `--ink-400`, comments in `--gray-400`.
- **Kanban-Rail Texture:** Repeating thin horizontal lines in `--gray-100` on
  `--white-warm` or `--ink-50` sections. 1px stroke, 28px spacing, opacity 0.35.
- **Footer (Dark):** `background: --gray-900`, primary text `#ebe8e1`, secondary
  text `--gray-300`, dividers `--gray-700`. The word **KATA** (Roboto Slab 700,
  letter-spaced) plus the PDSA wheel in white. Licenses (Apache-2.0 code, CC BY
  4.0 docs) in `--gray-300`. (`--gray-300` is the on-dark equivalent of
  `--gray-400` on light — a brand convention since Kata's `--gray-400` is darker
  than the family default to satisfy AA on white.)

---

## 6. Agent Visual Language

Each agent shares the core design system with subtle differentiators:

| Agent                 | Accent Metaphor                          | Empty State                                                | Tone                                     |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| **Staff Engineer**    | Drafting — set-squares, plan grid        | Empty drafting bench, set-square at rest                   | "Draw the plan before cutting metal."    |
| **Release Engineer**  | Shipping — crates, manifest, time stamp  | Sealed crate, uninked stamp on the lid                     | "The line moves on time."                |
| **Security Engineer** | Watch — brass keys, lantern, locked door | Lantern lit on a hook, ring of keys beside it              | "Walk the floor with the lantern up."    |
| **Product Manager**   | Kanban — cards on a wire, triage bin     | Empty rail, three pegs waiting                             | "What's next on the rail?"               |
| **Technical Writer**  | Archive — fountain pen, manila folder    | Open ledger, fresh page, capped pen beside it              | "If it isn't written, it didn't happen." |
| **Improvement Coach** | Coaching — chalk circle, five-question   | Empty chalk circle on the floor, stick of chalk at the rim | "What is the current condition?"         |

### Agent-Specific UI Treatments

- **Staff Engineer**: Plan documents render on a faint blueprint grid in
  `--gray-100`. Spec / design / plan stages display as a 3-stage progress line
  with stamped milestones.
- **Release Engineer**: Release notes use a manifest layout — version, date,
  payload, signer — rendered as a stamped shipping label.
- **Security Engineer**: Vulnerability dashboards use a "lantern" pattern: the
  unresolved CVE rows glow softly in `--ink-100`; resolved rows fall back to
  `--gray-50`.
- **Product Manager**: Issue and PR queues render as a kanban rail (horizontal
  lanes, cards sliding right). The merge gate is a stamped seal.
- **Technical Writer**: Wiki pages and weekly logs render in a "ledger"
  treatment — narrow column, IBM Plex Mono for metadata lines, faint horizontal
  rule between entries.
- **Improvement Coach**: Storyboard meeting notes render inside a circle — the
  Ohno circle — with the five kata questions arrayed around it. XmR charts use a
  stamped grid.

---

## 7. Design Tokens

```css
:root {
  /* ── Surfaces ── */
  --bg-page: #ffffff;
  --bg-warm: #f8f6f1;
  --bg-elevated: #f1efe9;
  --bg-hover: #e4e1d9;
  --bg-inverted: #161513;

  /* ── Hanko (warm signal — stamp ink) ── */
  --ink-50: #fbf3f1;
  --ink-100: #f4ddd7;
  --ink-200: #e8b8ac;
  --ink-400: #c25a47;
  --ink-600: #8a3624;

  /* ── Family alias (cross-brand component contract) ── */
  --accent-warm-50: var(--ink-50);
  --accent-warm-100: var(--ink-100);
  --accent-warm-200: var(--ink-200);
  --accent-warm-400: var(--ink-400);
  --accent-warm-600: var(--ink-600);

  /* ── Text ── */
  --text-primary: #080706;
  --text-heading: #161513;
  --text-body: #5d5b55;
  --text-secondary: #74716a;
  --text-tertiary: #aeaba2;
  --text-on-dark: #ebe8e1;

  /* ── Borders ── */
  --border-default: #e4e1d9;
  --border-strong: #cfcbc1;

  /* ── Radii ── */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  /* ── Spacing ── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --space-32: 128px;

  /* ── Typography ── */
  --font-display: "Roboto Slab", "Rockwell", Georgia, "Times New Roman", serif;
  --font-sans: "IBM Plex Sans", -apple-system, BlinkMacSystemFont,
               "Segoe UI", Roboto, sans-serif;
  --font-mono: "IBM Plex Mono", "SF Mono", Consolas,
               "Liberation Mono", monospace;

  --text-hero-size: 4rem;
  --text-hero-weight: 700;
  --text-display-size: 2.75rem;
  --text-h1-size: 2rem;
  --text-h2-size: 1.5rem;
  --text-h3-size: 1.25rem;
  --text-body-size: 1rem;
  --text-small-size: 0.875rem;
  --text-badge-size: 0.75rem;

  /* ── Transitions ── */
  --ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 400ms;
}
```

The Kata radii are slightly tighter than Forward Impact Engineering (6/10/14 vs
8/12/16) — closer to the squared corners of mid-century industrial cards and
stamped paper.

---

_Kata brand implementation of the [shared design language](../index.md). Sibling
brand to [Forward Impact Engineering](../fit/index.md). Updated May 2026._
