---
name: deck-create
description: Generate PDF slide decks from user requests using Playwright to render HTML slides to PDF. Use when the user asks to create a presentation, slide deck, or pitch deck. Pulls context from the knowledge base for company info, project details, and people.
compatibility: Requires Node.js installed. Playwright is installed on first use.
---

# Create Presentations

Generate PDF slide decks from user requests. Uses Playwright to render HTML
slides to PDF. Can pull context from the knowledge base for company info,
project details, and people.

## Trigger

Run when the user asks to create a presentation, slide deck, or pitch deck.

## Prerequisites

- Node.js installed
- Playwright will be installed on first use

## Inputs

- User's description of the presentation
- `Knowledge/` — optional context about company, product, team, projects

## Outputs

- `~/Desktop/presentation.pdf` — the generated PDF presentation

---

## Workflow

1. Check `Knowledge/` for relevant context about the company, product, team,
   etc.
2. Ensure Playwright is installed:
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

## PDF Rendering Rules

**These prevent rendering issues in PDF:**

1. **No layered elements** — Style content elements directly, no separate
   background elements
2. **No box-shadow** — Use borders instead: `border: 1px solid #e5e7eb`
3. **Bullets via CSS only** — Use `li::before` pseudo-elements
4. **Content must fit** — Slides are 1280x720px with 60px padding. Safe area is
   1160x600px. Use `overflow: hidden`
5. **No footers or headers** — No fixed/absolute positioned footer/header
   elements

## Interactive HTML Decks — Navigation & Event Standards

When the deck is delivered as a **standalone interactive HTML file** (animated /
navigable in the browser) rather than a static PDF, keep input handling
deliberately minimal. Rich event handling fights with two things the user needs:
selecting/copying text on a slide, and typing into overlay tools (e.g. the
`slide-annotator.js` review overlay).

**Required:**

1. **Arrow keys are the only navigation.** `→` / `ArrowRight` = next,
   `←` / `ArrowLeft` = previous. Nothing else advances slides.
2. **No click-to-advance.** Do NOT add click regions on the slide/stage that
   navigate (e.g. "click left/right third"). They fire on the mouse-up that ends
   a text-selection drag and jump the slide unexpectedly.
3. **No spacebar, PageUp/PageDown, or other global key bindings.** Space
   conflicts with typing in overlay inputs; the rest are redundant and
   surprising.
4. **A progress indicator may be clickable**, but it must live in the
   footer/chrome and never overlap slide content.
5. **Expose `window.deckGoto(index)`** (0-based) right after the slide-show
   function, so review/overlay tools can jump to a slide without simulating
   clicks or keys:

        function go(n) { /* ...show slide n... */ }
        window.deckGoto = go;

6. **Keep the hint honest** — the on-screen nav hint should read
   `← → to navigate` (don't advertise click/space).
7. **Use stable structural hooks.** Make each slide one element with class
   `.slide`, and put the slide-number label (if any) in a `.slide-num` element.
   The review overlay defaults to these selectors to detect and index slides.

These rules keep decks compatible with the **`deck-review`** skill, which
installs the `slide-annotator.js` review overlay (highlight text on a slide →
sidecar JSON of feedback that an agent acts on). After producing an interactive
HTML deck, you can offer to run `deck-review` to make it reviewable; see that
skill for the install steps and the sidecar JSON schema.

## Constraints

- Always use the knowledge base for context when available
- Output to `~/Desktop/presentation.pdf` unless user specifies otherwise
- Keep slides clean and readable — max 5-6 bullet points per slide
- Use consistent styling throughout
- For interactive HTML decks, follow the navigation & event standards above
  (arrow-keys-only; no click-to-advance or spacebar)
