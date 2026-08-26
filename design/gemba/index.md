# Gemba — Brand Implementation

> The Gemba realization of the [shared design language](../index.md): a
> monochrome design system for the agent-runtime platform, built around the
> metaphor of an **instrumented bay**. A bay is the serviced place where a
> machine runs. This one is wired for observation. A lamp says the cell is
> live, a gauge shows what it does, and a chart recorder keeps the record after
> the run ends. The brand evokes measured machinery: enamel panels, machined
> edges, a warm lamp over a bench at night, and a trace inked onto paper.

This file specifies what is Gemba-specific: the premise, the five steps of the
runtime loop, the trace mark, the color palette, the typography choices, the
type scale, the layout patterns for the three page types the site publishes, and
the CSS design tokens. The abstract design language covers color, typography,
spacing, components, motion, and accessibility. See
[../index.md](../index.md). Gemba is a typography- and motif-driven brand. It
ships no character system, no illustrated scenes, and no `assets/` folder. Every
mark on a Gemba page is inline SVG or type.

---

## 1. The Instrumented-Bay Premise

**Gemba is the instrumented bay where the agent work actually runs. Every run
there leaves a readable record.**

The premise draws on three simultaneous meanings:

1. **The actual place.** In Lean practice, _gemba_ names the place where the
   work happens. A session runs on real hardware, against real files, with a
   real clock.
2. **Instrumentation.** A bay earns its name once you can read it. The harness
   emits a trace, the wiki holds memory, and the control chart separates a real
   shift from noise.
3. **Service access.** A bay is open on one side so a person can reach in. Every
   step stays reachable from a terminal.

The metaphor surfaces in the motif, the wordmark, and the section labels. The UI
stays clean and functional. It is not themed like a control-room console.

### How this differs from Kata

[Kata](../kata/index.md) owns the mid-century production floor, and its document
uses the word "gemba" for that floor. Kata's subject is the practice: the
people, the pressed suits, the hanko stamp, and the chalk circle. Gemba's
subject is the bay itself. Its material vocabulary is machined and electrical.
Its signal is a lamp. Its motif is a recorded trace. A reader who sees both
brands should read Kata as the discipline and Gemba as the equipment.

---

## 2. The Five Steps and the Command Family

Gemba's "products" are the five steps of the runtime loop. Each step ships
twice, as a command for a terminal and as a composite action for CI. Each step
also carries its own motif, drawn from the instrumented bay. No motif here
belongs to Kata, whose motifs are the stations that people work. Gemba's are the
parts of a machine and the faces that read it. A motif surfaces in headings,
section labels, and accent marks, and never in structural UI.

| Step         | Question it answers                        | Command         | Motif                      |
| ------------ | ------------------------------------------ | --------------- | -------------------------- |
| **Stand up** | Is the bay ready and the toolchain pinned? | the bootstrap   | The mains switch           |
| **Run**      | What did the agent do on this task?        | `gemba-harness` | The spindle under load     |
| **See**      | What does the trace say about behaviour?   | `gemba-trace`   | The gauge face and needle  |
| **Remember** | What did the team learn, and where?        | `gemba-wiki`    | The tape spool             |
| **Measure**  | Did the metric move, or is this noise?     | `gemba-xmr`     | The chart with limit lines |

Two commands round out the family. `gemba-benchmark` proves whether a change
helped, with pass@k evidence across runs. `gemba-selfedit` gives a sandboxed
agent a narrow audited path to edit its own instruction files. The brand files
them under **Measure** and **Stand up**. The four published composite actions
map onto the same steps: `gemba-bootstrap` stands the bay up, `gemba-harness`
runs the session, `gemba-wiki` writes the memory, and `gemba-benchmark` measures
the outcome. They are the CI face of one loop, never a second product.

---

## 3. The Trace Mark

