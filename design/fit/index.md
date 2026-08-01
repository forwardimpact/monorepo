# Forward Impact Engineering — Brand Implementation

> This is the Forward Impact Engineering realization of the
> [shared design language](../index.md). It is a monochrome, character-driven
> design system for seven open-source products: **Map**, **Pathway**,
> **Guide**, **Landmark**, **Summit**, **Outpost**, and **Gear**. It builds on
> the metaphor of engineers deployed "in the field." Three characters
> collaborate at the boundary between technology and the real world: the
> Engineer, the AI Agent, and the Business Stakeholder.
>
> The design embodies Deming's principle: improve the performance of developers
> and agents, improve quality, increase output, and bring pride of workmanship
> to engineering teams.

This file specifies what is brand-specific: the field metaphor, the three
characters and the scene grammar that frames them, the reusable base scenes,
the seven products, the concrete color palette, the typography choices, the
type scale, the layout patterns, the product visual language, and the CSS
design tokens. The product scenes and product icons live alongside in
[scenes.md](scenes.md) and [icons.md](icons.md). See
[../index.md](../index.md) for the abstract design language. It covers color,
typography, spacing, components, motion, and accessibility.

The three characters and the scene grammar are a Forward Impact brand asset.
Other brands derive from the shared design language. They do not inherit the
characters or the scene grammar.

---

## 1. The Field Metaphor

"The field" draws from three simultaneous meanings:

1. **Expedition**: Forward deployed. You operate with autonomy in unfamiliar
   terrain. The Map shows the territory. The Pathway is how you advance. The
   Guide keeps you oriented. The Summit is the peak the team aims to reach
   together. Outpost is where you prepare. Gear is what you carry.
2. **Scientific fieldwork**: Engineers embed with business units and domain
   experts. They work where the problems live.
3. **Topographic/landscape**: Contour maps, trail markers, compass roses,
   cairns, and mountain peaks. Humans use these tools to navigate unfamiliar
   ground.

The name **Forward Impact Engineering** captures all three. "Forward" comes from
forward deployed. "Impact" comes from the mission to change outcomes where they
happen. "Engineering" is the discipline that the engineer, the AI, and the
business carry out together.

The metaphor surfaces in illustration and iconography. The UI itself is clean
and functional. It is not themed like an outdoor gear catalog.

---

## 2. The Three Characters in the Field

