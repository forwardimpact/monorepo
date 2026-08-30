---
name: deck-create
description: Generate PDF slide decks from user requests. Playwright renders the HTML slides to PDF. Use when the user asks to create a presentation, slide deck, or pitch deck. Pulls context from the knowledge base for company info, project details, and people.
compatibility: Requires Node.js. The skill installs Playwright on first use.
---

# Create Presentations

Write tier: `0-Draft`
Frontmatter: none

Generate PDF slide decks from user requests. Playwright renders the HTML slides
to PDF. This skill can pull context from the knowledge base for company info,
project details, and people.

## Trigger

Run when the user asks to create a presentation, slide deck, or pitch deck.

## Prerequisites

- Node.js installed
- The skill installs Playwright on first use

## Inputs

- User's description of the presentation
- `3-Team/` — optional context about company, product, team, projects

## Outputs

- `~/Desktop/presentation.pdf` — the generated PDF presentation

---

## Workflow

1. Check `3-Team/` for relevant context about the company, product, team,
   etc.
2. Make sure Playwright is installed:
   `bun install playwright && bunx playwright install chromium`
3. Create an HTML file at `/tmp/outpost-presentation.html` with slides
   (1280x720px each)
4. Include the required CSS from [references/slide.css](references/slide.css)
5. Run the conversion script:

        node scripts/convert-to-pdf.mjs

6. Tell the user: "Your presentation is ready at ~/Desktop/presentation.pdf"

**Do NOT show HTML code to the user. Just create the PDF and deliver it.**

The conversion script accepts optional arguments:

    node scripts/convert-to-pdf.mjs [input.html] [output.pdf]

Defaults: input = `/tmp/outpost-presentation.html`, output =
`~/Desktop/presentation.pdf`

## Source Annotations — REQUIRED

Decks are condensed views of source documents (knowledge-base notes, drafts
under `0-Draft/`, project docs). As a deck is iterated on, improvements get
**back-ported** to those sources. So every deck must record what maps where.
Embed the mapping as HTML comments (invisible in the browser and in the PDF).
A deck with untraceable content is incomplete.

### Comment syntax

    <!-- src: <relative-path>#<heading> -->
    <!-- src-note: <free text> -->

- `src:` maps the **next element** (and everything inside it) to a source file
  or section. A nested `src:` overrides its parent for that subtree.
- The path is **relative to the deck file itself**. The heading is the exact
  markdown heading text without the leading `#`-marks, as in an Obsidian
  `[[file#heading]]` link. Omit `#<heading>` to map to the whole file.
- `src: #<heading>` (path omitted) inherits the path from the nearest
  **enclosing** `src:`. Use this for repeated sections within one annotated
  slide, so the doc path is stated once per slide.
- `src-note:` records exceptions and nuances in prose: content synthesized
  from multiple sources, deliberately omitted source fields, or deviations
  from the field conventions.

### Placement rules

1. **Legend first.** Put one legend comment right after `<body>`. It explains
   the syntax and the deck's field conventions (see below). Never nest a
   literal `<!--` inside it — write the syntax without comment delimiters.
2. **One `src:` per slide**, mapping it to its primary source document, placed
   immediately before the `<section class="slide">`.
3. **One `src:` per repeated content block** (a goal, a priority, a feature
   card…), mapping it to the source section heading, placed immediately
   before the block's opening tag.
4. **Field conventions instead of per-paragraph comments.** When a block's
   inner elements map 1:1 to labelled source fields (e.g. `.card.why p` ↔
   `**Why it matters:**`), declare that mapping **once in the legend**.
   Annotate individual elements only when they deviate — then use `src-note:`.
5. **Synthesized content** (title pages, summary slides that condense several
   sources) gets a `src-note:` saying what it draws on.

### Authoring for back-portability

- Keep deck headings **verbatim from the source headings** where possible.
  The anchor then doubles as an integrity check.
- Keep stable IDs from the sources (A1, B2, goal numbers) visible in the deck
  content, so items self-identify even if comments are stripped.
- When back-porting: treat the deck text as the edited version of the mapped
  source field. Apply the change to the source file at the given heading.
  Carry the substance back, not the deck's condensed formatting. Find all
  annotations with `rg '<!-- src' <deck>.html`.

## PDF Rendering Rules

**These rules prevent problems when the PDF renders:**

1. **No layered elements** — Style content elements directly. Do not add
   separate background elements
2. **No box-shadow** — Use borders instead: `border: 1px solid #e5e7eb`
3. **Bullets with CSS only** — Use `li::before` pseudo-elements
4. **Content must fit** — Slides are 1280x720px with 60px padding. The safe area
   is 1160x600px. Use `overflow: hidden`
5. **No footers or headers** — No fixed/absolute positioned footer/header
   elements

## Interactive HTML Decks — Navigation & Event Standards

You can deliver the deck as a **standalone interactive HTML file**
(animated / navigable in the browser) instead of a static PDF. Then keep the
input handlers deliberately minimal. Rich event handlers fight with two things
the user needs: selection and copy of text on a slide, and text entry into
overlay tools (e.g. the `slide-annotator.js` review overlay).

**Required:**

1. **Arrow keys are the only navigation.** `→` / `ArrowRight` = next,
   `←` / `ArrowLeft` = previous. Nothing else advances slides.
2. **No click-to-advance.** Do NOT add click regions on the slide/stage that
   navigate (e.g. "click left/right third"). They fire on the mouse-up that ends
   a text-selection drag and jump the slide unexpectedly.
3. **No spacebar, PageUp/PageDown, or other global key bindings.** Space
   conflicts when the user types into an overlay input. The rest are redundant
   and surprising.
4. **A progress indicator may be clickable**, but it must live in the
   footer/chrome and never overlap slide content.
5. **Expose `window.deckGoto(index)`** (0-based) right after the slide-show
   function, so review/overlay tools can jump to a slide without a simulated
   click or key:

        function go(n) { /* ...show slide n... */ }
        window.deckGoto = go;

6. **Keep the hint honest** — the on-screen nav hint should read
   `← → to navigate` (don't advertise click/space).
7. **Use stable structural hooks.** Make each slide one element with class
   `.slide`. Put the slide-number label (if any) in a `.slide-num` element.
   The review overlay defaults to these selectors to detect and index slides.

These rules keep decks compatible with the **`deck-review`** skill. That skill
installs the `slide-annotator.js` review overlay (highlight text on a slide →
sidecar JSON of feedback that an agent acts on). After you produce an
interactive HTML deck, you can offer to run `deck-review` to make it reviewable.
See that skill for the install steps and the sidecar JSON schema.

## Constraints

- Always use the knowledge base for context when available
- Always embed source annotations (`src:` / `src-note:` comments + legend)
  that map deck sections to their source documents — see Source Annotations
- Output to `~/Desktop/presentation.pdf` unless the user specifies otherwise
- Keep slides clean and readable (max 5-6 bullet points per slide)
- Use the same styles throughout
- For interactive HTML decks, follow the navigation & event standards above
  (arrow-keys-only, no click-to-advance or spacebar)