Above the five steps sits the **trace mark**. It is the brand's one repeatable
motif, and it makes the loop visible the way Kata's PDSA wheel makes four phases
visible. The geometry is deliberately not a wheel, because a five-spoke circle
would read as a variant of Kata's mark. The trace mark is a rising staircase of
five treads over a dashed return sweep. One tread stands for one step. The
staircase reads left to right, the way a trace is written, and the sweep carries
the loop back to the first step. The mark is inline SVG in every use.

```html
<svg class="trace-mark" viewBox="0 0 64 24" width="64" height="24"
     role="img" aria-label="The Gemba loop: stand up, run, see, remember, measure">
  <path class="trace-riser" d="M15 20 V17 M26 17 V14 M37 14 V11 M48 11 V8" />
  <line class="trace-tread" data-step="stand-up" x1="4" y1="20" x2="15" y2="20" />
  <line class="trace-tread" data-step="run" x1="15" y1="17" x2="26" y2="17" />
  <line class="trace-tread" data-step="see" x1="26" y1="14" x2="37" y2="14" />
  <line class="trace-tread" data-step="remember" x1="37" y1="11" x2="48" y2="11" />
  <line class="trace-tread" data-step="measure" x1="48" y1="8" x2="59" y2="8" />
  <path class="trace-return" d="M59 8 Q32 28 4 20" />
</svg>
```

### Named sizes and stroke weights

| Use             | Rendered size | Treads  | Risers  | Return sweep        |
| --------------- | ------------- | ------- | ------- | ------------------- |
| Hero            | `160 × 60 px` | `2px`   | `1.5px` | `1.5px`, `3 4` dash |
| Section divider | `64 × 24 px`  | `1.5px` | `1px`   | `1px`, `2 3` dash   |
| Wordmark        | `1em × 0.3em` | `1px`   | none    | none                |

All three use `stroke: var(--gray-300)`, `fill: none`, `stroke-linecap: round`,
and `stroke-linejoin: round`. Every element also carries
`vector-effect: non-scaling-stroke`, so the rendered weight holds at the named
pixel value at any size. The wordmark variant drops the risers and the sweep.
Its five treads sit flat on one baseline, one under each letter of **GEMBA**.
Below an 8px wordmark height, omit the mark entirely.

### Step coverage

