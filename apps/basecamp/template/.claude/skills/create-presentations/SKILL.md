---
name: create-presentations
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
- `knowledge/` — optional context about company, product, team, projects

## Outputs

- `~/Desktop/presentation.pdf` — the generated PDF presentation

---

## Workflow

1.  Check `knowledge/` for relevant context about the company, product, team,
    etc.
2.  Ensure Playwright is installed:
    `npm install playwright && npx playwright install chromium`
3.  Create an HTML file at `/tmp/basecamp-presentation.html` with slides
    (1280x720px each)
4.  Include the required CSS from [references/slide.css](references/slide.css)
5.  Run the conversion script:

        node scripts/convert-to-pdf.js

6.  Tell the user: "Your presentation is ready at ~/Desktop/presentation.pdf"

**Do NOT show HTML code to the user. Just create the PDF and deliver it.**

The conversion script accepts optional arguments:

    node scripts/convert-to-pdf.js [input.html] [output.pdf]

Defaults: input = `/tmp/basecamp-presentation.html`, output =
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

## Constraints

- Always use the knowledge base for context when available
- Output to `~/Desktop/presentation.pdf` unless user specifies otherwise
- Keep slides clean and readable — max 5-6 bullet points per slide
- Use consistent styling throughout
