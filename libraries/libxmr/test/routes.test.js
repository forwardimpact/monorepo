import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CONVENTION_START,
  formatRouteContext,
  isKnownRoute,
  parseRouteContext,
  ROUTES,
} from "../src/routes.js";

describe("parseRouteContext", () => {
  test("parses a full grammar prefix", () => {
    const { routeTaken, routesEligible } = parseRouteContext(
      "route_taken=3; routes_eligible=[3,4]; opened PR #1715",
    );
    assert.equal(routeTaken, "3");
    assert.deepEqual(routesEligible, ["3", "4"]);
  });

  test("absent grammar yields empty fields", () => {
    const { routeTaken, routesEligible } = parseRouteContext(
      "merged kata-agent-team PRs on 2026-04-14",
    );
    assert.equal(routeTaken, "");
    assert.deepEqual(routesEligible, []);
  });

  test("legacy `route_taken=none (...)` form without eligible clause", () => {
    const { routeTaken, routesEligible } = parseRouteContext(
      "route_taken=none (facilitated meeting leg, no shift dispatch)",
    );
    assert.equal(routeTaken, "none");
    assert.deepEqual(routesEligible, []);
  });

  test("empty eligible list", () => {
    const { routeTaken, routesEligible } = parseRouteContext(
      "route_taken=4; routes_eligible=[]; route-4 output",
    );
    assert.equal(routeTaken, "4");
    assert.deepEqual(routesEligible, []);
  });

  test("null note is safe", () => {
    assert.deepEqual(parseRouteContext(undefined), {
      routeTaken: "",
      routesEligible: [],
    });
  });
});

describe("formatRouteContext", () => {
  test("round-trips through parseRouteContext", () => {
    const prefix = formatRouteContext({
      routeTaken: 3,
      routesEligible: [3, 4],
    });
    assert.equal(prefix, "route_taken=3; routes_eligible=[3,4]");
    const parsed = parseRouteContext(`${prefix}; tail`);
    assert.equal(parsed.routeTaken, "3");
    assert.deepEqual(parsed.routesEligible, ["3", "4"]);
  });
});

describe("isKnownRoute", () => {
  test("accepts none and each declared id", () => {
    assert.ok(isKnownRoute("none"));
    for (const id of Object.keys(ROUTES)) assert.ok(isKnownRoute(id));
  });

  test("rejects an out-of-set id and a non-numeric string", () => {
    assert.ok(!isKnownRoute("5"));
    assert.ok(!isKnownRoute("x"));
  });
});

describe("CONVENTION_START", () => {
  test("is a valid ISO date strictly after the latest pre-convention row", () => {
    assert.match(CONVENTION_START, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(CONVENTION_START > "2026-06-19");
  });
});
