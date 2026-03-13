# Design Spec: Forward Impact Team (FIT)

> A monochrome design system for five products — **Map**, **Pathway**,
> **Guide**, **Landmark**, and **Basecamp** — built around the metaphor of
> engineers deployed "in the field." Three characters — the Engineer, the AI
> Agent, and the Business Stakeholder — collaborate at the boundary between
> technology and the real world. Inspired by the restraint of Ollama and
> Moondream, adapted for a professional product suite.

---

## 0. The Metaphor

"The field" draws from three simultaneous meanings:

1. **Expedition**: Forward deployed — operating with autonomy in unfamiliar
   terrain. Basecamp is where you prepare. The Guide keeps you oriented. The
   Pathway is how you advance. The Map shows the territory.
2. **Scientific fieldwork**: Engineers embedded with business units and domain
   experts — working where the problems live.
3. **Topographic/landscape**: Contour maps, trail markers, compass roses, and
   cairns — tools humans use to navigate unfamiliar ground.

The name **Forward Impact Team** (FIT) captures all three: "Forward" from
forward deployed, "Impact" from the mission to change outcomes where they
happen, and "Team" because this work is fundamentally collaborative — engineer,
AI, and business working together.

The metaphor surfaces in illustration and iconography. The UI itself is clean
and functional, not themed like an outdoor gear catalog.

---

## 1. Design Philosophy

**Monochrome. Quiet. Purposeful. Warm at the edges.**

### Core Principles

1. **Monochrome with one warm signal.** Pure black and white base, with a single
   sandstone/khaki tone used sparingly for ambient warmth — campfire light on a
   black-and-white photograph.
2. **Topographic texture, not decoration.** Contour lines appear as subtle
   background textures, never as foreground elements.
3. **Three characters are the emotional core.** Hand-drawn monochrome figures
   replace the solo hero with a team.
4. **Typography creates hierarchy.** No accent colors. Size, weight, and spacing
   do all the work.
5. **Each product has a distinct terrain.** Map = charted territory. Pathway =
   trails and elevation. Guide = stars and bearing. Landmark = vantage points.
   Basecamp = shelter and foundation. These appear in icons and illustrations,
   never in structural UI.

---

## 2. Color Palette

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

## 3. Typography

### Font Selection

| Role               | Font                                | Fallback                                                    |
| ------------------ | ----------------------------------- | ----------------------------------------------------------- |
| **Display / Hero** | `"Instrument Serif"` (Google Fonts) | `Georgia, "Times New Roman", serif`                         |
| **Headings**       | `"DM Sans"` (Google Fonts)          | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| **Body**           | `"DM Sans"`                         | Same                                                        |
| **Mono / Code**    | `"DM Mono"` (Google Fonts)          | `"SF Mono", Consolas, "Liberation Mono", monospace`         |

The serif/sans pairing creates hierarchy beyond size and weight. Serifs evoke
field journals, cartographic labels, and expedition logs.

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

```
Instrument Serif, 64px, weight 400:

  Forward deployed engineers
  need better tools.

DM Sans, 18px, weight 400, gray-400:

  Map, Pathway, Guide, Landmark, and Basecamp — a suite for
  charting skills, navigating careers, solving problems,
  reading signals, and sharing what you learn.
```

---

## 4. The Characters

The visual identity is built around three characters who embody the
collaborative dynamic at the heart of forward deployed engineering. They are
always shown together — working side by side, consulting, collaborating. They
replace the solo hero with a team, reflecting that forward deployed work happens
at the intersection of engineering, AI, and business.

### Design Specifications

**Shared Traits:**

- **2px black stroke** with minimal gray fills — monochrome line art
- Round heads, simple dot eyes — expressive through posture, not facial detail
- Roughly 2:3 proportions (wide:tall), slightly cartoonish but not childish
- Same height — no hierarchy of size
- Hand-drawn style, like a field notebook sketch

**The Engineer:**

