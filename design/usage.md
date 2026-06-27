# Using the Design Language

> How to apply the [shared design language](index.md): the contract for
> deriving a brand that stays recognizable as a sibling, and the four-layer
> CSS architecture that realizes the language in code.

This document is about _use_. The language itself — philosophy, color,
typography, spacing, components, motion, and accessibility — lives in
[index.md](index.md). Read that first.

Brand-specific illustration systems — characters, scene grammar, base scenes —
live with the brand that owns them. Forward Impact Engineering is the only
brand that ships an illustration system; its layered illustration checklist is
in [`fit/index.md § 3 Scene Grammar`](fit/index.md#3-scene-grammar).

---

## 1. Deriving a Brand

A brand inherits the shared language and adds its own interpretation. The split
below preserves family resemblance: someone who has seen one brand should
immediately recognize a sibling, even when the metaphor and palette differ.

### Inherited (do not override)

These elements are the family's shared DNA. A brand that diverges on any of them
stops being part of the family.

- **Monochrome with one warm signal**
  ([index.md § 2](index.md#2-color-philosophy)). The hue varies; the pattern
  doesn't.
- **Typography pairing** — display serif + sans body + monospace code
  ([index.md § 3](index.md#3-typography-pattern)).
- **8px spacing rhythm** and the spacing token names
  ([index.md § 4](index.md#4-spacing-system)).
- **Component vocabulary** — buttons (primary/secondary/ghost/product), cards,
  terminal/code blocks, dark footer ([index.md § 5](index.md#5-components)).
- **Motion defaults** and `prefers-reduced-motion` compliance
  ([index.md § 6](index.md#6-motion--interaction)).
- **Accessibility rules** ([index.md § 7](index.md#7-accessibility)).

### Specified per brand

These are the dimensions a brand uses to find its distinct voice while staying
inside the family.

- **Premise / metaphor** — what world the brand inhabits (e.g. expedition,
  practice, fieldwork). Surfaces in motifs and naming, never in structural UI.
- **Product taxonomy** — which products belong to the brand and what each one
  answers.
- **Illustration system** — whether the brand uses characters, object-only
  motifs, or no illustrations at all. If characters are used, the brand owns
  their full specification, the scene grammar that frames them, and any reusable
  base scenes. Forward Impact Engineering's three characters and scene grammar
  live in
  [`fit/index.md § 2–4`](fit/index.md#2-the-three-characters-in-the-field).
- **Color values** — the warm-tinted gray ramp and the warm-signal hue and ramp.
  The pattern is fixed; the values are not.
- **Typeface choices** — specific serif, sans, and mono families, plus
  type-scale numbers (sizes, weights, line heights).
- **Product motifs** — visual symbols (e.g. compass, cairn, dojo mat) used in
  product icons and scenes (if the brand ships them).
- **Product icons** — drawn on the brand's icon grid (typically 24px, 2px
  stroke, no fill except where the brand explicitly notes).
- **Layout patterns** — landing page, navigation, section rhythm specific to the
  brand's site.
- **Product visual language** — UI treatments per product (e.g. progress bar
  styles, dashboard overlays).
- **Radii values** — concrete `--radius-sm/md/lg` numbers may differ per brand
  to match the brand's material vocabulary (e.g. journal cards vs stamped
  paper). Brands diverging on radii must restate the affected component specs in
  their own `index.md`, since the family's component vocabulary in
  [index.md § 5](index.md#5-components) names sizes only by token.
- **CSS design tokens** — the concrete `:root` realization of the above.

### Cross-brand component contract

Components inherited from [index.md § 5](index.md#5-components) must reference
the family **semantic tokens** (`--bg-page`, `--bg-warm`, `--text-primary`,
`--border-strong`, `--accent-warm-200`, `--accent-warm-400`, etc.), never the
brand-specific palette tokens (`--sand-200`, `--ink-400`, …). Each brand exposes
its warm-signal ramp both under a brand-specific name (for use inside that
brand's docs and worked examples) **and** under the family alias
`--accent-warm-{50,100,200,400,600}`. Shared component code that targets
`--accent-warm-*` then renders correctly under any brand's `:root`.

### File structure

The `design/` folder layers shared specification, shared assets, and
per-brand implementations:

- `index.md` — the abstract design language ([§ 1–7](index.md))
- `usage.md` — this file (how to apply)
- `assets/{base,layout,components}.css` — shared, brand-agnostic
  stylesheets that every site copies in at build time (see
  [§ 2](#2-css-architecture))
- `<brand>/` — per-brand implementations

A brand lives in `design/<brand>/`:

- `index.md` — premise, products, palette, typography, layout patterns, product
  visual language, CSS tokens, and (optionally) any brand-owned illustration
  system. Links back to the shared language with `../index.md`.
- `scenes.md` — product scenes and the scene usage matrix _(optional; only
  brands that ship illustrations)_.
- `icons.md` — product icons, icon system rules, and any combined suite mark
  _(optional)_.
- `assets/` — brand-specific SVG illustrations and icons _(optional)_.

Visual artifact files (`scenes.md`, `icons.md`) sit alongside `index.md` to keep
the brand entry point short and the artifact catalogues easy to scan
side-by-side.

Add the brand to the "Brand implementations" list at the top of
[index.md](index.md). See [`fit/`](fit/index.md) as a worked example with a
full illustration system, and [`kata/`](kata/index.md) as a worked example
without one.

---

## 2. CSS Architecture

The design language ships as four layered stylesheets. Three brand-agnostic
layers live in `design/assets/`; the brand layer lives in each site's
`<site>/assets/main.css`. Every site's `justfile` copies the shared layers
into its own `assets/` folder at build time, so a site only authors and
versions its brand layer.

### Layers

| File                         | Provides                                                                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design/assets/base.css`     | Reset, body defaults, prose typography (`h1`–`h4`, `p`, `strong`, `a`, `.text-hero`, `.text-subtitle`), `:focus-visible`, `prefers-reduced-motion`. Implements [§ 3 Typography](index.md#3-typography-pattern) and [§ 7 Accessibility](index.md#7-accessibility).                  |
| `design/assets/layout.css`   | Page chrome — `.site-header` + `.nav-*`, `.site-footer`, `.page-container`, `.content-product`, `.page-content` prose (lists, blockquote, hr, img, tables), `.layout-{home,product}`, `.hero` + `fadeUp`, `.section` + `.section-warm`, `.with-toc` + `.toc-nav`, structural responsive. Implements [§ 4 Spacing](index.md#4-spacing-system) plus the dark footer from [§ 5 Components](index.md#5-components). |
| `design/assets/components.css` | In-page widgets — `.btn-{primary,secondary,ghost}`, `.grid` + `.product-card` (with `iconWiggle`), `code` / `pre`, mermaid stripping, `.reveal`. Implements the Buttons, Cards, and Terminal/Code Blocks from [§ 5 Components](index.md#5-components) and the motion defaults from [§ 6 Motion](index.md#6-motion--interaction). |
| `<site>/assets/main.css`     | Font `@import`, the `:root` token block, brand-only motifs (e.g. fit's `.section-contour` contour texture, kata's `.section-rail` kanban-rail equivalent), brand-only sections (e.g. fit's `.section-philosophy`), responsive token overrides. Realizes [§ 2 Color](index.md#2-color-philosophy) and the brand-specific pieces of [§ 3 Typography](index.md#3-typography-pattern). |

The shared layers reference only family tokens — semantic
surface/text/border tokens (`--bg-page`, `--text-primary`,
`--border-strong`, …), the warm-signal alias
`--accent-warm-{50,100,200,400,600}`, the gray ramp (`--gray-50`
through `--gray-900`), and the spacing/radius/typography ramps. They
never reference brand-specific palette names like `--sand-200` or
`--ink-400` (see [§ 1 Cross-brand component
contract](#cross-brand-component-contract)).

### Cascade order

Stylesheets are linked in the site template in this order so brand rules
override shared defaults without `!important`:

```html
<link rel="stylesheet" href="/assets/base.css" />
<link rel="stylesheet" href="/assets/layout.css" />
<link rel="stylesheet" href="/assets/components.css" />
<link rel="stylesheet" href="/assets/main.css" />
```

### Build-time copy

A site's `justfile` copies `design/assets/*.css` into its own `assets/`
folder, alongside any brand SVGs from `design/<brand>/assets/`:

```just
brand_assets  := "../../design/<brand>/assets"
shared_assets := "../../design/assets"

build:
    mkdir -p assets
    cp {{brand_assets}}/*.svg assets/
    cp {{shared_assets}}/*.css assets/
```

The site repo tracks only its brand `main.css`; the copied shared layers
and SVGs are gitignored.

### Brand `:root` contract

Each brand `main.css` must define every token the shared layers consume.
See the canonical realizations in
[`fit/index.md § 12 Design Tokens`](fit/index.md#12-design-tokens) and
[`kata/index.md § 7 Design Tokens`](kata/index.md#7-design-tokens).
The contract:

- **Surfaces** — `--bg-page`, `--bg-warm`, `--bg-elevated`, `--bg-hover`,
  `--bg-inverted`
- **Text** — `--text-primary`, `--text-heading`, `--text-body`,
  `--text-secondary`, `--text-tertiary`, `--text-on-dark`
- **Borders** — `--border-default`, `--border-strong`
- **Gray ramp** — `--gray-50` through `--gray-900`, plus `--black`
- **Warm signal** — both the brand-specific palette (e.g. `--sand-*`,
  `--ink-*`) **and** the family alias
  `--accent-warm-{50,100,200,400,600}`
- **Spacing** — `--space-1` through `--space-32`
- **Radii** — `--radius-{sm,md,lg,pill}`
- **Typography** — `--font-{display,sans,mono}`,
  `--text-{hero,display,h1,h2,h3,body,small,badge}-size`, and
  `--text-hero-weight` (brands set this per voice — fit's serif display
  reads at 400, kata's slab display reads at 700)
- **Transitions** — `--ease-default`,
  `--duration-{fast,normal,slow}`

---

_How-to companion to the [shared design language](index.md). For concrete
palettes, fonts, products, and CSS tokens — plus any brand-owned illustration
system — see the brand implementation files listed at the top of that page._
