# Forward Impact Engineering — Brand Implementation

> The Forward Impact Engineering realization of the
> [shared design language](../index.md): a monochrome, character-driven design
> system for seven open-source products — **Map**, **Pathway**, **Guide**,
> **Landmark**, **Summit**, **Outpost**, and **Gear** — built around the
> metaphor of engineers deployed "in the field." Three characters — the
> Engineer, the AI Agent, and the Business Stakeholder — collaborate at the
> boundary between technology and the real world.
>
> The design embodies Deming's principle: improve the performance of developers
> and agents, improve quality, increase output, and bring pride of workmanship
> to engineering teams.

This file specifies what is brand-specific: the field metaphor, the three
characters and the scene grammar that frames them, the reusable base scenes,
the seven products, the concrete color palette, the typography choices, the
type scale, the layout patterns, the product visual language, and the CSS
design tokens. The product scenes and product icons live alongside in
[scenes.md](scenes.md) and [icons.md](icons.md). For the abstract design
language — color, typography, spacing, components, motion, and accessibility
— see [../index.md](../index.md).

The three characters and the scene grammar are a Forward Impact brand asset.
Other brands derive from the shared design language without inheriting them.

---

## 1. The Field Metaphor

"The field" draws from three simultaneous meanings:

1. **Expedition**: Forward deployed — operating with autonomy in unfamiliar
   terrain. The Map shows the territory. The Pathway is how you advance. The
   Guide keeps you oriented. The Summit is the peak the team aims to reach
   together. Outpost is where you prepare. Gear is what you carry.
2. **Scientific fieldwork**: Engineers embedded with business units and domain
   experts — working where the problems live.
3. **Topographic/landscape**: Contour maps, trail markers, compass roses,
   cairns, and mountain peaks — tools humans use to navigate unfamiliar ground.

The name **Forward Impact Engineering** captures all three: "Forward" from
forward deployed, "Impact" from the mission to change outcomes where they
happen, and "Engineering" as the discipline practiced collaboratively —
engineer, AI, and business working together.

The metaphor surfaces in illustration and iconography. The UI itself is clean
and functional, not themed like an outdoor gear catalog.

---

## 2. The Three Characters in the Field

