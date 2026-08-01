# Design Language

> A monochrome design language for product suites where people, AI agents, and
> domain experts collaborate as equals. The restraint of Ollama inspired it. It
> adapts that restraint for professional product suites.

This document describes the abstract design language: the philosophy and the
cross-brand patterns for color, typography, spacing, components, motion, and
accessibility. Concrete implementations live in per-brand files. They cover
palette values, fonts, product taxonomies, layouts, design tokens, and any
character-driven illustration system. Brands derive from this shared language
and stay recognizable as siblings. Each brand takes a distinct stance on
metaphor, palette, and motif. [usage.md](usage.md) holds the contract you
follow to derive a brand.

**Brand implementations:**

- [Forward Impact Engineering](fit/index.md) · [scenes](fit/scenes.md) ·
  [icons](fit/icons.md)
- [Kata](kata/index.md)

---

## 1. Design Philosophy

**Monochrome. Quiet. Purposeful. Warm at the edges.**

### Core Principles

1. **Monochrome with one warm signal.** The base is pure black and white. A
   single warm tone adds ambient warmth. Use it sparingly. It works like
   campfire light on a black-and-white photograph. The specific warm tone is a
   brand decision.
2. **Texture is not decoration.** Brand-chosen textures (e.g. contour lines)
   appear as subtle background elements. They never appear as foreground
   decoration.
3. **Typography creates hierarchy.** No accent colors. Size, weight, and spacing
   do all the work.
4. **Each product has its own visual motif.** Icons and illustrations
   differentiate the products. Structural UI never does.

---

## 2. Color Philosophy

**Monochrome with one warm signal.**

The base palette runs from pure black to pure white through a ramp of
warm-tinted grays. All grays carry a slight warm shift (about 3–5%, toward
brown or taupe). So the difference accumulates across a page. The result is
warmer, more human, like paper.

A single warm tone (e.g. sandstone, ochre, clay) sits on top:

- **Use it in backgrounds and borders. Never use it in text or interactive
  elements.**
- **It is ambient, like parchment that shows through the ink.**
- It provides a small ramp (50, 100, 200, 400, 600) for warm surfaces, selected
  cards, warm borders, and the rare warm accent.

Brands choose:

- The exact warm-tinted gray ramp (typically `--white`, `--white-warm`,
  `--gray-50` … `--gray-900`, `--black`).
- The warm-signal hue and its small ramp.
- Inverted treatments for dark surfaces (footers, terminals).

