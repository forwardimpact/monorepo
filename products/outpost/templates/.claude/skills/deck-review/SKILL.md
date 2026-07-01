---
name: deck-review
description: Add a lightweight text-highlight review overlay to an HTML deck. Lets you highlight text on slides and capture feedback as a sidecar JSON (with source line/column + context) that an agent can act on in small iterations. Use when the user asks to add review/annotation/highlight/comment capability to a deck, make a deck "reviewable", or wants to mark up slides for revision. Pairs with the deck-create skill.
compatibility: Standalone HTML deck opened in a Chromium-based browser (Chrome/Edge). No build step, no server, no dependencies.
---

# Add a Review Overlay to a Deck

Install the self-contained `slide-annotator.js` overlay onto an HTML deck so the
user can **highlight text on a slide and save the feedback as a sidecar JSON**.
Each annotation carries a robust anchor (exact text + surrounding context +
slide) and, once the folder is connected, the resolved
**source line, column and context lines** — so an agent can locate and edit the
exact text in small iterations.

This is the companion to **`deck-create`**: decks produced by `deck-create`
already follow the navigation/structure standards this overlay needs, and this
overlay is designed to drop onto them with one script tag.

## Trigger

Run when the user asks to add review / annotation / highlight / comment / markup
capability to a deck, "make this deck reviewable", or to set up a feedback loop
on slides.

## Inputs

- Path to the target deck `.html` file (ask, or default to the most recently
  edited `*.html` in `Drafts/`).
- The bundled tool at `assets/slide-annotator.js` (this skill's own copy is the
  source of truth — edit it here, then re-install to update decks).

## Outputs

- `slide-annotator.js` copied next to the deck.
- One `<script>` tag injected into the deck before `</body>`.
- At review time, a sidecar `‹deck›.annotations.json` written next to the deck.

---

## Install steps

1. **Resolve the deck path** (absolute). Confirm it is an HTML deck, not a PDF.

2. **Check compatibility** (see *Compatibility contract* below). The two things
   that matter:
   - **Slide selector** — each slide is one element with a stable class
     (default `.slide`). If the deck uses a different class, note it for step 4.
   - **Navigation hook** — the deck exposes `window.deckGoto(index)` (0-based).
     If it has a slideshow function (e.g. `go(n)`) but no hook, add one line
     right after it: `window.deckGoto = go;`. Without it the overlay still works
     (the panel's *Go* button falls back to `scrollIntoView`), but it can't jump
     to a hidden slide precisely.
   - Optionally a slide-number label element (default `.slide-num`) for nicer
     labels in the panel — purely cosmetic.

3. **Install the tool**: copy this skill's `assets/slide-annotator.js` into the
   **same directory as the deck**. Resolve `~` to `$HOME`; pass the Write/copy a
   full path.

4. **Inject the script tag** immediately before `</body>` (idempotent — skip if
   a `slide-annotator` script tag is already present):

   ```html
   <!-- Review overlay: highlight text on a slide → sidecar JSON. Self-contained, optional. -->
   <script src="slide-annotator.js" defer
           data-slide-selector=".slide"
           data-label-selector=".slide-num"></script>
   ```

   Set `data-slide-selector` / `data-label-selector` to match the deck if it
   differs from the defaults. If there are no slide elements at all, the tool
   treats the whole `<body>` as one container.

5. **Tell the user how to use it** (see *Using the overlay*). Do **not** add any
   other dependency or framework — the tool is plain JS and must stay that way.

## Compatibility contract (must match `deck-create`)

The overlay relies only on these conventions, which `deck-create` decks already
follow:

| Convention | Default | Why the overlay needs it |
|---|---|---|
| One element per slide with a stable class | `.slide` | locate which slide a highlight is on; index slides |
| Slide-number label element (optional) | `.slide-num` | human-friendly panel labels |
| Navigation hook | `window.deckGoto(index)` (0-based) | panel "Go" jumps to the right slide |
| Arrow-keys-only navigation, **no** click-to-advance / spacebar | — | text selection + typing in the overlay must not move slides |

If a deck violates the last row (has click-to-advance), the overlay's click
guard only suppresses the click that ends a text-selection drag, so it degrades
gracefully — but the correct fix is to make the deck arrow-keys-only per
`deck-create`'s *Navigation & Event Standards*.

## Using the overlay (tell the user)

1. Open the deck in Chrome and click **✎ Review** (bottom-left).
2. **Select text** on a slide → a popover lets you add an optional note →
   **Add**. The highlight appears and **autosaves to `localStorage`**
   immediately.
3. Click **Connect folder** once and pick the deck's folder. From then on
   **Save** writes a real `‹deck›.annotations.json` next to the deck, and the
   tool reads the deck's own source to fill in
   **source line / column / context** for each highlight. (If the browser blocks
   folder access on `file://`, **Save** downloads the JSON instead — move it
   next to the deck.)
4. The connected folder is **remembered across reloads** (the directory handle
   is stored in IndexedDB, keyed per deck). After a reload the tool reconnects
   silently if the browser still grants access; otherwise the button reads
   **Reconnect folder** and a single click re-grants permission without
   re-picking the folder. (Browsers require a user gesture to re-grant, so the
   one click can't be avoided; clearing site data forgets the folder.)
5. Navigation while reviewing is the deck's normal **← / →** (the overlay's own
   keystrokes never leak to the deck).

## Acting on the feedback (the review loop)

When the user says "work the annotations":

1. Read `‹deck›.annotations.json` next to the deck.
2. For each `status: "open"` annotation, locate the text in the deck source:
   - Prefer `source.line` / `source.column` when present.
   - Otherwise search the source for `quote` (disambiguate with `prefix` /
     `suffix`, scoped to `slideId`). The quote is the underlying DOM text, so it
     matches the source even across inline tags / entities.
3. Make the edit, honoring the user's `note`.
4. Optionally set the annotation's `status` to `"done"` in the JSON so the panel
   shows it resolved.
5. Re-render / re-screenshot to verify, then report what changed per annotation.

### Sidecar JSON schema

```jsonc
{
  "version": 1, "tool": "slide-annotator",
  "target": "‹deck›.html", "updatedAt": "‹iso›",
  "annotations": [{
    "id", "createdAt", "status": "open" | "done", "note",
    "slideId", "slideIndex", "slideLabel", "slideTitle",
    "quote",                       // exact highlighted text (the anchor)
    "prefix", "suffix",            // ~60 rendered chars either side
    "renderedStart", "renderedEnd",// char offsets within the slide's text
    "domPath",                     // CSS-ish path to the containing element
    "source": {                    // best-effort; null until folder connected
      "file", "line", "column",
      "match": "exact" | "normalized" | "none",
      "contextBefore": [".."], "contextLine": "..", "contextAfter": [".."]
    }
  }]
}
```

## Removing the overlay (for final delivery)

To hand off a clean presentation, delete the injected
`<script src="slide-annotator.js" …>` line and the `slide-annotator.js` file.
Leaving the `window.deckGoto = go;` line in the deck is harmless.

## Constraints

- Keep `slide-annotator.js` **dependency-free and host-agnostic** — it must work
  on any static HTML page, not just `deck-create` output.
- Edit the tool **here** (`assets/slide-annotator.js`) as the source of truth,
  then re-install onto decks. Don't fork per-deck copies with divergent
  behavior.
- Never auto-send or upload annotations anywhere — the sidecar JSON stays local.