- Animal-eared hoodie (bunny or fox ears on the hood) — the signature element.
  The hoodie signals hacker/builder culture — someone who ships code, lives in
  terminals, and brings creative irreverence to serious problems.
- Visible backpack — the constant from the field metaphor: they carry their
  tools wherever they're deployed. Hair visible under the hoodie.
- Laptop with a round citrus fruit sticker (resembling Apple logo)
- Posture: leaning in, engaged, slightly informal

**The AI Agent:**

- Round circle head, two large dot eyes, small curved smile
- Headphones wrapping around the head — suggests active listening
- Small backpack like the others, signaling it's part of the team — deployed
  alongside humans, not hovering above them
- Simple geometric body form — more geometric than the human characters
- Laptop (pixel-art skull/space invader sticker optional)
- Posture: upright, attentive, slightly turned toward others

**The Business Stakeholder:**

- Business attire: collared shirt, tie, blazer. Neat hair, formal posture.
- **No backpack** — they're the domain expert who knows the territory, not the
  one carrying gear through it. They represent the scientists, product owners,
  and business leaders that FDEs are embedded with.
- Laptop with a Claude Code sticker
- Posture: engaged but composed, professional

**Group Personality:**

- Seated shoulder to shoulder, each on their own laptop — equals collaborating
- Emotional tone: "We're figuring this out together"
- Candid sketch of a working session, not a posed team photo
- Close enough that elbows might bump

**Scale:** 48px (small inline) to 400px+ (hero). At small sizes, reduce to
silhouettes preserving key identifiers: hoodie ears, robot head, tie.

---

## 5. Scenes

Scenes show the three characters interacting with each other and product
symbols. All rendered in monochrome line-art on clean white background with no
panel borders or background fills. Objects use the same 2px stroke as
characters.

### Scene Design Rules

| Rule           | Specification                                                    |
| -------------- | ---------------------------------------------------------------- |
| Background     | Pure white — no boxes, frames, or shading                        |
| Ground         | Implied by positioning — no explicit ground line                 |
| Object style   | Same 2px stroke monochrome line art                              |
| Composition    | Characters grouped tightly, centered — reads as a single cluster |
| Whitespace     | Generous space around the scene cluster                          |
| Scale          | 120px (cards) to 480px+ (hero)                                   |
| Emotional tone | Curious, collaborative, problem-solving — always active          |

---

### Reusable Base Scenes

#### Scene: Trio at Work (Default)

**Context:** Hero illustrations, suite-level marketing, default state.

All three seated side by side, each with a laptop. Engineer left, leaning
forward. AI Agent center, upright. Stakeholder right, composed. Shoulders almost
touching. Below them, the five product icons in a neat row.

```
     🐰💻   🤖💻   👔💻
      \      |      /
       (seated together)

  🗺    ⛰     🧭    🪨      ⛺
 Map  Pathway  Guide Landmark Basecamp
```

**Key details:** Laptops open and angled toward the viewer. Characters look at
their own screens or glance sideways at each other. Posture is relaxed but
focused — a working session, not a meeting.

#### Scene: Welcome Wave

**Context:** Onboarding screens, first-time user experience, landing page.

All three standing, facing the viewer, each raising one hand in a wave. Engineer
waves casually. AI Agent waves with stiff, cheerful robot gesture. Stakeholder
gives a measured wave at shoulder height. Stakeholder stands slightly forward,
welcoming guests into their space. Feet visible, small action lines near hands.

```
    🐰🖐   🤖🖐   👔🖐
     hi!    hello!   welcome!
```

**Key details:** The wave is warm but not over-the-top. Should feel like walking
into a friendly office and three colleagues looking up to greet you. Feet
visible — standing, not floating. Small action lines near waving hands.

#### Scene: Documentation Dig

**Context:** Documentation pages, knowledge base, "getting started" flows.