See [fit/index.md § Color Palette](fit/index.md#6-color-palette) for one
concrete realization.

---

## 3. Typography Pattern

**Display serif. Sans for everything else. Mono for code.**

| Role               | Family     |
| ------------------ | ---------- |
| **Display / Hero** | Serif      |
| **Headings**       | Sans-serif |
| **Body**           | Sans-serif |
| **Mono / Code**    | Monospace  |

The serif and sans combination creates hierarchy beyond size and weight. The
serif anchors the brand's character. What it specifically evokes is a brand
decision (e.g. field journals, training manuals, archival records). Brands
choose the specific families and the type scale. The pattern that combines
serif and sans is fixed.

A typical scale spans hero (≈ 64px serif) → display (≈ 44px serif) → h1–h3
(sans, 32/24/20px) → body (16px) → small/badge/mono (14/12/14px). Colors follow
the brand's gray ramp.

---

## 4. Spacing System

Base unit: `8px`. The rhythm extends from micro gaps to hero-scale margins.

| Token        | Value | Usage                               |
| ------------ | ----- | ----------------------------------- |
| `--space-1`  | 4px   | Micro gaps, icon internal spacing   |
| `--space-2`  | 8px   | Tight element gaps, pill padding    |
| `--space-3`  | 12px  | Badge padding, small card gaps      |
| `--space-4`  | 16px  | Default gaps, paragraph spacing     |
| `--space-6`  | 24px  | Card padding, element group spacing |
| `--space-8`  | 32px  | Between content blocks              |
| `--space-10` | 40px  | Section subtitle to content         |
| `--space-12` | 48px  | Between related sections            |
| `--space-16` | 64px  | Major section breaks                |
| `--space-20` | 80px  | Hero internal padding               |
| `--space-24` | 96px  | Top-level section margins           |
| `--space-32` | 128px | Hero top breathing room             |

### Key Spacing Guidelines

- **Hero top padding**: `128px` from nav to first content
- **Between major page sections**: `96–128px`
- **Card internal padding**: `24–32px`
- **Minimum touch target**: `44px` (accessibility)

### Content Width

| Context               | Max Width |
| --------------------- | --------- |
| Page container        | `1120px`  |
| Hero text block       | `640px`   |
| Prose / documentation | `680px`   |
| Card grid             | `1120px`  |

---

## 5. Components

### Buttons

| Variant       | Background   | Border                    | Text            | Radius  | Padding     |
| ------------- | ------------ | ------------------------- | --------------- | ------- | ----------- |
| **Primary**   | darkest gray | none                      | white           | `999px` | `14px 28px` |
| **Secondary** | white        | `1.5px solid` strong gray | darkest gray    | `999px` | `14px 28px` |
| **Ghost**     | transparent  | none                      | dark gray + `→` | —       | `0`         |
| **Product**   | white        | `1.5px solid` strong gray | darkest gray    | `12px`  | `14px 24px` |

All buttons: sans-serif `15px`, weight `500`. Pill radius for marketing CTAs,
`12px` for in-app. Ghost buttons always include `→`.

### Cards

| Property      | Value                                               |
| ------------- | --------------------------------------------------- |
| Background    | white (on warm bg) or warm white (on white bg)      |
| Border        | `1.5px solid` strong gray                           |
| Border radius | `16px`                                              |
| Padding       | `32px`                                              |
| Hover         | Border → warm tone, `translateY(-2px)`, soft shadow |

### Terminal / Code Blocks

| Property      | Value                    |
| ------------- | ------------------------ |
| Background    | darkest gray (warm dark) |
| Text          | warm light               |
| Prompt        | `❯` in warm accent       |
| Comment text  | mid gray                 |
| Border radius | `12px`                   |
| Padding       | `24px`                   |

### Footer (Dark)

| Property         | Value                  |
| ---------------- | ---------------------- |
| Background       | darkest gray           |
| Text (primary)   | warm light             |
| Text (secondary) | mid gray               |
| Border           | dark gray for dividers |
| Logo             | Brand wordmark         |

---

## 6. Motion & Interaction

| Element                | Animation                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Page load**          | Hero stagger: scene (0ms) → heading (100ms) → subtitle (200ms) → CTAs (300ms). 500ms ease-out. |
| **Product card hover** | Icon ±3° wiggle, card lifts 2px, border warms. 200ms.                                          |
| **Button hover**       | Background transition, 150ms. Primary adds warm shadow.                                        |
| **Section enter**      | Fade up on scroll (`translateY(16px)` → `0`, 400ms).                                           |
| **Nav product switch** | Underline slides, 200ms ease-in-out.                                                           |

All animations respect `prefers-reduced-motion`.

---

## 7. Accessibility

| Concern                   | Solution                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| **Color-only indicators** | Not applicable. Monochrome uses shape, size, weight, position                                   |
| **Contrast ratios**       | Black-on-white = 21:1. Body gray-on-white must meet AA (≥ 4.5:1). Large text may meet AA-large. |
| **Focus states**          | 2px solid darkest-gray outline with 2px offset                                                  |
| **Motion sensitivity**    | All animations respect `prefers-reduced-motion`                                                 |
| **Dark mode**             | Invert the system: darkest gray bg, warm-light text, white-on-dark line art                     |
| **Image alt text**        | All illustrations include descriptive alt text that identifies subject and action               |

---

_The design language is brand-agnostic. See [usage.md](usage.md) for how to
apply it. That page holds the contract you follow to derive a brand. It also
holds the four-layer CSS architecture that ships with it. See the brand
implementation files listed at the top of this page for concrete palettes,
fonts, products, and CSS tokens. Those files also hold any brand-specific
illustration system, such as Forward Impact's three characters and scene
grammar._