This section is the complete specification for generating the three characters.
It contains everything needed to produce them as standalone illustrations. Once
generated, characters appear in scenes governed by [§ 3](#3-scene-grammar).

### Rendering

Characters use exactly four values — white, black, and one or two grays. No
other colors, no gradients.

| Property   | Specification                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette    | White for all primary surfaces. Black for all lines and strokes. One or two neutral grays for secondary surfaces (clothing, hair, accessories). No other values. |
| Stroke     | 2px, pure black. No brown-black, no warm black, no dark-gray strokes.                                                                                            |
| Fills      | Flat only. No gradients, no soft shading, no drop shadows, no gradient fills.                                                                                    |
| Style      | Hand-drawn line art — like a working notebook sketch. Slightly irregular strokes, not vector-perfect.                                                            |
| Background | Transparent or pure white. Characters are drawn without scene context when generated as a character sheet.                                                       |
| Color      | None. Zero hue. Strictly achromatic. No brown, no tan, no ochre, no sepia, no cream, no beige, no warm tone of any kind.                                         |

The hand-drawn voice reads, in this brand, as a _field notebook sketch_ —
something an engineer might draw in the margin of a logbook between
deployments.

### Shared Traits

- Round heads, simple dot eyes — expressive through posture, not facial detail
- Roughly 2:3 proportions (wide:tall), slightly cartoonish but not childish
- Same height — no hierarchy of size
- Always shown together — working side by side, consulting, collaborating. They
  replace the solo hero with a team.

### The Engineer

- Animal-eared hoodie (bunny or fox ears on the hood) — the signature element.
  The hoodie signals hacker/builder culture. Hair visible under the hoodie.
- Visible backpack — the constant from the field metaphor: they carry their
  tools wherever they're deployed.
- Laptop with a round citrus fruit sticker (resembles Apple logo, but a citrus
  fruit instead).
- Posture: leaning in, engaged, slightly informal.
- **Identifier constraint:** never remove the hoodie ears — key identifier at
  all sizes.

### The AI Agent

- Round circle head, two large dot eyes, small curved smile.
- Headphones wrapping around the head — suggests active listening.
- Small backpack like the others — deployed alongside humans, not above them.
- Simple geometric body — more geometric than the human characters.
- Laptop (pixel-art skull or space-invader sticker optional).
- Posture: upright, attentive, slightly turned toward others.
- **Identifier constraint:** never make the AI Agent visually dominant — equal
  partner, same height, not floating above.

### The Business Stakeholder

- Business attire: collared shirt, tie, blazer. Neat hair, formal posture.
- **No backpack** — the domain expert who already knows the territory.
  Represents leadership and domain experts who define what good looks like —
  product owners, engineering managers, and business stakeholders engineers
  are embedded with. In this brand, the absent backpack reads as "the
  territory is theirs already."
- Laptop with a Claude Code sticker.
- Posture: engaged but composed, professional.
- **Identifier constraint:** never put a backpack on the Stakeholder — absence
  is their trait.

### Group Dynamic

- Seated shoulder to shoulder, each on their own laptop — equals collaborating.
- Emotional tone: "We're figuring this out together."
- Candid sketch of a working session, not a posed team photo.
- Close enough that elbows might bump.
- Together, the three characters embody the heart of forward deployed
  engineering — engineer, AI, and business working at the boundary between
  technology and the real world.

### Scale

48px (small inline) to 400px+ (hero). At small sizes, reduce to silhouettes
preserving key identifiers: hoodie ears, round robot head, tie.

---

## 3. Scene Grammar

This section defines the rules for composing any scene with the characters from
[§ 2](#2-the-three-characters-in-the-field). Individual scene prompts
([§ 4](#4-reusable-base-scenes) and [scenes.md](scenes.md)) describe specific
poses, objects, and interactions — they should not restate these rules.

The entire scene uses the same small palette as the character sheet in
[§ 2](#2-the-three-characters-in-the-field): white for primary surfaces, black
for lines, and one or two neutral grays for secondary surfaces. No other
values, no gradients.

### Scene Rendering

| Property   | Specification                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Palette    | White, black, one or two grays — nothing else                                                                                                                |
| White      | Dominant value. Most of the image is white, no large gray surfaces.                                                                                          |
| Background | Pure white — no fills, textures, or shading                                                                                                                  |
| Ground     | Implied by positioning — no drawn ground line, no ground plane, no floor shadow, no scattered objects on the ground. Characters float on white.              |
| Objects    | 2px black stroke, light flat gray. Simpler than characters. Only objects named in the scene prompt — never add extra props, debris, or environmental detail. |
| Fills      | Flat only — no gradients, no shading, no tinting                                                                                                             |
| Detail     | Minimum strokes needed. No hatching, no texture, no decoration.                                                                                              |

### Composition

| Rule     | Specification                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Grouping | Shoulders overlapping or nearly touching — one cluster, not three separate figures. No vertical gap between any two characters. |
| Space    | Generous white space around the cluster                                                                                         |
| Framing  | Floats freely — never outlined or bordered                                                                                      |
| Scale    | 120px (cards) to 480px+ (hero)                                                                                                  |
| Tone     | Curious, conspiratorial, scrappy — three people who chose this                                                                  |

### Constraints

- **Identity** — each character keeps its
  [§ 2](#2-the-three-characters-in-the-field) traits. Never swap accessories or
  features between characters. The Stakeholder never has a backpack — absence
  is their identifier. The Engineer always has one.
- **Foreground** — characters are the most detailed elements. Background objects
  use fewer strokes, lighter gray, and smaller scale than characters. If a
  background element is as bold as a character, simplify it.
- **Collaborative** — never show conflict.
- **Monochrome** — gray for differentiation, never hues.
- **Laptops when seated** — seated characters always have laptops.
- **No framing** — no borders, containers, or panel edges.

### Illustration Checklist

Illustrations are generated with [Grok](https://grok.com), a multi-modal LLM,
from three layers. Each layer adds to the previous without restating it.

| #   | Layer           | Source                                            | Provides                                              |
| --- | --------------- | ------------------------------------------------- | ----------------------------------------------------- |
| 1   | Character sheet | [§ 2](#2-the-three-characters-in-the-field)       | The three characters as standalone figures            |
| 2   | Scene rules     | this section                                      | Composition, rendering, and constraints for any scene |
| 3   | Scene prompt    | [§ 4](#4-reusable-base-scenes) or [scenes.md](scenes.md) | Specific poses, objects, and interactions             |

A scene prompt should describe what the characters are _doing_ — posture,
gaze, position, objects in hand — without re-specifying what they _look like_
or how scenes are _rendered_. Those belong to layers 1 and 2.

---

## 4. Reusable Base Scenes

These scenes show the trio without product-specific symbols. They are reused
across contexts within the brand.

### Scene: Trio at Work (Default)

**Context:** Hero illustrations, suite-level marketing, default state.

```text
     🐰💻   🤖💻   👔💻
      \      |      /
       (huddled together)
```

All three seated side by side, each with a laptop. Engineer left, cross-legged
on the ground, laptop balanced on one knee, leaning sideways to peek at Agent's
screen. AI Agent center, seated upright on a chair, head tilted slightly — the
only one with correct posture. Stakeholder right, chair tipped back on two legs,
one arm draped over the backrest, typing one-handed. Shoulders overlapping.
Brand-specific product icons may appear in a row below.

**Key details:** The trio sits at different heights — Engineer on the floor,
Agent on a chair, Stakeholder tipped back — creating a diagonal line that feels
informal and alive. Engineer is clearly nosing at someone else's screen.
Stakeholder's tipped chair says "I've done this before." Agent's perfect posture
is the deadpan counterpoint. The energy is a late-night hackathon that happens
to include someone in a blazer.

### Scene: Welcome Wave

**Context:** Onboarding screens, first-time user experience, landing page.

```text
    🐰🖐   🤖🖐   👔🖐
     hey!!   hello.   welcome.
```

All three standing, facing the viewer. Engineer mid-stride toward the viewer,
both arms out wide — too enthusiastic, slightly off-balance, hoodie ears
bouncing. AI Agent stands still, one hand raised in a precise right-angle wave,
head tilted in greeting. Stakeholder one step behind, hand raised palm-out at
shoulder height — the composed anchor. Feet visible, small action lines around
Engineer's movement.

**Key details:** Engineer's over-eager stride forward creates the energy.
Agent's geometric wave is the visual punchline — friendly but mechanically
precise. Stakeholder's measured gesture grounds it: "Don't worry, we're
professional too." The three different levels of enthusiasm tell you everything
about the team dynamic in one frame.

### Scene: Documentation Dig

**Context:** Documentation pages, knowledge base, "getting started" flows.

```text
    🐰📄  🤖📚  👔📖
     \     |     /
    ┌──────────────┐
    │ papers books │
    └──────────────┘
       📄  📄
```

All three standing behind a waist-high table covered with documents. Engineer
(left) holds a single sheet in both hands, head tilted, brow furrowed —
squinting at it with a puzzled expression. AI Agent (center) stands behind a
neatly organized stack of papers, both hands resting on the pile. Stakeholder
(right) smiles and points with one index finger at a specific line in an open
book on the table. Loose papers scattered on the floor under and around the
table.

**Key details:** Three speeds of documentation work: Engineer still deciphering
a single page, Agent already organized, Stakeholder already found the answer and
is pointing it out. The loose papers on the floor beneath the table are the
punchline — documentation is messy work. Agent's neat stack in the center is the
visual anchor between Engineer's confusion and Stakeholder's confidence.

---

## 5. The Seven Products

| Product      | Question it answers                               |
| ------------ | ------------------------------------------------- |
| **Map**      | What does good engineering look like here?        |
| **Pathway**  | Where does my career path go from here?           |
| **Guide**    | How do I find my bearing?                         |
| **Landmark** | What milestones has my engineering reached?       |
| **Summit**   | Is this team supported to reach peak performance? |
| **Outpost**  | Am I prepared for what's ahead today?             |
| **Gear**     | What do I carry into the field?                   |

Each product has its own visual motif — drawn from the field metaphor — that
surfaces in icons and scenes but never in structural UI.

| Product      | Motif                  |
| ------------ | ---------------------- |
| **Map**      | Charted territory      |
| **Pathway**  | Trails and switchbacks |
| **Guide**    | Stars and bearing      |
| **Landmark** | Vantage points         |
| **Summit**   | The mountain peak      |
| **Outpost**  | Shelter and foundation |
| **Gear**     | Tools at hand          |

---

## 6. Color Palette

### Core Palette

| Token          | Hex       | Usage                                       |
| -------------- | --------- | ------------------------------------------- |
| `--white`      | `#ffffff` | Page canvas                                 |
| `--white-warm` | `#faf9f7` | Alternate section backgrounds, card fills   |
| `--gray-50`    | `#f5f4f2` | Elevated surfaces, code blocks              |
| `--gray-100`   | `#eae8e4` | Hover states, active tabs, tag backgrounds  |
| `--gray-200`   | `#d6d3cd` | Borders (strong), secondary button outlines |
| `--gray-300`   | `#b8b4ac` | Tertiary text, disabled states              |
| `--gray-400`   | `#8a8680` | Secondary text, descriptions                |
| `--gray-500`   | `#6b6763` | Body text                                   |
| `--gray-700`   | `#3d3a37` | Emphasis text, card headings                |
| `--gray-900`   | `#1c1a18` | Headlines, primary text, filled buttons     |
| `--black`      | `#0a0908` | Maximum contrast, hero headings             |

### The Warm Signal: Sandstone

| Token        | Hex       | Usage                                  |
| ------------ | --------- | -------------------------------------- |
| `--sand-50`  | `#faf8f5` | Warm section backgrounds               |
| `--sand-100` | `#f0ebe3` | Highlighted cards, selected states     |
| `--sand-200` | `#e0d7c9` | Warm borders, active indicators        |
| `--sand-400` | `#b8a88e` | Warm tertiary elements                 |
| `--sand-600` | `#8a7a62` | Warm accent text (used very sparingly) |

**Usage rule:** Sandstone appears in backgrounds and borders, never in text or
interactive elements. It's ambient — parchment showing through the ink.

All grays are warm-tinted (pulling toward brown/taupe, ~3–5% warm shift). The
difference accumulates across the page — warmer, more human, like paper.

---

## 7. Typography

### Font Selection

| Role               | Font                                | Fallback                                                    |
| ------------------ | ----------------------------------- | ----------------------------------------------------------- |
| **Display / Hero** | `"Instrument Serif"` (Google Fonts) | `Georgia, "Times New Roman", serif`                         |
| **Headings**       | `"DM Sans"` (Google Fonts)          | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| **Body**           | `"DM Sans"`                         | Same                                                        |
| **Mono / Code**    | `"DM Mono"` (Google Fonts)          | `"SF Mono", Consolas, "Liberation Mono", monospace`         |

**Instrument Serif** is this brand's specific reading of the family's display
serif: it evokes field journals, cartographic labels, and expedition logs — the
vocabulary of writing things down in the field.

### Type Scale

| Token                  | Size              | Weight | Line Height | Font             | Color        |
| ---------------------- | ----------------- | ------ | ----------- | ---------------- | ------------ |
| `--text-hero`          | `4rem` (64px)     | 400    | 1.05        | Instrument Serif | `--black`    |
| `--text-display`       | `2.75rem` (44px)  | 400    | 1.1         | Instrument Serif | `--gray-900` |
| `--text-h1`            | `2rem` (32px)     | 700    | 1.2         | DM Sans          | `--gray-900` |
| `--text-h2`            | `1.5rem` (24px)   | 600    | 1.25        | DM Sans          | `--gray-900` |
| `--text-h3`            | `1.25rem` (20px)  | 600    | 1.3         | DM Sans          | `--gray-700` |
| `--text-body`          | `1rem` (16px)     | 400    | 1.65        | DM Sans          | `--gray-500` |
| `--text-body-emphasis` | `1rem` (16px)     | 500    | 1.65        | DM Sans          | `--gray-700` |
| `--text-small`         | `0.875rem` (14px) | 400    | 1.5         | DM Sans          | `--gray-400` |
| `--text-badge`         | `0.75rem` (12px)  | 600    | 1           | DM Sans          | `--gray-700` |
| `--text-mono`          | `0.875rem` (14px) | 400    | 1.6         | DM Mono          | `--gray-500` |

### Hero Pattern

```text
Instrument Serif, 64px, weight 400:

  Empowered engineers
  deliver lasting impact.

DM Sans, 18px, weight 400, gray-400:

  Map, Pathway, Guide, Landmark, Summit, and Outpost — an open-source
  suite that helps organizations define great engineering, support career
  growth, and give every engineer the clarity to do their best work
  in the field.
```

---

## 8. Product Scenes

The product scenes — Map, Pathway, Guide, Landmark, Summit, Outpost, Gear — and
the scene usage matrix live in a sibling file: [scenes.md](scenes.md). They
extend the [reusable base scenes](#4-reusable-base-scenes) with brand-specific
product symbols.

---

## 9. Product Icons

The seven product icons — Map, Pathway, Guide, Landmark, Summit, Outpost, Gear —
plus the icon system rules and the combined suite mark live in a sibling file:
[icons.md](icons.md). They share the brand icon grid (24px, 2px stroke, no
fill) and read as if drawn in the same notebook as the
[characters](#2-the-three-characters-in-the-field).

---

## 10. Layout Patterns

### Suite Landing Page

```text
┌──────────────────────────────────────────────┐
│  [Trio logo]  Forward Impact Engineering  [Nav]  [☰]  │
│                                              │
│       ┌──────────────────────────┐           │
│       │  Trio at Work scene      │           │
│       └──────────────────────────┘           │
│                                              │
│     Empowered engineers                      │  ← Instrument Serif
│     deliver lasting impact.                  │
│                                              │
│     Define great engineering. Support         │  ← DM Sans, gray-400
│     career growth. Give every engineer       │
│     the clarity to do their best work        │
│     in the field.                            │
│                                              │
│           [ Explore the suite → ]            │
│                                              │
├──────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│ │ Map  │ │Pathwy│ │Guide │ │Landmk│ │Summit│ │Outpst││
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘│
├──────────────────────────────────────────────┤
│  Background: contour line texture            │
│     "The aim of leadership should be to      │  ← Instrument Serif
│      improve the performance of              │
│      developers and agents."                 │
├──────────────────────────────────────────────┤
│     [ Get started → ]                        │
│  © Forward Impact Engineering  ·  Apache-2.0 code  │
│     CC BY 4.0 docs                           │
└──────────────────────────────────────────────┘
```

### Navigation Pattern

```text
[Trio icon]  Forward Impact Engineering   |   Map  ·  Pathway  ·  Guide  ·  Landmark  ·  Summit  ·  Outpost       [Docs]  [Sign in]
```

Current product is bold (`700`). Others are regular (`400`) in `--gray-400`.
Summit is accessible from its product page but not shown in the primary nav
until launch. On mobile, product switcher moves into hamburger menu.

### Warm/Cool Section Rhythm

```text
Section 1: white (#ffffff)          — Hero
Section 2: warm (#faf9f7)           — Product cards
Section 3: white (#ffffff)          — Feature deep-dive
Section 4: warm (#faf9f7) + contours — Quote / philosophy
Section 5: white (#ffffff)          — CTA / get started
Footer:    gray-900 (#1c1a18)       — Dark footer (inverted), licenses
```

### Concrete Components

The component patterns in [../index.md § 5](../index.md#5-components)
instantiate with these colors:

- **Buttons (Primary):** `background: --gray-900`, text `#ffffff`.
- **Buttons (Secondary / Product):** `border: 1.5px solid --gray-200`, text
  `--gray-900`.
- **Cards:** `background: --white` (on warm bg) or `--white-warm` (on white bg),
  `border: 1.5px solid --gray-200`. On hover, border warms to `--sand-200`.
- **Terminal / Code Blocks:** `background: --gray-900` (`#1c1a18`), text
  `#e8e5e0`, prompt `❯` in `--sand-400`, comments in `--gray-400`.
- **Contour Line Texture:** Repeating thin wavy lines in `--gray-100` on
  `--white-warm` or `--sand-50` sections. 1px stroke, spaced 40px apart, opacity
  0.3. Never on pure white backgrounds.
- **Footer (Dark):** `background: --gray-900`, primary text `#e8e5e0`, secondary
  text `--gray-400`, dividers `--gray-700`. Trio silhouette + brand wordmark in
  white. Licenses (Apache-2.0 code, CC BY 4.0 docs) in `--gray-400`.

### Motion Additions

Beyond the shared motion defaults in
[../index.md § 6](../index.md#6-motion--interaction), this brand adds:

- **Trio idle.** Subtle sway per character (`translateY` ±2px, staggered
  3s/3.4s/2.8s, infinite). Respects `prefers-reduced-motion`.

---

## 11. Product Visual Language

Each product shares the core design system with subtle differentiators:

| Product      | Accent Metaphor                            | Empty State                                        | Tone                                              |
| ------------ | ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------- |
| **Map**      | Cartography — grids, pins, layers          | AI Agent holding blank map toward viewer           | "Chart the territory before you move through it." |
| **Pathway**  | Trail — switchbacks, elevation marks       | Engineer at trailhead, reading a trail sign        | "Navigate the trail."                             |
| **Guide**    | Navigation — compass, stars                | AI Agent holding compass toward viewer             | "Find your bearing."                              |
| **Landmark** | Observation — cairns, survey markers       | AI Agent beside cairn, holding telescope outward   | "Check the cairn."                                |
| **Summit**   | Ascent — peaks, routes, team planning      | Trio looking up at peak with flag                  | "Reach the peak."                                 |
| **Outpost**  | Shelter — tents, campfire, logbooks        | Completed tent with flag, door flap open           | "Set up camp."                                    |
| **Gear**     | Field kit — carabiner, multi-tool, cordage | Engineer holding empty open backpack toward viewer | "Carry what you need."                            |

### Product-Specific UI Treatments

- **Map**: Data visualizations use map-like layouts — nodes on a terrain grid
  for skill taxonomies and org structure.
- **Pathway**: Progress uses vertical elevation bars (filling upward) rather
  than horizontal progress bars. Trail-like switchback patterns for navigation
  steps.
- **Guide**: AI responses indented with a faint left-border in `--sand-200` —
  like a margin note in a field journal.
- **Landmark**: Dashboard trend lines and comparison bars overlaid on a subtle
  terrain grid.
- **Summit**: Team heatmaps use terrain-grid overlays. Capability bars fill
  upward like ascent meters. What-if scenarios use side-by-side peak outlines
  showing before/after team composition.
- **Outpost**: Document cards use warm-tinted backgrounds (`--sand-50`)
  suggesting pages in a notebook.
- **Gear**: Library catalog uses an inventory grid — items as cards with
  category and "I need to…" intent badges. The verb-shaped index is the primary
  entry point. Code blocks show `npx fit-<name>` invocations prominently.

---

## 12. Design Tokens

```css
:root {
  /* ── Surfaces ── */
  --bg-page: #ffffff;
  --bg-warm: #faf9f7;
  --bg-elevated: #f5f4f2;
  --bg-hover: #eae8e4;
  --bg-inverted: #1c1a18;

  /* ── Sand (warm signal) ── */
  --sand-50: #faf8f5;
  --sand-100: #f0ebe3;
  --sand-200: #e0d7c9;
  --sand-400: #b8a88e;
  --sand-600: #8a7a62;

  /* ── Family alias (cross-brand component contract) ── */
  --accent-warm-50: var(--sand-50);
  --accent-warm-100: var(--sand-100);
  --accent-warm-200: var(--sand-200);
  --accent-warm-400: var(--sand-400);
  --accent-warm-600: var(--sand-600);

  /* ── Text ── */
  --text-primary: #0a0908;
  --text-heading: #1c1a18;
  --text-body: #6b6763;
  --text-secondary: #8a8680;
  --text-tertiary: #b8b4ac;
  --text-on-dark: #e8e5e0;

  /* ── Borders ── */
  --border-default: #eae8e4;
  --border-strong: #d6d3cd;

  /* ── Radii ── */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
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
  --font-display: "Instrument Serif", Georgia, "Times New Roman", serif;
  --font-sans: "DM Sans", -apple-system, BlinkMacSystemFont,
               "Segoe UI", Roboto, sans-serif;
  --font-mono: "DM Mono", "SF Mono", Consolas,
               "Liberation Mono", monospace;

  --text-hero-size: 4rem;
  --text-hero-weight: 400;
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

_Forward Impact Engineering brand implementation of the
[shared design language](../index.md). Updated May 2026._
