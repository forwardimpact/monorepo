/**
 * First-visit dismissible banner for the Pathway landing page.
 *
 * Pure DOM factory. It does not touch storage, so the component is trivially
 * testable. The caller (`renderLanding`) owns the dismissal-state side
 * effects and passes them in through `onDismiss`.
 *
 * Copy is verbatim from spec(1120) § Banner copy. Treat it as protected text.
 * The banner is the only line of defence against framing drift. No automated
 * copy test exists. See design § Risks.
 */

import { section, h2, p, ul, li, div, button } from "../lib/render.js";

/**
 * Build the first-visit banner element.
 *
 * @param {Object} options
 * @param {() => void} options.onDismiss - Runs when the user activates the
 *   `Got it` button (click or keyboard).
 * @returns {HTMLElement} the `<section>` to insert into the page.
 */
export function createFirstVisitBanner({ onDismiss }) {
  const dismissButton = button(
    {
      type: "button",
      className: "btn btn-primary first-visit-banner__dismiss",
    },
    "Got it",
  );
  dismissButton.addEventListener("click", () => onDismiss());

  return div(
    { className: "first-visit-backdrop", role: "dialog", "aria-modal": "true" },
    section(
      {
        className: "first-visit-banner",
        role: "region",
        "aria-labelledby": "first-visit-heading",
        "aria-live": "polite",
      },
      h2({ id: "first-visit-heading" }, "Before you begin"),
      p(
        {},
        "Pathway shows what the organization expects at each engineering level " +
          "— so that 'meets expectations' has a definition everyone can point to.",
      ),
      p({}, strong("What it is:")),
      ul(
        {},
        li(
          {},
          "A reference for understanding your current role and what changes at " +
            "the next level",
        ),
        li(
          {},
          "A starting point for career conversations, not a replacement for them",
        ),
      ),
      p({}, strong("What it is not:")),
      ul(
        {},
        li(
          {},
          "A performance evaluation tool — nothing you view is tracked or reported",
        ),
        li(
          {},
          "A rigid checklist — roles describe expected proficiency, not pass/fail",
        ),
        li(
          {},
          "The sole basis for promotion decisions — context and manager judgment " +
            "remain central",
        ),
      ),
      p({}, strong("What to expect:")),
      p(
        {},
        "You will notice gaps. Everyone does, at every level. The purpose is to " +
          "make them visible and discussable — not to grade you. If something " +
          "doesn't match the role as you experience it, say so. The standard " +
          "improves when people challenge it.",
      ),
      p(
        {},
        "Questions? Talk to your manager or your Developer Experience Lead.",
      ),
      div({ className: "first-visit-banner__actions" }, dismissButton),
    ),
  );
}

/**
 * Build a `<strong>` element with document.createElement. libui's render
 * module re-exports no `strong` helper. Every paragraph label here must be
 * bold.
 * @param {string} text
 * @returns {HTMLElement}
 */
function strong(text) {
  const el = document.createElement("strong");
  el.textContent = text;
  return el;
}
