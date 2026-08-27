# Jidoka — Brand Implementation

> The Jidoka realization of the [shared design language](../index.md): a
> monochrome design system for the layered instruction architecture, built
> around the Toyota principle of **autonomation**. A machine, or a layer of
> instructions, detects its own defect and stops the line before that defect
> ships downstream. [JIDOKA.md](../../JIDOKA.md) names the check suite itself
> **the andon cord**. The brand takes that sentence literally: a cord runs
> through the layer stack, and an andon lamp lights the moment it catches a
> drifted layer.

This file specifies what is Jidoka-specific: the autonomation premise, the
eight-layer taxonomy, the andon lamp mark, the concrete color palette, the
typography choices, the type scale, the layout patterns, and the CSS design
tokens. The abstract design language covers color, typography, spacing,
components, motion, and accessibility. See [../index.md](../index.md). Jidoka
is a typography- and motif-driven brand. It ships no character system and no
illustrated scenes. Every mark on a Jidoka page is inline SVG or type.

---

## 1. The Autonomation Premise

**Jidoka is built-in quality. A defect stops the line at the layer where it
appears, and never reaches a downstream run.**

The premise draws on the same history the root standard cites in
[JIDOKA.md](../../JIDOKA.md):

1. **The automatic loom.** Sakichi Toyoda's loom stopped itself the instant a
   thread broke, so one worker could tend many looms without producing a bolt
   of flawed cloth. Automation alone was not the innovation. Automation that
   halts itself was.
2. **The andon cord.** A worker who spots a defect pulls a cord. A lamp
   lights above the station. The line stops there, not three stations later.
   `JIDOKA.md` names the `jidoka` check suite this cord directly: it halts the
   moment a layer breaches its budget, a jobs block goes stale, or an
   invariant breaks.
3. **Inspection builds in, not on.** A defect caught after the fact is a
   report. A defect caught at the source is prevented. The eight-layer
   architecture exists so a defect always traces to exactly one layer, never
   to "somewhere in the prompt."

The metaphor surfaces in the motif and the wordmark. The UI itself stays
clean and functional. It is not themed like a factory floor console.

---

## 2. The Eight Layers

Jidoka's "products" are the eight layers of the instruction stack, general at
the base and specific at the top. Each layer owns exactly one job, so a
defect localizes to one layer and never hides between two.

| Layer  | Name                       | Job                                                          |
| ------ | -------------------------- | ------------------------------------------------------------- |
| **L0** | System Prompt              | Harness mechanics only. Nothing about the project.            |
| **L1** | `CLAUDE.md`                | Project identity: what it is, who it serves, where jobs live. |
| **L2** | `CONTRIBUTING.md`/`JTBD.md`| Contribution standards and the jobs each persona hires.        |
| **L3** | Agent Profile              | One persona's voice, routing, and scope. Boundaries, not steps.|
| **L4** | Agent References           | Cross-cutting protocols: memory, coordination, approval.       |
| **L5** | Skill Procedure             | Complete imperative steps for one domain. No tribal knowledge. |
| **L6** | Skill References            | The data a procedure consults: templates, tables, examples.    |
| **L7** | Checklists                  | Binary verification at a pause point. Confirms, never explains.|

No motif is assigned per layer the way Kata assigns one per persona or Gemba
assigns one per step. The eight layers are one structure, not eight distinct
scenes, so the brand renders them as one mark: the stack itself.

---

## 3. The Andon Lamp Mark

Above the eight layers sits the **andon lamp**, lit at the top of a cord that
threads down through the stack. It makes [JIDOKA.md](../../JIDOKA.md)'s
sentence — "the `jidoka` checks are the andon cord" — literal and visible. The
mark has three parts:

1. **The stack.** Eight rounded bars, widest (most general, L0) at the base
   and narrowest (most specific, L7) at the top, each one centered on the
   same vertical axis. The taper is the brand's reading of "general to
   specific."
2. **The cord.** A single vertical stroke, thinner than the bars, that runs
   from the base of the stack through the center of every bar to the lamp.
   It is the visual pull-cord. It is also the "line" the checks stop.
3. **The lamp.** A filled circle at the top of the cord, in the indigo signal
   color. It is always lit. It is the brand's constant signature, the same
   way Kata's hanko hub is always inked. It says: the line is watched.