This section specifies in full how to generate the three characters. It contains
everything you need to produce them as standalone illustrations. After you
generate the characters, they appear in scenes.
[§ 3](#3-scene-grammar) governs those scenes.

### Rendering

Characters use exactly four values: white, black, and one or two grays. They use
no other colors and no gradients.

| Property   | Specification                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette    | White for all primary surfaces. Black for all lines and strokes. One or two neutral grays for secondary surfaces (clothing, hair, accessories). No other values. |
| Stroke     | 2px, pure black. No brown-black, no warm black, no dark-gray strokes.                                                                                            |
| Fills      | Flat only. No gradients, no soft shading, no drop shadows, no gradient fills.                                                                                    |
| Style      | Hand-drawn line art, like a sketch in a work notebook. The strokes are slightly irregular. They are not vector-perfect.                                          |
| Background | Transparent or pure white. Draw the characters without scene context when you generate a character sheet.                                                        |
| Color      | None. Zero hue. Strictly achromatic. No brown, no tan, no ochre, no sepia, no cream, no beige, no warm tone of any kind.                                         |

In this brand, the hand-drawn voice reads as a _field notebook sketch_. An
engineer might draw it in the margin of a logbook between deployments.

### Shared Traits

- Round heads and simple dot eyes. Posture carries the expression. Facial
  detail does not.
- Roughly 2:3 proportions (wide:tall). The style is slightly cartoonish. It is
  not childish.
- Same height. Size creates no hierarchy.
- Always show them together. They work side by side, consult, and collaborate.
  They replace the solo hero with a team.

### The Engineer

- Animal-eared hoodie (bunny or fox ears on the hood). This is the signature
  element. The hoodie signals hacker/builder culture. Hair is visible under the
  hoodie.
- Visible backpack. It is the constant from the field metaphor. They carry
  their tools wherever they are deployed.
- Laptop with a round citrus fruit sticker. The sticker resembles the Apple
  logo, but it shows a citrus fruit instead.
- Posture: leans in, engaged, slightly informal.
- **Identifier constraint:** never remove the hoodie ears. They are the key
  identifier at all sizes.

### The AI Agent

- Round circle head, two large dot eyes, small curved smile.
- Headphones wrap around the head. They suggest that the Agent listens
  actively.
- Small backpack like the others. The Agent is deployed alongside humans. It is
  not above them.
- Simple geometric body. It is more geometric than the human characters.
- Laptop (pixel-art skull or space-invader sticker optional).
- Posture: upright, attentive, slightly turned toward others.
- **Identifier constraint:** never make the AI Agent visually dominant. It is an
  equal partner at the same height. It never floats above.

### The Business Stakeholder

- Business attire: collared shirt, tie, blazer. Neat hair, formal posture.
- **No backpack** — the domain expert who already knows the territory. The
  Stakeholder represents leadership and domain experts who define what good
  looks like: product owners, engineering managers, and the business
  stakeholders that engineers embed with. In this brand, the absent backpack
  reads as "the territory is theirs already."
- Laptop with a Claude Code sticker.
- Posture: engaged but composed, professional.
- **Identifier constraint:** never put a backpack on the Stakeholder. The
  absence is their trait.

### Group Dynamic

- Seated shoulder to shoulder, each on their own laptop. They are equals who
  collaborate.
- Emotional tone: "We're figuring this out together."
- A candid sketch of a work session. It is not a posed team photo.
- Close enough that elbows might bump.
- Together, the three characters embody the heart of forward deployed
  engineering. Engineer, AI, and business work at the boundary between
  technology and the real world.

### Scale

48px (small inline) to 400px+ (hero). At small sizes, reduce to silhouettes that
preserve the key identifiers: hoodie ears, round robot head, tie.

---

## 3. Scene Grammar

This section defines how to compose any scene with the characters from
[§ 2](#2-the-three-characters-in-the-field). Individual scene prompts
([§ 4](#4-reusable-base-scenes) and [scenes.md](scenes.md)) describe specific
poses, objects, and interactions. They should not restate these rules.

The entire scene uses the same small palette as the character sheet in
[§ 2](#2-the-three-characters-in-the-field): white for primary surfaces, black
for lines, and one or two neutral grays for secondary surfaces. The scene uses
no other values and no gradients.

### Scene Rendering

| Property   | Specification                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette    | White, black, one or two grays. Nothing else.                                                                                                                     |
| White      | Dominant value. Most of the image is white. Use no large gray surfaces.                                                                                           |
| Background | Pure white. No fills, textures, or shading.                                                                                                                       |
| Ground     | Position implies the ground. Draw no ground line, no ground plane, no floor shadow, and no scattered objects on the ground. Characters float on white.            |
| Objects    | 2px black stroke, light flat gray. Simpler than characters. Draw only the objects the scene prompt names. Never add extra props, debris, or environmental detail. |
| Fills      | Flat only. No gradients, no shading, no tinting.                                                                                                                  |
| Detail     | Minimum strokes needed. No hatching, no texture, no decoration.                                                                                                   |

### Composition

| Rule     | Specification                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Grouping | Shoulders overlap or nearly touch. Make one cluster. Do not make three separate figures. No vertical gap between any two characters. |
| Space    | Generous white space around the cluster                                                                                              |
| Framing  | Floats freely. Never add an outline or a border.                                                                                     |
| Scale    | 120px (cards) to 480px+ (hero)                                                                                                       |
| Tone     | Curious, conspiratorial, scrappy. Three people who chose this.                                                                       |

### Constraints

- **Identity** — each character keeps its
  [§ 2](#2-the-three-characters-in-the-field) traits. Never swap accessories or
  features between characters. The Stakeholder never has a backpack. The
  absence is their identifier. The Engineer always has one.
- **Foreground** — characters are the most detailed elements. Background objects
  use fewer strokes, lighter gray, and smaller scale than characters. If a
  background element is as bold as a character, simplify it.
- **Collaborative** — never show conflict.
- **Monochrome** — use gray to differentiate. Never use hues.
- **Laptops when seated** — seated characters always have laptops.
- **No framing** — no borders, containers, or panel edges.

### Illustration Checklist

[Grok](https://grok.com), a multi-modal LLM, generates the illustrations from
three layers. Each layer adds to the previous layer. It does not restate it.

| # | Layer           | Source                                                   | Provides                                              |
| - | --------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| 1 | Character sheet | [§ 2](#2-the-three-characters-in-the-field)              | The three characters as standalone figures            |
| 2 | Scene rules     | this section                                             | Composition, rendering, and constraints for any scene |
| 3 | Scene prompt    | [§ 4](#4-reusable-base-scenes) or [scenes.md](scenes.md) | Specific poses, objects, and interactions             |

A scene prompt should describe what the characters _do_: posture, gaze,
position, and objects in hand. It should not re-specify what they _look like_
or how scenes are _rendered_. Those belong to layers 1 and 2.

---

## 4. Reusable Base Scenes

These scenes show the trio without product-specific symbols. You reuse them
across contexts within the brand.

### Scene: Trio at Work (Default)

**Context:** Hero illustrations, suite-level marketing, default state.

```text
     🐰💻   🤖💻   👔💻
      \      |      /
       (huddled together)
```

All three sit side by side, each with a laptop. The Engineer sits left,
cross-legged on the ground, with the laptop balanced on one knee. The Engineer
leans sideways to peek at the Agent's screen. The AI Agent sits upright in the
center on a chair, head tilted slightly. The Agent is the only one with correct
posture. The Stakeholder sits right, with the chair tipped back on two legs and
one arm draped over the backrest. The Stakeholder types one-handed. The
shoulders overlap. Brand-specific product icons may appear in a row below.

**Key details:** The trio sits at different heights: the Engineer on the floor,
the Agent on a chair, and the Stakeholder tipped back. The heights create a
diagonal line that feels informal and alive. The Engineer clearly noses at
someone else's screen. The Stakeholder's tipped chair says "I've done this
before." The Agent's perfect posture is the deadpan counterpoint. The energy is
a late-night hackathon that happens to include someone in a blazer.

### Scene: Welcome Wave

**Context:** Onboarding screens, first-time user experience, landing page.

```text
    🐰🖐   🤖🖐   👔🖐
     hey!!   hello.   welcome.
```

All three stand and face the viewer. The Engineer strides toward the viewer with
both arms out wide. The Engineer is too enthusiastic and slightly off-balance.
The hoodie ears bounce. The AI Agent stands still, with one hand raised in a
precise right-angle wave and the head tilted in greeting. The Stakeholder stands
one step behind, with the hand raised palm-out at shoulder height. The
Stakeholder is the composed anchor. The feet are visible. Small action lines
surround the Engineer's movement.

**Key details:** The Engineer's over-eager stride forward creates the energy.
The Agent's geometric wave is the visual punchline. It is friendly but
mechanically precise. The Stakeholder's measured gesture grounds it: "Don't
worry, we're professional too." The three different levels of enthusiasm tell
you everything about the team dynamic in one frame.

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

All three stand behind a waist-high table covered with documents. The Engineer
(left) holds a single sheet in both hands, with the head tilted and the brow
furrowed. The Engineer squints at it with a puzzled expression. The AI Agent
(center) stands behind a neatly organized stack of papers, with both hands on
the pile. The Stakeholder (right) smiles and points with one index finger at a
specific line in an open book on the table. Loose papers lie scattered on the
floor under and around the table.

**Key details:** The scene shows three speeds of documentation work. The
Engineer still deciphers a single page. The Agent is already organized. The
Stakeholder already found the answer and points it out. The loose papers on the
floor beneath the table are the punchline. Documentation is messy work. The
Agent's neat stack in the center is the visual anchor between the Engineer's
confusion and the Stakeholder's confidence.

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

Each product has its own visual motif drawn from the field metaphor. The motif
surfaces in icons and scenes. It never surfaces in structural UI.

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

**Usage rule:** Sandstone appears in backgrounds and borders. It never appears
in text or interactive elements. It is ambient. It is parchment that shows
through the ink.

All grays are warm-tinted. They pull toward brown or taupe with a ~3–5% warm
shift. The difference accumulates across the page. The result is warmer, more
human, like paper.

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
serif. It evokes field journals, cartographic labels, and expedition logs. These
are the vocabulary of what people write down in the field.

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

The product scenes and the scene usage matrix live in a sibling file,
[scenes.md](scenes.md). The scenes cover Map, Pathway, Guide, Landmark, Summit,
Outpost, and Gear. They extend the
[reusable base scenes](#4-reusable-base-scenes) with brand-specific product
symbols.

---

## 9. Product Icons

The seven product icons, the icon system rules, and the combined suite mark live
in a sibling file, [icons.md](icons.md). The icons cover Map, Pathway, Guide,
Landmark, Summit, Outpost, and Gear. They share the brand icon grid (24px, 2px
stroke, no fill). They read as if someone drew them in the same notebook as the
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

The current product is bold (`700`). Others are regular (`400`) in
`--gray-400`. You can reach Summit from its product page. The primary nav does
not show Summit until launch. On mobile, the product switcher moves into the
hamburger menu.

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
  `border: 1.5px solid --gray-200`. On hover, the border warms to `--sand-200`.
- **Terminal / Code Blocks:** `background: --gray-900` (`#1c1a18`), text
  `#e8e5e0`, prompt `❯` in `--sand-400`, comments in `--gray-400`.
- **Contour Line Texture:** Thin wavy lines that repeat in `--gray-100` on
  `--white-warm` or `--sand-50` sections. 1px stroke, spaced 40px apart, opacity
  0.3. Never use it on pure white backgrounds.
- **Footer (Dark):** `background: --gray-900`, primary text `#e8e5e0`, secondary
  text `--gray-400`, dividers `--gray-700`. Trio silhouette + brand wordmark in
  white. Licenses (Apache-2.0 code, CC BY 4.0 docs) in `--gray-400`.

### Motion Additions

Beyond the shared motion defaults in
[../index.md § 6](../index.md#6-motion--interaction), this brand adds:

- **Trio idle.** Subtle sway per character (`translateY` ±2px, staggered
  3s/3.4s/2.8s, infinite). The sway respects `prefers-reduced-motion`.

---

## 11. Product Visual Language

Each product shares the core design system with subtle differentiators:

| Product      | Accent Metaphor                           | Empty State                                                 | Tone                                              |
| ------------ | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| **Map**      | Cartography: grids, pins, layers          | The AI Agent holds a blank map toward the viewer            | "Chart the territory before you move through it." |
| **Pathway**  | Trail: switchbacks, elevation marks       | The Engineer at the trailhead reads a trail sign            | "Navigate the trail."                             |
| **Guide**    | Navigation: compass, stars                | The AI Agent holds a compass toward the viewer              | "Find your bearing."                              |
| **Landmark** | Observation: cairns, survey markers       | The AI Agent beside the cairn holds a telescope outward     | "Check the cairn."                                |
| **Summit**   | Ascent: peaks, routes, team planning      | The trio looks up at the peak with a flag                   | "Reach the peak."                                 |
| **Outpost**  | Shelter: tents, campfire, logbooks        | A completed tent with a flag, door flap open                | "Set up camp."                                    |
| **Gear**     | Field kit: carabiner, multi-tool, cordage | The Engineer holds an empty open backpack toward the viewer | "Carry what you need."                            |

### Product-Specific UI Treatments

- **Map**: Data visualizations use map-like layouts. Nodes sit on a terrain grid
  for skill taxonomies and org structure.
- **Pathway**: Progress uses vertical elevation bars that fill upward. It does
  not use horizontal progress bars. Navigation steps use trail-like switchback
  patterns.
- **Guide**: A faint left-border in `--sand-200` indents AI responses. The
  result looks like a margin note in a field journal.
- **Landmark**: Dashboard trend lines and comparison bars overlay a subtle
  terrain grid.
- **Summit**: Team heatmaps use terrain-grid overlays. Capability bars fill
  upward like ascent meters. What-if scenarios use side-by-side peak outlines
  that show team composition before and after.
- **Outpost**: Document cards use warm-tinted backgrounds (`--sand-50`) that
  suggest pages in a notebook.
- **Gear**: The library catalog uses an inventory grid. Items appear as cards
  with category and "I need to…" intent badges. The verb-shaped index is the
  primary entry point. Code blocks show `npx fit-<name>` invocations
  prominently.

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