A page about one step lights that tread. A lit tread takes
`stroke: var(--accent-warm-400)` and one extra half-pixel of weight. Unlit
treads drop to `0.75px` in `--gray-300`, and the risers and the sweep stay
unlit. This mirrors Kata's lit and unlit quadrant convention, so the two marks
read as siblings that record different things. Amber on a tread is a line-art
stroke, so the palette rule in [§ 4](#4-color-palette) holds.

### Section-divider use

`.trace-divider` centres the `64 × 24 px` mark in a flex row and takes
`padding: var(--space-24) 0`, which leaves 96px of vertical space above and
below. It carries no caption and no rule. On the scroll home page it separates
the step section from the command section, and the tenant section from the
closing section. The rhythm matches Kata's PDSA divider on purpose. The family
shares the cadence, and the shape identifies the brand.

### Motion and reduced motion

The mark has two states, both specified here because the shared layers do not
know it. **Advance:** on first entry into the viewport, the treads draw left to
right through `stroke-dashoffset`, each over 240ms and each starting 120ms after
the one before it. The return sweep draws last, over 400ms. That sequence runs
once and totals about 1120ms. **Running:** as a loading state, the lit tread
steps one station per 600ms and loops from **measure** back to **stand up**.

Under reduced motion the mark renders complete and static. Every tread holds its
base weight in `--gray-300`, and the lit tread stops cycling. `base.css` clamps
animation duration already. This rule is explicit, so the mark never depends on
that clamp for a correct first paint.

```css
@media (prefers-reduced-motion: reduce) {
  .trace-mark .trace-tread,
  .trace-mark .trace-riser,
  .trace-mark .trace-return {
    stroke-dashoffset: 0;
    animation: none;
  }
}
```

---

## 4. Color Palette

### Core Palette

Warm-tinted grays pulled toward the umber and machine-enamel end of the ramp.
They run warmer than Kata's graphite and browner than Forward Impact
Engineering's taupe. Think of concrete and painted steel under one warm lamp.

| Token          | Hex       | Usage                                       |
| -------------- | --------- | ------------------------------------------- |
| `--white`      | `#ffffff` | Page canvas                                 |
| `--white-warm` | `#fbf8f2` | Alternate section backgrounds, card fills   |
| `--gray-50`    | `#f4f0e8` | Elevated surfaces, inline code backgrounds  |
| `--gray-100`   | `#e7e2d6` | Hover states, active tabs, the tick scale   |
| `--gray-200`   | `#d2ccbd` | Borders (strong), secondary button outlines |
| `--gray-300`   | `#b0a999` | Tertiary text, the trace mark, on-dark text |
| `--gray-400`   | `#7a7364` | Secondary text, descriptions                |
| `--gray-500`   | `#625c50` | Body text                                   |
| `--gray-700`   | `#38332b` | Emphasis text, card headings, dividers      |
| `--gray-900`   | `#1a1611` | Headlines, filled buttons, dark surfaces    |
| `--black`      | `#0b0906` | Maximum contrast, hero headings             |

`--gray-400` sits at 4.7:1 on white and `--gray-500` at 6.6:1, so both meet AA
for body copy. `--gray-300` is tertiary on light surfaces and the standard
secondary text value on dark surfaces, where it reaches 7.7:1 against
`--gray-900`. All grays carry a warm shift of about 4 to 6 percent toward umber.
The realized CSS names the two lightest values `--bg-page` and `--bg-warm`, so
`--white` and `--white-warm` are palette entries in this table only, as in both
sibling brands.

### The Warm Signal: Amber (the Running Lamp)

An amber drawn from the indicator lamp that says a cell is live. It reads as
warm light on enamel, and it is the visible sign that the bay is running.

| Token         | Hex       | Usage                                       |
| ------------- | --------- | ------------------------------------------- |
| `--amber-50`  | `#fdf7ee` | Warm section backgrounds, blockquote fills  |
| `--amber-100` | `#f7e8cd` | Highlighted cards, selected states          |
| `--amber-200` | `#eccf9b` | Warm borders, card hover, active indicators |
| `--amber-400` | `#c1832a` | The lit tread, the terminal prompt, labels  |
| `--amber-600` | `#8c5a12` | Warm accent text (used very sparingly)      |

Amber holds the same hue family as sandstone at roughly three times the
saturation, so it never reads as a paper tint. It sits about 26 degrees of hue
away from Kata's vermillion, so it never reads as stamp ink. `--amber-400`
reaches 5.9:1 against `--gray-900` and `--amber-600` reaches 5.9:1 on white,
which makes the first safe for the terminal prompt and the second safe for the
rare accent word.

**Usage rule:** Amber appears in backgrounds, borders, line-art strokes, the
terminal prompt, and the mono section label. **Never in body text and never on
an interactive element.** It is the lamp over the bench. It is not the bench.

---

## 5. Typography

### Font Selection

| Role               | Font                              | Fallback                                                    |
| ------------------ | --------------------------------- | ----------------------------------------------------------- |
| **Display / Hero** | `"Spectral"` (Google Fonts)       | `"Iowan Old Style", Georgia, "Times New Roman", serif`      |
| **Headings**       | `"Archivo"` (Google Fonts)        | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| **Body**           | `"Archivo"`                       | Same                                                        |
| **Mono / Code**    | `"JetBrains Mono"` (Google Fonts) | `"SF Mono", Consolas, "Liberation Mono", monospace`         |

**Spectral** is Gemba's reading of the family's display serif. It is a
low-contrast screen-first serif with sturdy stems and shallow curves, and it
evokes a technical report and an engraved instrument plate. **Archivo** is the
sans pairing. It is a grotesque with signage and data-table roots, and it holds
its shape at small sizes. **JetBrains Mono** completes the family with a tall
x-height and unambiguous digits. Traces, NDJSON, and CSV metrics are this site's
most frequent code content, so the mono face carries real load.

### Type Scale

| Token                  | Size              | Weight | Line Height | Font           | Color        |
| ---------------------- | ----------------- | ------ | ----------- | -------------- | ------------ |
| `--text-hero`          | `4rem` (64px)     | 500    | 1.06        | Spectral       | `--black`    |
| `--text-display`       | `2.75rem` (44px)  | 500    | 1.12        | Spectral       | `--gray-900` |
| `--text-h1`            | `2rem` (32px)     | 700    | 1.2         | Archivo        | `--gray-900` |
| `--text-h2`            | `1.5rem` (24px)   | 600    | 1.25        | Archivo        | `--gray-900` |
| `--text-h3`            | `1.25rem` (20px)  | 600    | 1.3         | Archivo        | `--gray-700` |
| `--text-body`          | `1rem` (16px)     | 400    | 1.65        | Archivo        | `--gray-500` |
| `--text-body-emphasis` | `1rem` (16px)     | 500    | 1.65        | Archivo        | `--gray-700` |
| `--text-small`         | `0.875rem` (14px) | 400    | 1.5         | Archivo        | `--gray-400` |
| `--text-badge`         | `0.75rem` (12px)  | 600    | 1           | Archivo        | `--gray-700` |
| `--text-mono`          | `0.875rem` (14px) | 400    | 1.6         | JetBrains Mono | `--gray-500` |

The Gemba display weight is 500. It sits between Forward Impact Engineering's
400 and Kata's 700. A field journal wants a light serif. A factory poster wants
a heavy slab. An instrument plate wants a medium weight that holds at one metre.

### Hero Pattern and Wordmark

```text
Spectral, 500:                 Archivo, 20px, 400, gray-400:
  Go to where                    Gemba is the agent-runtime platform. It
  the work happens.              gives a team one command family and one
   G   E   M   B   A             set of CI actions to stand agents up, run
   ▁   ▁   ▁   ▁   ▁             sessions, read traces, keep memory, and
                                 measure outcomes.
```

The wordmark sets the five letters **GEMBA** in Spectral 500 with generous
letter-spacing (`0.14em`). Beneath them sits the flat variant of the trace mark
from [§ 3](#3-the-trace-mark), with its five treads aligned one to each letter.
Five letters carry five steps, and that alignment is the brand's signature.
Under a 16px wordmark height, drop the treads to one unbroken baseline rule in
`--gray-300`. Below 8px, omit the mark. The header wordmark uses the plain
`.brand-text` treatment with no mark, so it stays a hero and footer element.

---

## 6. Layout Patterns

The site publishes three page types, and the brand specifies each one, because
Gemba is the first sibling site with a documentation tree.

### Page type 1 — The scroll home page (`layout: home`)

The home page uses `layout: home` and hand-written brand sections. It carries no
template hero. `layout.css` hides `.page-title` and removes the prose width cap
under `.layout-home`, so each section owns its own full-bleed background and its
own inner container.

```text
│               G E M B A                      │  ← Spectral 500, tracked
│               ▁ ▁ ▁ ▁ ▁                      │  ← trace mark, hero size
│          Go to where the work happens.       │  ← Spectral 500, 64px
│     One command family. Two surfaces.        │  ← Archivo, gray-400
├──────────────────────────────────────────────┤
│  THE LOOP                                    │  ← .section-label, mono amber
│ ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐          │  ← .step-card ×5
├────────────── trace mark divider ────────────┤
│  THE COMMANDS  ·  ❯ npx gemba-harness run …  │  ← .terminal
```

Two more sections follow the terminal: the reference tenant, then a second
trace-mark divider, then the closing call to action. Every section takes
`--space-24` (96px) of vertical padding, and section content sits in a `1120px`
inner container. The hero fills the viewport with `min-height: 100dvh`.

### Page type 2 — The docs hub (`/docs/`)

The hub sets `toc: false` and carries no hero. It uses the template's
`.page-title` H1, three job headings, and card grids only. The shared `.grid`
rule in `components.css` supplies `auto-fit` columns at a `240px` minimum and a
`--space-6` gap, with the card treatment below. The hub adds one brand rule. A
hairline `1px` `--border-default` rule sits above each job H2, with `--space-12`
of clearance, so the three jobs read as three panels on one plate.

### Page type 3 — The guide page (TOC rail and breadcrumbs)

A guide page keeps `toc: true`, which wraps the content in `.with-toc`. The
shared layer sets that grid to `1fr 220px` with a `--space-12` gap and a `960px`
maximum width. The content column takes `order: -1` above 960px, so the rail
sits on the right. Below 961px the grid collapses to one column and the rail
loses its sticky position.

```text
│  Docs / Prove Changes / Run a Benchmark      │  ← .breadcrumbs, 14px
│  Run a Benchmark               │ CONTENTS  │ │  ← .toc-nav, sticky at 80px
│  Body copy at 1fr, prose reads │ ▍Install  │ │  ← active entry, amber edge
│  against a 220px rail.         │ Sharding  │ │
```

- **Breadcrumbs.** `14px` Archivo in `--text-tertiary`, above the H1, with the
  separator glyph `/` in `--gray-300`. Links take `--gray-400`.
- **TOC rail.** Background `--bg-warm`, border `1px solid --border-default`,
  radius `--radius-md` (8px), padding `--space-4`. The `CONTENTS` heading is
  `12px` Archivo 600, uppercase, `0.08em` tracked, in `--gray-700`. The active
  entry takes a `2px` left border in `--accent-warm-400` with `--space-2` of
  inset, which applies the lit-tread idea to the rail. Its label stays
  `--gray-700`, so amber never becomes text.
- **Prose width.** A page with no rail holds a `680px` measure. A page with a
  rail holds the grid's `1fr` column.

### Warm/Cool Section Rhythm

The home page alternates `--bg-page` (`#ffffff`) for the hero, the command
section, and the closing section with `--bg-warm` (`#fbf8f2`) plus the tick
scale for the five steps and `--amber-50` (`#fdf7ee`) for the reference tenant.
The footer inverts to `--gray-900` (`#1a1611`).

### Concrete Components

Gemba tightens the radii to `4/8/12`, below Kata's `6/10/14` and Forward Impact
Engineering's `8/12/16`. Machined panels carry a small consistent break at the
edge. The family's component table in
[../index.md § 5](../index.md#5-components) names sizes by token only, so this
section restates every affected size in pixels.

- **Buttons.** Primary: `--bg-inverted` behind `#ffffff`, padding `14px 28px`,
  radius `--radius-pill` (999px), hover to `--gray-700`. Secondary: `--bg-page`,
  `1.5px solid --gray-200`, text `--gray-900`, radius `999px`, hover fill
  `--gray-50`. Product: the secondary treatment at `--radius-md` (8px), which
  replaces the family's 12px. Ghost: transparent with the `→` glyph in
  `--gray-400`. Amber never appears on a button.
- **Cards.** `--bg-page` on warm sections and `--white-warm` on page-white
  sections, `1.5px solid --gray-200`, radius `--radius-lg` (12px), padding
  `--space-8` (32px). Hover warms the border to `--accent-warm-200` and lifts
  the card 2px. The five home-page step cards instead take a `3px` top border in
  `--gray-200` and no other border, and hover moves that border to
  `--accent-warm-400`. Each one reads as one tread of the trace.
- **Terminal and code blocks.** `--bg-inverted` behind `--text-on-dark`, prompt
  `❯` in `--amber-400`, comments in `--gray-400`, radius `--radius-md` (8px),
  padding `--space-6` (24px). Inline code takes `--gray-50` behind `--gray-700`
  at radius `4px`.
- **Tick-scale texture.** Thin vertical lines that repeat in `--gray-100` on
  `--white-warm` or `--amber-50` sections. `1px` stroke, `24px` spacing,
  opacity 0.35, with a major tick in `--gray-200` every fifth line (120px). It
  is the time axis of a trace. It never appears on pure white.
- **Footer (dark).** `--bg-inverted` behind `--text-on-dark`, secondary text
  `--gray-300`, dividers `--gray-700`. The word **GEMBA** in Spectral 500 with
  the flat trace mark beneath it in white. Licenses in `--gray-300`.

Three brand-layer obligations follow from the site template.
`websites/gemba/index.template.html` uses `.footer-brand` and
`.footer-tagline`, which no shared layer styles. It also puts `.btn-ghost` on
the header GitHub link, so the brand layer suppresses the inherited arrow with
`.nav-github::after { content: none; }`. The `box-shadow` values in
`components.css` are hard-coded near-neutral darks, so the brand layer restates
them as `rgba(26, 22, 17, …)` where Gemba wants the umber cast.

---

## 7. Design Tokens

```css
:root {
  /* ── Surfaces ── */
  --bg-page: #ffffff;
  --bg-warm: #fbf8f2;
  --bg-elevated: #f4f0e8;
  --bg-hover: #e7e2d6;
  --bg-inverted: #1a1611;
  /* ── Amber (warm signal — the running lamp) ── */
  --amber-50: #fdf7ee;
  --amber-100: #f7e8cd;
  --amber-200: #eccf9b;
  --amber-400: #c1832a;
  --amber-600: #8c5a12;
  /* ── Family alias (cross-brand component contract) ── */
  --accent-warm-50: var(--amber-50);
  --accent-warm-100: var(--amber-100);
  --accent-warm-200: var(--amber-200);
  --accent-warm-400: var(--amber-400);
  --accent-warm-600: var(--amber-600);
  /* ── Text ── */
  --text-primary: #0b0906;
  --text-heading: #1a1611;
  --text-body: #625c50;
  --text-secondary: #7a7364;
  --text-tertiary: #b0a999;
  --text-on-dark: #f0e9dc;
  /* ── Grays ── */
  --gray-50: #f4f0e8;
  --gray-100: #e7e2d6;
  --gray-200: #d2ccbd;
  --gray-300: #b0a999;
  --gray-400: #7a7364;
  --gray-500: #625c50;
  --gray-700: #38332b;
  --gray-900: #1a1611;
  --black: #0b0906;
  /* ── Borders ── */
  --border-default: #e7e2d6;
  --border-strong: #d2ccbd;
  /* ── Radii — tightest of the three brands (machined panel edge) ── */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
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
  --font-display: "Spectral", "Iowan Old Style", Georgia, "Times New Roman",
    serif;
  --font-sans: "Archivo", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Consolas, "Liberation Mono",
    monospace;
  --text-hero-size: 4rem;
  --text-hero-weight: 500;
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

The brand layer imports the three faces at the top of
`websites/gemba/assets/main.css`:

```css
@import url("https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Spectral:wght@400;500;600&display=swap");
```

### Token inventory

The three shared stylesheets read 50 custom properties, and the block above
defines every one: 11 semantic surface, text, and border tokens; 8 gray-ramp
values including `--black`; the aliases `--accent-warm-50` and
`--accent-warm-200`; 10 spacing steps; 4 radii; 11 typography tokens; and 4
transition tokens. The block defines 64 tokens in all. The 14 that no shared
layer reads serve the brand layer and the cross-brand contract: the five
`--amber-*` entries, the aliases `--accent-warm-100`, `--accent-warm-400`, and
`--accent-warm-600`, plus `--bg-elevated`, `--text-secondary`,
`--text-display-size`, `--gray-100`, `--space-20`, and `--space-32`. Keep every
one defined. Responsive overrides live in the brand layer, which below 768px
drops `--text-hero-size` to `2.75rem`, `--text-display-size` to `2rem`,
`--space-24` to 64px, and `--space-16` to 48px.

---

_Gemba brand implementation of the [shared design language](../index.md).
Sibling brand to [Forward Impact Engineering](../fit/index.md) and
[Kata](../kata/index.md). Updated August 2026._