```html
<svg class="layer-stack-hero" viewBox="0 0 64 64" role="img"
     aria-label="An andon lamp lit above eight stepped instruction layers">
  <rect class="layer-bar" x="10" y="54" width="44" height="4" rx="1.5" />
  <rect class="layer-bar" x="12" y="49" width="40" height="4" rx="1.5" />
  <rect class="layer-bar" x="14" y="44" width="36" height="4" rx="1.5" />
  <rect class="layer-bar" x="16" y="39" width="32" height="4" rx="1.5" />
  <rect class="layer-bar" x="18" y="34" width="28" height="4" rx="1.5" />
  <rect class="layer-bar" x="20" y="29" width="24" height="4" rx="1.5" />
  <rect class="layer-bar" x="22" y="24" width="20" height="4" rx="1.5" />
  <rect class="layer-bar layer-bar-top" x="24" y="19" width="16" height="4" rx="1.5" />
  <line class="layer-cord" x1="32" y1="58" x2="32" y2="7" />
  <circle class="layer-lamp" cx="32" cy="7" r="4" />
</svg>
```

### Named sizes and stroke weights

| Use             | Rendered size | Bars                        | Cord     | Lamp                 |
| ---------------- | ------------- | ---------------------------- | -------- | --------------------- |
| Hero              | `72 × 72 px`  | 8, `1.5px` stroke, `--gray-300`, top bar `--ink-400`/`--ink-50` fill | `1.25px`, `--gray-300` | `r=4`, `--ink-400` fill |
| Footer             | `20 × 20 px`  | 3, `1.5px` stroke, `--text-on-dark` | omitted | `r=1.3`, `--ink-400` fill |
| Section divider    | `20 × 20 px`  | 3, `1.5px` stroke, `--gray-300`, top bar `--ink-400`/`--ink-50` fill | omitted | `r=1.3`, `--ink-400` fill |

At footer and divider scale the cord disappears; three bars and the lamp
carry the concept. Below an 8px mark height, omit the mark entirely, matching
the sibling brands' rule.

### Construction

The hero mark sits on a `64 × 64` viewBox. Bars step up at a 5-unit pitch
(4-unit bar height, 1-unit gap), each 4 units narrower than the one below it,
all centered on `x = 32`. The cord runs `x = 32` from `y = 58` (the base of
the bottom bar) to `y = 7` (the lamp center), drawn before the lamp so the
lamp paints over its terminus. The divider and footer marks reuse the same
three-bar, tapered-by-4 proportions at `16 × 16`, with the lamp centered two
units above the top bar.

### Motion

