# plan(1120): pathway first-visit dismissible banner

## Approach

Add two pure modules under `products/pathway/src/` —
`lib/first-visit-dismissal.js` for the `localStorage`-backed dismissal flag and
`components/first-visit-banner.js` for the verbatim-copy DOM factory — then call
them from `renderLanding` so the banner inserts as the first child of
`.landing-page` only when `isDismissed()` returns `false`. Styling lives in a
new component partial wired into the existing `app.css` bundle alongside
`command-prompt.css`.

## Steps

### 1. Add dismissal storage adapter

**Files created:**

- `products/pathway/src/lib/first-visit-dismissal.js`

Exports two functions over a single `localStorage` key, guarded against
unavailable / throwing storage (private mode, disabled storage, quota errors).
Treat any failure as "not dismissed" so the orientation re-shows; treat
`markDismissed` failure as a silent no-op so the click handler never throws.

```js
const STORAGE_KEY = "pathway:first-visit-banner:dismissed";

function getStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function isDismissed() {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markDismissed() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, "1");
  } catch {
    /* quota / disabled storage — accept re-show on next visit */
  }
}
```

**Verify:** module imports cleanly under Node
(`bun -e "await import('./products/pathway/src/lib/first-visit-dismissal.js')"`)
and unit tests added in Step 6 pass.

### 2. Add banner component factory

**Files created:**

- `products/pathway/src/components/first-visit-banner.js`

Top of file:

```js
import { section, h2, p, ul, li, div, button } from "../lib/render.js";
```

Exports a pure factory taking `{ onDismiss }` and returning the banner element
below. Banner copy is verbatim from spec § Banner copy. The dismiss button uses
the existing `.btn.btn-primary` classes from libui (matches landing CTAs;
single action, single emphasis).

Element tree (matches design § Accessibility model):

```text
<section class="first-visit-banner"
         role="region"
         aria-labelledby="first-visit-heading"
         aria-live="polite">
  <h2 id="first-visit-heading">Before you begin</h2>
  <p>Pathway shows what the organization expects at each engineering level — so that 'meets expectations' has a definition everyone can point to.</p>
  <p><strong>What it is:</strong></p>
  <ul>
    <li>A reference for understanding your current role and what changes at the next level</li>
    <li>A starting point for career conversations, not a replacement for them</li>
  </ul>
  <p><strong>What it is not:</strong></p>
  <ul>
    <li>A performance evaluation tool — nothing you view is tracked or reported</li>
    <li>A rigid checklist — roles describe expected proficiency, not pass/fail</li>
    <li>The sole basis for promotion decisions — context and manager judgment remain central</li>
  </ul>
  <p><strong>What to expect:</strong></p>
  <p>You will notice gaps. Everyone does, at every level. The purpose is to make them visible and discussable — not to grade you. If something doesn't match the role as you experience it, say so. The standard improves when people challenge it.</p>
  <p>Questions? Talk to your manager or your Developer Experience Lead.</p>
  <div class="first-visit-banner__actions">
    <button type="button" class="btn btn-primary first-visit-banner__dismiss">Got it</button>
  </div>
</section>
```

Public surface:

```js
export function createFirstVisitBanner({ onDismiss }) {
  // builds the element above; attaches click handler on the Got it button
  // that calls onDismiss(); returns the section element
}
```

The native `<button>` covers spec behaviour 6 (Tab reach, Enter/Space
activation) without bespoke key handling.

**Verify:** unit tests added in Step 6 pass; eye-check that copy matches spec §
Banner copy line-for-line.

### 3. Add banner stylesheet

**Files created:**

- `products/pathway/src/css/components/first-visit-banner.css`

```css
@layer components {
  .first-visit-banner {
    margin: 0 0 var(--space-xl);
    padding: var(--space-lg) var(--space-xl);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
  }

  .first-visit-banner > h2 {
    margin-top: 0;
  }

  .first-visit-banner ul {
    margin: var(--space-xs) 0 var(--space-md);
    padding-left: var(--space-lg);
  }

  .first-visit-banner__actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-lg);
  }

  @media (prefers-reduced-motion: no-preference) {
    .first-visit-banner {
      animation: first-visit-banner-fade-in 200ms ease-out;
    }
    @keyframes first-visit-banner-fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  }
}
```

No `position: fixed`, no `z-index`. Banner sits in flow per design § Components.

**Verify:** `grep first-visit-banner products/pathway/src/css/bundles/app.css`
(after Step 4) shows the import; CSS parse errors surface during Step 7's manual
browser run.

### 4. Wire stylesheet into app bundle

**Files modified:**

- `products/pathway/src/css/bundles/app.css`

Add one import line in the Pathway-specific components block, mirroring the
`command-prompt.css` pattern:

```diff
   /* Components (Pathway-specific) */
   @import "../components/command-prompt.css" layer(components);
+  @import "../components/first-visit-banner.css" layer(components);
   @import "../components/skill-file-viewer.css" layer(components);
   @import "../components/file-card.css" layer(components);
```

**Verify:** `grep first-visit-banner products/pathway/src/css/bundles/app.css`
returns the new line.

### 5. Integrate banner into `renderLanding`

**Files modified:**

- `products/pathway/src/pages/landing.js`

Add two imports and one conditional block as the first child of `.landing-page`:

```diff
 import { render, div, h1, h2, p, a, span } from "../lib/render.js";
 import { getState } from "../lib/state.js";
 import { createStatCard } from "../components/card.js";
+import { createFirstVisitBanner } from "../components/first-visit-banner.js";
+import {
+  isDismissed,
+  markDismissed,
+} from "../lib/first-visit-dismissal.js";
```

In `renderLanding`, before constructing the existing `page` tree, build the
banner element (or `null`) and pass it as the first child of `.landing-page`.
The render helpers already accept `null` children (precedent: `landing.js:42-46`
passes `null` from the `siteUrl` ternary).

```js
let banner = null;
if (!isDismissed()) {
  banner = createFirstVisitBanner({
    onDismiss: () => {
      markDismissed();
      banner.remove();
    },
  });
}

const page = div(
  { className: "landing-page" },
  banner,
  // ...existing hero, stats grid, quick links, build-your-team sections
);
```

**Verify:** unit tests pass; full end-to-end verification happens in Step 7.

### 6. Add tests

**Files created:**

- `products/pathway/test/first-visit-dismissal.test.js`
- `products/pathway/test/first-visit-banner.test.js`

**Files modified:**

- `products/pathway/package.json` — `devDependencies` block does not exist;
  create it with `"happy-dom": "^20.9.0"` (precedent:
  `libraries/libui/package.json`). After editing, run `bun install` from the
  repo root to refresh the workspace lockfile and commit any lockfile diff in
  the same PR.

Test surface — the design accepts that copy regressions are silent, so do not
assert verbatim copy strings; assert structural and behavioural claims the
spec makes:

| Test                                                                            | Asserts                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `first-visit-dismissal` — fresh storage                                         | `isDismissed()` returns `false`.                                                                              |
| `first-visit-dismissal` — after `markDismissed`                                 | `isDismissed()` returns `true`; the storage key is `pathway:first-visit-banner:dismissed` with value `"1"`.   |
| `first-visit-dismissal` — `getItem` throws                                      | `isDismissed()` returns `false`, does not throw.                                                              |
| `first-visit-dismissal` — `setItem` throws                                      | `markDismissed()` returns without throwing; `isDismissed()` still returns `false` on next call.               |
| `first-visit-dismissal` — `window` undefined                                    | `isDismissed()` returns `false`; `markDismissed()` is a no-op.                                                |
| `createFirstVisitBanner` — structure                                            | Returned element is a `<section>` with `role="region"`, `aria-labelledby="first-visit-heading"`, `aria-live="polite"`; contains `<h2 id="first-visit-heading">`. |
| `createFirstVisitBanner` — dismiss control                                      | Exactly one `<button>` inside the banner; text is `Got it`; no `<input type="checkbox">` anywhere.            |
| `createFirstVisitBanner` — click invokes `onDismiss`                            | Click on the button calls `onDismiss` exactly once.                                                           |
| `createFirstVisitBanner` — keyboard reach                                       | The dismiss element is an `HTMLButtonElement` with no `tabindex` attribute (HTML spec → Tab-reachable; native button → Enter/Space activation). |

Both test files use happy-dom following the libui pattern in
`libraries/libui/test/command-bar.test.js` — install `Window`, point
`globalThis.window` / `globalThis.document` at it in `beforeEach`, restore in
`afterEach`. For the storage-adapter "throws" rows, stub
`window.localStorage.getItem` / `setItem` to throw. For the "`window`
undefined" row, set `globalThis.window = undefined` for that single test then
restore in `afterEach`.

**Verify:** `cd products/pathway && bun test` passes; new tests run.

### 7. Manual verification

**Files modified:** none.

Run through the spec § Success criteria checklist with a real browser:

1. `bun ./bin/fit-pathway.js serve <installation>` then open
   `http://localhost:<port>/` in a fresh browser profile (incognito works).
2. Confirm banner visible on `/`, copy matches spec § Banner copy byte-for-byte
   (this is the only line of defence against copy drift per design § Risks).
3. Activate `Got it` by click and by keyboard; confirm banner disappears.
4. Reload `/`; confirm banner does not return.
5. Navigate to `#/discipline`, `#/track/<id>`, `#/self-assessment`, `#/`; banner
   never reappears on those routes, even before dismissal in a fresh profile.
6. Clear site data; banner returns on next visit to `/`.
7. With a screen reader (VoiceOver on macOS works), open `/` fresh; confirm
   `Before you begin` and body copy are announced.
8. Inspect rendered banner: no `<input type="checkbox">`, no "I acknowledge" /
   "I understand" copy, single button labelled exactly `Got it`.

If any check fails, fix the implementation rather than relaxing the test.

## Libraries used

Libraries used: none new at runtime; `happy-dom` (^20.9.0) added as a
`devDependencies` entry on `@forwardimpact/pathway` for the banner test.

## Risks

- **`aria-live="polite"` re-announces on hash-route re-renders.** The pages
  router calls `renderLanding` on every navigation back to `/`. Before
  dismissal, navigating away and back re-inserts the banner element, which
  assistive tech may re-announce. Acceptable per spec behaviour 1, but worth
  watching in Step 7's screen-reader pass.
- **happy-dom version drift.** Pinning `^20.9.0` matches libui; if libui ever
  bumps, sync in the same commit to keep the workspace coherent.

## Execution

One PR, one engineering agent (`staff-engineer` or `kata-implement` against
this plan), sequential steps 1 → 7. No part is large enough to warrant
decomposition, and steps 5 and 6 each depend on 1 and 2 — parallelism would
save no wall-clock time.

— Staff Engineer 🛠️