All three standing around a waist-high surface covered with stacked papers, open
binders, loose sheets. Engineer picks up a sheet, squinting at it. AI Agent
organizes a stack into a neat pile. Stakeholder points at something on an open
document. A few loose pages on the ground near their feet.

```
         📄 📄
    🐰   📋🤖📋   👔
     \   📄📄📄   /
      (table with papers)
         📄  📄
       (papers on floor)
```

**Key details:** Should feel like the moment you open a closet and everything
falls out — but the team handles it with good humor. The AI Agent's neat-stack
gesture contrasts with the general chaos. The Stakeholder knows where the
important thing is. Papers on the floor add life without cluttering silhouettes.

---

### Product Scenes

#### Scene: Map — Charting the Territory

**Context:** Map product pages, skills data model, taxonomy visualizations.

Trio huddled around a large unfolded map on the ground, crouched/kneeling in a
circle. Map is as wide as the three combined, showing route lines, grid marks,
pin markers. Engineer traces a route with one finger. AI Agent holds one corner
flat while pointing at markers. Stakeholder taps a location with authority.

```
        🐰
       ╱    ╲
     🤖 ┌──────┐ 👔
        │ ·→·  │
        │/  \× │
        └──────┘
       (large map)
```

#### Scene: Pathway — Plotting the Ascent

**Context:** Pathway product pages, skills catalogue, career features.

Trio at the base of a mountain range. Two or three peaks behind them with a
winding trail on the slopes. Engineer has one foot on the trail, pointing up. AI
Agent studies the trail, finger pointing at a switchback. Stakeholder stands
with arms crossed, surveying the range — they know the terrain.

```
           /\
          /  \   /\
    🐰   /    \ /  \   👔
     ↗  / ~~~~ \/    \  (arms crossed)
       🤖
      (studying trail)
```

Mountains use lighter stroke (1.5px) for depth. Trail connects base to summit.

#### Scene: Guide — Finding North

**Context:** Guide product pages, AI onboarding, career advice chatbot.

Trio paused to get bearings. AI Agent center, holding up a large compass (dinner
plate sized) with visible needle pointing north (north half filled black). Agent
tilts it toward the others. Engineer leans in, pushing back hoodie to see.
Stakeholder leans in, hand on chin, interpreting direction.

```
    🐰          👔
     \   🤖    /
      ╲ [🧭] ╱
       (compass held up)
```

Compass is the focal point — all eye lines converge on it. Agent shows the
compass, not dictating direction. Small radiating lines suggest it's active.

#### Scene: Landmark — Reading the Signals

**Context:** Landmark product pages, analysis dashboards, measurement features.

Trio on a rocky outcrop (elevated on canvas). A cairn with pennant flag to one
side. AI Agent holds a telescope, scanning the distance. Engineer holds graph
paper, comparing what Agent sees to data — one hand on paper, other pointing at
a line. Stakeholder extends one arm toward horizon, palm open. All three face
outward, away from viewer — observing signals together.

```
    🐰📊  🤖🔭  👔👉
       \    |    /
        (on outcrop)
     🪨 (cairn with flag)
```

Outward-facing orientation is distinctive — most scenes have characters facing
each other; here they face the same direction.

#### Scene: Basecamp — Setting Up Camp

**Context:** Basecamp product pages, knowledge management, workspace features.

Trio assembling an A-frame tent (character-height). Tent is half-assembled.
Engineer pulls a tent pole with both hands, leaning back with effort (action
lines). AI Agent holds opposite pole perfectly vertical with robotic precision.
Stakeholder behind the tent, holding flap open, checking the interior. A small
flag on the ground, ready for the apex.

```
    🐰  ╱  △  ╲  🤖
    (pull) / \ (hold)
          / 👔\
         /  ┃  \
        (checking inside)
         🏁 (flag ready)
```

Engineer's effort vs. Agent's effortlessness is a visual joke. Stakeholder's
focus on the interior signals Basecamp is about knowledge, not structure.