**Advance:** on first entry into the viewport, the mark fades and lifts with
the hero (`fadeUp`, 600ms, 100ms delay), matching the sibling hero marks. No
per-bar stagger — the stack reads as one structure, not a sequence.
**Reduced motion:** the mark renders complete and static, per
[../index.md § 7](../index.md#7-accessibility).

---

## 4. Color Palette

### Core Palette

Cool-tinted grays, pulled toward blueprint paper and drafting ink. They run
cooler than both Kata's graphite and Gemba's umber — the one sibling brand
built on a blue-gray base instead of a warm one.

| Token          | Hex       | Usage                                       |
| -------------- | --------- | -------------------------------------------- |
| `--white`      | `#ffffff` | Page canvas                                   |
| `--bg-warm`    | `#f4f5fb` | Alternate section backgrounds, card fills     |
| `--gray-50`    | `#f1f2f8` | Elevated surfaces, code blocks                |
| `--gray-100`   | `#e2e5f0` | Hover states, active tabs                     |
| `--gray-200`   | `#cbcedd` | Borders (strong), secondary button outlines   |
| `--gray-300`   | `#a6a8b8` | Tertiary text, the stack bars and cord         |
| `--gray-400`   | `#6e7080` | Secondary text, descriptions                  |
| `--gray-500`   | `#585a66` | Body text                                     |
| `--gray-700`   | `#33343f` | Emphasis text, card headings                  |
| `--gray-900`   | `#13141b` | Headlines, filled buttons, dark surfaces       |
| `--black`      | `#06070c` | Maximum contrast, hero headings               |

### The Warm Signal: Indigo (Blueprint Ink)

Every sibling brand names one warm tone as its "warm signal," per the shared
design language. Jidoka's signal is cool by name and warm by function: it is
the one accent color, used exactly as sparingly as Kata's hanko red or
Gemba's amber.

| Token       | Hex       | Usage                                        |
| ----------- | --------- | ----------------------------------------------|
| `--ink-50`  | `#eef1fc` | Warm section backgrounds, the top bar's fill  |
| `--ink-100` | `#dde3f8` | Highlighted cards, selected states            |
| `--ink-200` | `#b6c2ef` | Warm borders, active indicators               |
| `--ink-400` | `#5161d6` | The andon lamp, the terminal prompt, labels   |
| `--ink-600` | `#343ca0` | Warm accent text (used very sparingly)        |

**Usage rule:** Indigo appears in backgrounds, borders, the lamp, the top bar,
and the terminal prompt. **Never in body text or interactive elements.** It is
the lamp over the stack. It is not the stack itself.

---

## 5. Typography

### Font Selection

| Role               | Font                              | Fallback                                                     |
| ------------------- | ---------------------------------- | -------------------------------------------------------------- |
| **Display / Hero**  | `"Space Grotesk"` (Google Fonts)   | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| **Headings**        | `"Inter"` (Google Fonts)           | Same                                                            |
| **Body**            | `"Inter"`                          | Same                                                            |
| **Mono / Code**     | `"IBM Plex Mono"` (Google Fonts)   | `"SF Mono", Consolas, "Liberation Mono", monospace`             |

Jidoka is the one sibling brand without a distinct serif display face. Space
Grotesk is a geometric sans with a technical, drafted-plan character — it
reads as blueprint lettering, not as a heritage wordmark. Inter carries
headings and body. IBM Plex Mono ties Jidoka to Kata's mono face for shared
code and `rg` command legibility.

### Type Scale

Jidoka's hero size (`4.5rem`, weight 700) is the largest in the family. Every
other token matches the shared scale in
[../index.md § 3](../index.md#3-typography-pattern). See `main.css` for the
realized values.

---

## 6. Layout Patterns

The site publishes three page types, matching Gemba's pattern: a scroll home
page (`layout: home`, hand-written brand sections, no template hero), a docs
hub (`toc: false`, card grids under job headings), and a guide page (`toc:
true`, TOC rail at `1fr 220px`). The home page alternates `--bg-page` and
`--bg-warm` (cool-tinted) section backgrounds, same rhythm as the sibling
brands, and the footer inverts to `--gray-900`.

### Concrete Components

- **Buttons, cards, terminal.** Match the family's component table in
  [../index.md § 5](../index.md#5-components), realized with Jidoka's
  `--radius-sm/md/lg` of `6/10/14`, between Kata's `6/10/14` and Forward
  Impact Engineering's `8/12/16`.
- **Layer cards.** `.layer-card` renders each of the eight layers as a
  tagged card (`L0`–`L7`) with a name and one job sentence. It carries no
  mark — the mark is the stack as a whole, not one bar per card.
- **Footer (dark).** `--bg-inverted` behind `--text-on-dark`, secondary text
  `--gray-300`, dividers `--gray-700`. The word **Jidoka** in Space Grotesk
  700 beside the three-bar footer mark, lamp lit in `--ink-400`. Licenses in
  `--gray-300`.

---

## 7. Design Tokens

```css
:root {
  /* ── Surfaces — cool paper ── */
  --bg-page: #ffffff;
  --bg-warm: #f4f5fb;
  --bg-elevated: #eef0f8;
  --bg-hover: #e2e5f3;
  --bg-inverted: #13141b;

  /* ── Indigo (warm signal — blueprint ink) ── */
  --ink-50: #eef1fc;
  --ink-100: #dde3f8;
  --ink-200: #b6c2ef;
  --ink-400: #5161d6;
  --ink-600: #343ca0;

  /* ── Family alias (cross-brand component contract) ── */
  --accent-warm-50: var(--ink-50);
  --accent-warm-100: var(--ink-100);
  --accent-warm-200: var(--ink-200);
  --accent-warm-400: var(--ink-400);
  --accent-warm-600: var(--ink-600);

  /* ── Text ── */
  --text-primary: #06070c;
  --text-heading: #13141b;
  --text-body: #585a66;
  --text-secondary: #6e7080;
  --text-tertiary: #a6a8b8;
  --text-on-dark: #e7e8ef;

  /* ── Grays — cool tone ── */
  --gray-50: #f1f2f8;
  --gray-100: #e2e5f0;
  --gray-200: #cbcedd;
  --gray-300: #a6a8b8;
  --gray-400: #6e7080;
  --gray-500: #585a66;
  --gray-700: #33343f;
  --gray-900: #13141b;
  --black: #06070c;

  /* ── Borders ── */
  --border-default: #e2e5f0;
  --border-strong: #cbcedd;

  /* ── Radii — crisp, architectural ── */
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
  --font-display: "Space Grotesk", "Inter", -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    sans-serif;
  --font-mono: "IBM Plex Mono", "SF Mono", Consolas, "Liberation Mono",
    monospace;

  --text-hero-size: 4.5rem;
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

---

_Jidoka brand implementation of the [shared design language](../index.md).
Sibling brand to [Forward Impact Engineering](../fit/index.md),
[Kata](../kata/index.md), and [Gemba](../gemba/index.md). Updated August
2026._
