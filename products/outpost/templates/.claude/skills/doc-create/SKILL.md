---
name: doc-create
description: Generate PDF documents from user requests using Playwright to render HTML to A4 PDF. Use when the user asks to create a document, proposal, report, or any multi-page PDF that is not a slide deck. Pulls context from the knowledge base for company info, project details, and people.
compatibility: Requires Node.js installed. Playwright is installed on first use.
---

# Create Documents

Generate multi-page A4 PDF documents from user requests. Uses Playwright to
render self-contained HTML to PDF. Can pull context from the knowledge base for
company info, project details, and people.

## Trigger

Run when the user asks to create a document, proposal, report, funding
submission, brief, or any multi-page PDF that is not a slide deck.

## Prerequisites

- Node.js installed
- Playwright will be installed on first use

## Inputs

- User's description of the document
- `Knowledge/` — optional context about company, product, team, projects

## Outputs

- An HTML file and a PDF rendered from it, placed where the user specifies
  (default: `Knowledge/Projects/`)

---

## Workflow

1. Check `Knowledge/` for relevant context about the company, product, team,
   projects, or people mentioned.
2. Ensure Playwright is installed:
   `bun install playwright && bunx playwright install chromium`
3. Create a self-contained HTML file with all CSS inlined. The HTML must handle
   its own page layout — see **HTML Document Rules** below.
4. Run the conversion script:

   ```text
    node .claude/skills/doc-create/scripts/convert-to-pdf.mjs <input.html> [output.pdf]
   ```

   If output is omitted, the PDF is written alongside the HTML file with the
   same name.
5. Read the PDF back to visually verify it renders correctly. Check each page
   for overflow, clipped content, and correct page breaks. Fix and re-render if
   needed.

**Do NOT show HTML code to the user. Just create the PDF and deliver it.**

## HTML Document Rules

**Page layout:**

- Each page is a `<div class="page">` sized to exactly 210mm × 297mm (A4)
- Use `page-break-after: always` on every `.page` except the last
- Handle margins with padding inside `.page`, not with PDF margin settings
- The PDF is rendered with zero margins — the HTML owns all spacing

**Print colours:**

- Always set `-webkit-print-color-adjust: exact` and `print-color-adjust: exact`
  on `body` so background colours render in the PDF

**Fonts:**

- Use system fonts only — no external font loading
- Monospace stack: `'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace`
- Sans-serif stack:
  `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

**Content fitting:**

- After the first render, visually check every page for overflow
- Content must not bleed past the `.page` boundary — if it does, reduce spacing
  or font sizes and re-render
- Page numbers, if used, must not overlap with content. Position them in a
  corner that has whitespace

**CSS @page:**

```css
@page { size: A4; margin: 0; }
```

**Images:**

- Use absolute `file://` paths for local images
- Inline small images as base64 data URIs when possible
- Verify images appear in the rendered PDF — Playwright can fail silently on
  missing images

## Design Principles

- Clean, professional typography with clear hierarchy
- Use monospace for section headers and numbers for a technical/engineering feel
- Tables should be compact and readable — right-align monetary values
- Use colour sparingly: one accent colour, one dark, lots of white space
- Dark-background panels (timelines, hero sections) create visual contrast
- Callout boxes with left borders draw attention to key statements