---

### Scene Usage Matrix

| Context                      | Scene                    | Size      |
| ---------------------------- | ------------------------ | --------- |
| Suite landing page hero      | Trio at Work             | 400–480px |
| Onboarding — first screen    | Welcome Wave             | 320–400px |
| Onboarding — getting started | Documentation Dig        | 280–360px |
| Map product hero             | Charting the Territory   | 320–400px |
| Pathway product hero         | Plotting the Ascent      | 320–400px |
| Guide product hero           | Finding North            | 320–400px |
| Landmark product hero        | Reading the Signals      | 320–400px |
| Basecamp product hero        | Setting Up Camp          | 320–400px |
| Product cards (suite page)   | Product scenes (cropped) | 120–160px |
| Error / empty states         | Single character         | 80–120px  |
| Loading states               | AI Agent + compass       | 48–80px   |

---

## 6. Product Icons

24px grid, 2px stroke, no fill — matching the characters' line weight. Should
feel drawn in the same notebook.

### Map — The Unfolded Map

```
  ┌─────┬─────┐
  │  ·  │     │
  │ / \ │  ×  │   ← route line with marker
  │/   \│     │
  └─────┴─────┘
```

Folded paper map, partially unfolded, with route line and position marker. The
territory mapped out before you move through it — Map is the central data store,
the single source of truth. Everything else references Map.

### Pathway — The Mountain Trail

```
      /\
     /  \    /\
    /    \  /  \
   /      \/    \
  ~~~~~~~~~~~~     ← winding trail at the base
```

Two or three overlapping peaks with a winding trail at the base. Trail line
slightly thinner (1.5px). The career journey through challenging terrain — shows
the route others have taken and helps you plot your own ascent.

### Guide — The Compass

```
        N
        │
   W ───┼─── E
        │
        S
```

Circle housing with compass needle. North half filled `--gray-900` — the only
filled element in the icon system. Orientation and direction — the Guide doesn't
carry you, it shows you which way to go. The filled north arrow subtly implies
AI (a "smart" element within an analog tool).

### Landmark — The Cairn

```
      ┃╲
     ┌┸─┐
    ┌────┐
   ┌──────┐
  ┌────────┐
  ──────────
```

Four or five stacked flat stones, tapered tower, with pennant flag at apex. Sits
on a ground line. Slightly irregular edges for hand-drawn feel. Observation,
measurement, and reference points — the cairn is human-made (not natural), just
as Landmark's analysis derives meaning from collected data.

### Basecamp — The Tent

```
      △
     / \
    /   \
   /  ┃  \
  /___┃___\
```

Equilateral triangle with vertical rectangle entrance at center-bottom. Sits on
a ground line. Shelter, preparation, shared space — the tent is temporary and
portable, reflecting that knowledge management should travel with you.

### Icon System Rules

| Rule        | Specification                                                 |
| ----------- | ------------------------------------------------------------- |
| Grid        | 24×24px with 2px padding (20px live area)                     |
| Stroke      | 2px, round caps, round joins                                  |
| Fill        | None, except Guide's compass needle (north half)              |
| Color       | `--gray-900` default, `--gray-400` when inactive              |
| Ground line | 1px stroke at bottom (Pathway, Landmark, Basecamp only)       |
| Style       | Hand-drawn feel — slightly imperfect corners, micro-variation |
| Sizes       | 24px (inline), 32px (nav), 48px (cards), 96px (marketing)     |

### Combined Icon: The Suite Mark

```
 ┌──┬──┐       /\              N         ┃╲          △
 │ /│× │      /  \  /\         │        ┌┸─┐       / \
 │/ │  │     /    \/  \    ───┼───    ┌────┐     /___\
 └──┴──┘    ~~~~~~~~~~~~       │      ──────
   Map        Pathway        Guide   Landmark   Basecamp
```

Five icons on a shared ground line, evenly spaced.

---

## 7. Spacing System

