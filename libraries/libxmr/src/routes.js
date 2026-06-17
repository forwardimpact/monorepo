// kata-implement route-decision registry — single source of truth for the
// closed set of routes a kata-implement activation can take, the metrics
// that carry route context, and the parse/format helpers that read and
// write the route sub-grammar inside a metrics-CSV `note` field. The
// recorder (commands/record.js), the validator (csv.js validateRow), and
// the analyze partition reader (analyze.js) all import from here, so a
// removed or renamed route is a build/test error at every consumer. The
// published kata-implement reference (references/route-decision.md) is
// guarded against drift from ROUTES by .coaligned/invariants.

/** The closed set of kata-implement routes, keyed by bare id. */
export const ROUTES = {
  1: "design self-pick",
  2: "plan-draft",
  3: "plan-approved-no-impl",
  4: "fix fallback",
};

/** Sentinel route value: the activation fired no implementation route. */
export const ROUTE_NONE = "none";

/** Metrics whose rows carry route-decision context. */
export const ROUTE_BEARING_METRICS = ["implementations_shipped"];

// The convention applies to rows the shipped recording surface writes,
// which are strictly after every route-bearing row that existed when the
// convention shipped. The binding case is the latest pre-convention
// `implementations_shipped` rows dated 2026-06-17 that carry no route
// grammar; pinning a date strictly greater than that keeps the whole
// pre-convention file valid and makes the forward-only gate impossible to
// silently disable. A test asserts this stays a valid ISO date >
// "2026-06-17".
export const CONVENTION_START = "2026-06-18";

// route_taken is required and parsed independently of routes_eligible so
// the legacy `route_taken=none (parenthetical)` form — which carries no
// eligible clause — parses to {none, []} rather than failing to match.
const ROUTE_RE = /route_taken=(\d+|none)/;
const ELIGIBLE_RE = /routes_eligible=\[([0-9,\s]*)\]/;

/**
 * Parse route-decision context out of a CSV `note` field.
 *
 * @param {string} note - The (already unquoted) note text.
 * @returns {{ routeTaken: string, routesEligible: string[] }} Empty fields
 *   when no `route_taken=` token is present, so pre-convention rows parse
 *   clean.
 */
export function parseRouteContext(note) {
  const text = note ?? "";
  const routeMatch = ROUTE_RE.exec(text);
  if (!routeMatch) return { routeTaken: "", routesEligible: [] };
  const eligibleMatch = ELIGIBLE_RE.exec(text);
  const routesEligible = eligibleMatch
    ? eligibleMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return { routeTaken: routeMatch[1], routesEligible };
}

/**
 * Format the route-decision prefix written at the head of a `note`.
 *
 * @param {{ routeTaken: string|number, routesEligible?: Array<string|number> }} ctx
 * @returns {string}
 */
export function formatRouteContext({ routeTaken, routesEligible = [] }) {
  return `route_taken=${routeTaken}; routes_eligible=[${routesEligible.join(",")}]`;
}

/**
 * Whether an id is a member of the closed route set or the `none` sentinel.
 * Any other non-numeric value is rejected because `Number(x)` is `NaN` and
 * `ROUTES` has no `NaN` key.
 *
 * @param {string|number} id
 * @returns {boolean}
 */
export function isKnownRoute(id) {
  return id === ROUTE_NONE || Object.hasOwn(ROUTES, Number(id));
}
