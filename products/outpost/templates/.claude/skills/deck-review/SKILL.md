---
name: deck-review
description: Add a lightweight text-highlight review overlay to an HTML deck. Lets you highlight text on slides and capture feedback as a sidecar JSON. The JSON carries the source line, column, and context, so an agent can act on it in small iterations. Use when the user asks to add review/annotation/highlight/comment capability to a deck, make a deck "reviewable", or wants to mark up slides for revision. Pairs with the deck-create skill.
compatibility: Standalone HTML deck opened in a Chromium-based browser (Chrome/Edge). No build step, no server, no dependencies.
---

# Add a Review Overlay to a Deck

Install the self-contained `slide-annotator.js` overlay onto an HTML deck. The
user can then **highlight text on a slide and save the feedback as a sidecar
JSON**. Each annotation carries a robust anchor (exact text + the context around
it + slide). After you connect the folder, the annotation also carries the
resolved **source line, column and context lines**. An agent can then locate and
edit the exact text in small iterations.

This is the companion to **`deck-create`**. Decks from `deck-create` already
follow the navigation and structure standards this overlay needs. You drop the
overlay onto them with one script tag.

## Trigger

Run when the user asks to add review / annotation / highlight / comment / markup
capability to a deck. Run it also when the user says "make this deck
reviewable" or asks to set up a feedback loop on slides.

## Inputs

- Path to the target deck `.html` file (ask, or default to the most recently
  edited `*.html` in `Drafts/`).
- The bundled tool at `assets/slide-annotator.js`. This skill's own copy is the
  source of truth. Edit it here, then re-install it to update decks.

## Outputs

- `slide-annotator.js` copied next to the deck.
- One `<script>` tag injected into the deck before `</body>`.
- At review time, a sidecar `‹deck›.annotations.json` written next to the deck.

---

## Install steps

1. **Resolve the deck path** (absolute). Confirm it is an HTML deck. Confirm it
   is not a PDF.

2. **Check compatibility** (see *Compatibility contract* below). The two things
   that matter:
   - **Slide selector** — each slide is one element with a stable class
     (default `.slide`). If the deck uses a different class, note it for step 4.
   - **Navigation hook** — the deck exposes `window.deckGoto(index)` (0-based).
     If it has a slideshow function (e.g. `go(n)`) but no hook, add one line
     right after it: `window.deckGoto = go;`. Without it the overlay still
     works. The panel's *Go* button falls back to `scrollIntoView`. But the
     overlay can't jump to a hidden slide precisely.
   - A slide-number label element (default `.slide-num`) is optional. It gives
     nicer labels in the panel. It is purely cosmetic.

3. **Install the tool**: copy this skill's `assets/slide-annotator.js` into the
   **same directory as the deck**. Resolve `~` to `$HOME`. Pass the Write/copy a
   full path.

4. **Inject the script tag** immediately before `</body>`. The step is
   idempotent. Skip it if a `slide-annotator` script tag is already present:

   ```html
   <!-- Review overlay: highlight text on a slide → sidecar JSON. Self-contained, optional. -->
   <script src="slide-annotator.js" defer
           data-slide-selector=".slide"
           data-label-selector=".slide-num"></script>
   ```

   Set `data-slide-selector` / `data-label-selector` to match the deck if it
   differs from the defaults. If there are no slide elements at all, the tool
   treats the whole `<body>` as one container.

5. **Tell the user how to use it** (see *Use the overlay*). Do **not** add any
   other dependency or framework. The tool is plain JS and must stay that way.

## Compatibility contract (must match `deck-create`)

The overlay relies only on these conventions, which `deck-create` decks already
follow:

| Convention | Default | Why the overlay needs it |
|---|---|---|
| One element per slide with a stable class | `.slide` | locate which slide a highlight is on, and index the slides |
| Slide-number label element (optional) | `.slide-num` | human-friendly panel labels |
| Navigation hook | `window.deckGoto(index)` (0-based) | panel "Go" jumps to the right slide |
| Arrow-keys-only navigation, **no** click-to-advance / spacebar | — | text selection and typed input in the overlay must not move slides |

A deck can violate the last row and have click-to-advance. The overlay's click
guard then suppresses only the click that ends a text-selection drag, so it
degrades gracefully. The correct fix is to make the deck arrow-keys-only, per
`deck-create`'s *Navigation & Event Standards*.

## Use the overlay (tell the user)

1. Open the deck in Chrome. Click **✎ Review** (bottom-left).
2. **Select text** on a slide. A popover lets you add an optional note. Click
   **Add**. The highlight appears and **autosaves to `localStorage`**
   immediately.
3. Click **Connect folder** once and pick the deck's folder. From then on
   **Save** writes a real `‹deck›.annotations.json` next to the deck. The tool
   also reads the deck's own source to fill in
   **source line / column / context** for each highlight. If the browser blocks
   folder access on `file://`, **Save** downloads the JSON instead. Move it next
   to the deck.
4. The tool **remembers the connected folder across reloads**. It stores the
   directory handle in IndexedDB, keyed per deck. After a reload the tool
   reconnects silently if the browser still grants access. If not, the button
   reads **Reconnect folder**, and a single click re-grants permission without a
   new folder pick. Browsers require a user gesture to re-grant, so you can't
   avoid the one click. If you clear site data, the tool forgets the folder.
5. During a review you navigate with the deck's normal **← / →**. The overlay's
   own keystrokes never leak to the deck.

## Act on the feedback (the review loop)

When the user says "work the annotations":

1. Read `‹deck›.annotations.json` next to the deck.
2. For each `status: "open"` annotation, locate the text in the deck source:
   - Prefer `source.line` / `source.column` when present.
   - Otherwise search the source for `quote` (disambiguate with `prefix` /
     `suffix`, scoped to `slideId`). The quote is the raw DOM text, so it
     matches the source even across inline tags / entities.
3. Make the edit. Honor the user's `note`.
4. Optionally set the annotation's `status` to `"done"` in the JSON so the panel
   shows it resolved.
5. Re-render or re-screenshot to verify. Then report what changed for each
   annotation.

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

## Remove the overlay (for final delivery)

To hand off a clean presentation, delete the injected
`<script src="slide-annotator.js" …>` line and the `slide-annotator.js` file.
The `window.deckGoto = go;` line can stay in the deck. It is harmless.

## Constraints

- Keep `slide-annotator.js` **dependency-free and host-agnostic**. It must work
  on any static HTML page. `deck-create` output is not the only target.
- Edit the tool **here** (`assets/slide-annotator.js`) as the source of truth,
  then re-install onto decks. Don't fork per-deck copies with divergent
  behavior.
- Never auto-send or upload annotations anywhere. The sidecar JSON stays local.