Base unit: `8px`

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

## 8. Layout Patterns

### Suite Landing Page

```
┌──────────────────────────────────────────────┐
│  [Trio logo]  FIT            [Nav]     [☰]  │
│                                              │
│       ┌──────────────────────────┐           │
│       │  Trio at Work scene      │           │
│       └──────────────────────────┘           │
│                                              │
│     Forward deployed engineers               │  ← Instrument Serif
│     need better tools.                       │
│                                              │
│     Chart skills. Navigate careers.          │  ← DM Sans, gray-400
│     Solve problems. Read the signals.        │
│                                              │
│           [ Explore the suite → ]            │
│                                              │
├──────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│  │ Map  │ │Pathwy│ │Guide │ │Landmk│ │Basecm││
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘│
├──────────────────────────────────────────────┤
│  Background: contour line texture            │
│     "Forward deployed engineers              │  ← Instrument Serif
│      operate where technology                │
│      meets the real world."                  │
├──────────────────────────────────────────────┤
│     [ Create your free account ]             │
│  © Forward Impact Team                       │
└──────────────────────────────────────────────┘
```

### Navigation Pattern

```
[Trio icon]  FIT   |   Map  ·  Pathway  ·  Guide  ·  Landmark  ·  Basecamp       [Docs]  [Sign in]
```

Current product is bold (`700`). Others are regular (`400`) in `--gray-400`. On
mobile, product switcher moves into hamburger menu.

### Warm/Cool Section Rhythm

```
Section 1: white (#ffffff)          — Hero
Section 2: warm (#faf9f7)           — Product cards
Section 3: white (#ffffff)          — Feature deep-dive
Section 4: warm (#faf9f7) + contours — Quote / philosophy
Section 5: white (#ffffff)          — CTA / sign-up
Footer:    gray-900 (#1c1a18)       — Dark footer (inverted)
```

---

## 9. Components

### Buttons

| Variant       | Background   | Border                   | Text               | Radius  | Padding     |
| ------------- | ------------ | ------------------------ | ------------------ | ------- | ----------- |
| **Primary**   | `--gray-900` | none                     | `#ffffff`          | `999px` | `14px 28px` |
| **Secondary** | `--white`    | `1.5px solid --gray-200` | `--gray-900`       | `999px` | `14px 28px` |
| **Ghost**     | transparent  | none                     | `--gray-700` + `→` | —       | `0`         |
| **Product**   | `--white`    | `1.5px solid --gray-200` | `--gray-900`       | `12px`  | `14px 24px` |

All buttons: DM Sans `15px`, weight `500`. Pill radius for marketing CTAs,
`12px` for in-app. Ghost buttons always include `→`.

### Cards

| Property      | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Background    | `--white` (on warm bg) or `--white-warm` (on white bg)   |
| Border        | `1.5px solid --gray-200`                                 |
| Border radius | `16px`                                                   |
| Padding       | `32px`                                                   |
| Hover         | Border → `--sand-200`, `translateY(-2px)`, subtle shadow |

### Terminal / Code Blocks

| Property      | Value                                |
| ------------- | ------------------------------------ |
| Background    | `--gray-900` (`#1c1a18`) — warm dark |
| Text          | `#e8e5e0` (warm light)               |
| Prompt        | `❯` in `--sand-400`                  |
| Comment text  | `--gray-400`                         |
| Border radius | `12px`                               |
| Padding       | `24px`                               |

### Contour Line Texture

Repeating thin wavy lines in `--gray-100` on `--white-warm` or `--sand-50`
sections. Lines are 1px stroke, spaced 40px apart, opacity 0.3. Never on pure
white backgrounds.

### Footer (Dark)

| Property         | Value                            |
| ---------------- | -------------------------------- |
| Background       | `--gray-900`                     |
| Text (primary)   | `#e8e5e0`                        |
| Text (secondary) | `--gray-400`                     |
| Border           | `--gray-700` for dividers        |
| Logo             | Trio silhouette + "FIT" in white |

---

## 10. Motion & Interaction

| Element                | Animation                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Page load**          | Hero stagger: scene (0ms) → heading (100ms) → subtitle (200ms) → CTAs (300ms). 500ms ease-out. |
| **Trio idle**          | Subtle sway per character (`translateY` ±2px, staggered 3s/3.4s/2.8s, infinite).               |
| **Product card hover** | Icon ±3° wiggle, card lifts 2px, border warms. 200ms.                                          |
| **Button hover**       | Background transition, 150ms. Primary adds warm shadow.                                        |
| **Section enter**      | Fade up on scroll (`translateY(16px)` → `0`, 400ms).                                           |
| **Nav product switch** | Underline slides, 200ms ease-in-out.                                                           |

All animations respect `prefers-reduced-motion`.

---

## 11. Product Visual Language

Each product shares the core design system with subtle differentiators:

| Product      | Accent Metaphor                      | Empty State                                      | Tone                                              |
| ------------ | ------------------------------------ | ------------------------------------------------ | ------------------------------------------------- |
| **Map**      | Cartography — grids, pins, layers    | AI Agent holding blank map toward viewer         | "Chart the territory before you move through it." |
| **Pathway**  | Elevation — trails, altitude markers | Engineer at trailhead, looking up at peaks       | "Where are you going? Let's map the route."       |
| **Guide**    | Navigation — compass, stars          | AI Agent holding compass toward viewer           | "I can help you find your bearings."              |
| **Landmark** | Observation — cairns, survey markers | AI Agent beside cairn, holding telescope outward | "What do the signals say?"                        |
| **Basecamp** | Shelter — tents, campfire, logbooks  | Completed tent with flag, door flap open         | "Everything you know, in one place."              |

### Product-Specific UI Treatments

- **Map**: Data visualizations use map-like layouts — nodes on a terrain grid
  for skill taxonomies and org structure.
- **Pathway**: Progress uses vertical elevation bars (filling upward) rather
  than horizontal progress bars.
- **Guide**: AI responses indented with a faint left-border in `--sand-200` —
  like a margin note in a field journal.
- **Landmark**: Dashboard trend lines and comparison bars overlaid on a subtle
  terrain grid.
- **Basecamp**: Document cards use warm-tinted backgrounds (`--sand-50`)
  suggesting pages in a notebook.

---

## 12. Character & Scene Guidelines

### Character Don'ts

- **Never show characters in conflict** — always collaborative
- **Never make the AI Agent dominant** — equal partner, not floating above
- **Never remove the Engineer's hoodie ears** — key identifier at all sizes
- **Never put a backpack on the Stakeholder** — absence is their trait
- **Never render in color** — monochrome line-art only. Gray fills for
  differentiation, never hues
- **Never show them without laptops in seated poses**
- **Never add background scenery** — no landscapes, trees, clouds (except
  Pathway mountains and Landmark outcrop, which are product symbols)
- **Never outline or frame a scene** — scenes float freely in whitespace

---

## 13. Accessibility

| Concern                   | Solution                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Color-only indicators** | Not applicable — monochrome uses shape, size, weight, position                                                       |
| **Contrast ratios**       | `--black`/`--white` = 21:1. `--gray-500`/`--white` = 5.7:1 (AA). `--gray-400`/`--white` = 4.1:1 (AA large text only) |
| **Focus states**          | 2px solid `--gray-900` outline with 2px offset                                                                       |
| **Motion sensitivity**    | All animations respect `prefers-reduced-motion`                                                                      |
| **Dark mode**             | Invert system — `--gray-900` bg, `--white-warm` text, white-on-dark line art                                         |
| **Scene alt text**        | All scenes include descriptive alt text identifying roles and action                                                 |

---

## 14. Design Tokens

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

_Design spec for the Forward Impact Team (FIT) product suite. March 2026._
