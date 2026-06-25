import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toMarkdown, toText } from "../src/formatters/health.js";

function makeDriver(overrides = {}) {
  return {
    id: "quality",
    name: "Quality",
    score: 42,
    vs_prev: null,
    vs_org: null,
    vs_50th: null,
    vs_75th: null,
    vs_90th: null,
    contributingSkills: [{ skillId: "task-completion", count: 3 }],
    comments: [],
    recommendations: [],
    ...overrides,
  };
}

const SIX_DRIVERS = [
  makeDriver({
    id: "quality",
    name: "Quality",
    score: 42,
    vs_prev: -5,
    vs_org: -10,
    vs_50th: -8,
    vs_75th: -25,
    vs_90th: -40,
    recommendations: [
      {
        skill: "planning",
        impact: "critical",
        candidates: [
          { email: "bob@example.com", name: "Bob", currentLevel: "Level II" },
        ],
      },
    ],
  }),
  makeDriver({
    id: "reliability",
    name: "Reliability",
    score: null,
    vs_prev: null,
    vs_org: null,
    vs_50th: null,
    vs_75th: null,
    vs_90th: null,
    recommendations: [
      {
        skill: "incident-response",
        impact: "high",
        candidates: [
          {
            email: "alice@example.com",
            name: "Alice",
            currentLevel: "Level I",
          },
        ],
      },
    ],
  }),
  makeDriver({
    id: "code-review",
    name: "Code Review",
    score: 60,
    vs_prev: 1,
    vs_org: 5,
    vs_50th: 10,
    vs_75th: 0,
    vs_90th: -15,
  }),
  makeDriver({
    id: "delivery",
    name: "Delivery",
    score: 75,
    vs_prev: null,
    vs_org: 20,
    vs_50th: 25,
    vs_75th: 0,
    vs_90th: -5,
    recommendations: [
      {
        skill: "planning",
        impact: "critical",
        candidates: [
          { email: "bob@example.com", name: "Bob", currentLevel: "Level II" },
        ],
      },
    ],
  }),
  makeDriver({
    id: "growth",
    name: "Growth",
    score: 50,
    vs_org: 0,
  }),
  makeDriver({
    id: "speed",
    name: "Speed",
    score: 33,
    vs_prev: -2,
    vs_org: -8,
  }),
];

const SIX_DRIVER_VIEW = { teamLabel: "Team", drivers: SIX_DRIVERS };

describe("health formatter — default mode", () => {
  it("fits within 50 lines for 6 drivers", () => {
    const out = toText(SIX_DRIVER_VIEW, { format: "text", warnings: [] });
    assert.ok(
      out.split("\n").length <= 50,
      `expected ≤ 50 lines, got ${out.split("\n").length}`,
    );
  });

  it("anchors the row dimension with a plural Drivers (N) header", () => {
    const out = toText(SIX_DRIVER_VIEW, { format: "text", warnings: [] });
    assert.match(out, /Drivers \(6\)/);
    const lines = out.split("\n");
    const headerIdx = lines.findIndex((l) => l.includes("Drivers (6)"));
    const colHeader = lines[headerIdx + 2];
    assert.equal(colHeader, "  #  Driver          Percentile  vs_org   More");
  });

  it("renders the driver row with pinned column widths", () => {
    const view = {
      teamLabel: "Team",
      drivers: [
        makeDriver({
          name: "Quality",
          score: 42,
          vs_prev: -5,
          vs_org: -10,
          vs_50th: -8,
          vs_75th: -25,
          vs_90th: -40,
        }),
      ],
    };
    const out = toText(view, { format: "text", warnings: [] });
    const lines = out.split("\n");
    const row = lines.find((l) => l.includes("Quality") && l.includes("42nd"));
    assert.equal(
      row,
      "  1  Quality         42nd        -10      +4 anchors via --verbose",
    );
  });

  it("counts hidden anchors only — vs_org is not counted in More", () => {
    const view = {
      teamLabel: "Team",
      drivers: [
        makeDriver({
          name: "Quality",
          score: 42,
          vs_prev: -2,
          vs_org: -4,
          vs_50th: null,
          vs_75th: null,
          vs_90th: null,
        }),
      ],
    };
    const out = toText(view, { format: "text", warnings: [] });
    assert.match(out, /\+1 anchors via --verbose/);
  });

  it("renders the More cell as '-' when every hidden anchor is null", () => {
    const view = {
      teamLabel: "Team",
      drivers: [
        makeDriver({
          name: "Quality",
          score: 42,
          vs_prev: null,
          vs_org: -4,
          vs_50th: null,
          vs_75th: null,
          vs_90th: null,
        }),
      ],
    };
    const out = toText(view, { format: "text", warnings: [] });
    const row = out
      .split("\n")
      .find((l) => l.includes("Quality") && l.includes("42nd"));
    assert.ok(row.endsWith("-"), `row did not end with '-': ${row}`);
  });

  it("emits each (candidate, skill) recommendation only once across drivers", () => {
    const out = toText(SIX_DRIVER_VIEW, { format: "text", warnings: [] });
    const occurrences = out.match(/could develop/g) ?? [];
    // Bob/planning spans Quality + Delivery (1), Alice/incident-response on
    // Reliability (1) — total 2 unique pairs.
    assert.equal(occurrences.length, 2);
  });

  it("names every driver a duplicated recommendation applies to", () => {
    const out = toText(SIX_DRIVER_VIEW, { format: "text", warnings: [] });
    assert.match(out, /for Quality, Delivery/);
  });

  it("suppresses the Recommendations trailer when there are no recs", () => {
    const view = {
      teamLabel: "Team",
      drivers: [
        makeDriver({ name: "Quality", score: 42, recommendations: [] }),
      ],
    };
    const out = toText(view, { format: "text", warnings: [] });
    assert.ok(!out.includes("Recommendations ("));
    assert.ok(!/\n\n$/.test(out));
  });

  it("renders the markdown header in design order", () => {
    const out = toMarkdown(SIX_DRIVER_VIEW, {
      format: "markdown",
      warnings: [],
    });
    assert.ok(out.includes("| # | Driver | Percentile | vs_org | More |"));
    assert.ok(out.includes("| --- | --- | --- | --- | --- |"));
  });

  it("does not truncate driver names that exceed the column width", () => {
    const view = {
      teamLabel: "Team",
      drivers: [makeDriver({ name: "Codebase Experience", score: 42 })],
    };
    const out = toText(view, { format: "text", warnings: [] });
    const row = out.split("\n").find((l) => l.includes("Codebase Experience"));
    assert.ok(row, "driver row not found");
    assert.ok(row.includes("42nd"));
  });
});

describe("health formatter — verbose mode", () => {
  it("lists every available anchor on the Anchors line", () => {
    const view = {
      teamLabel: "Team",
      drivers: [
        makeDriver({
          name: "Quality",
          score: 42,
          vs_prev: -5,
          vs_org: -10,
          vs_50th: -8,
          vs_75th: -25,
          vs_90th: -40,
        }),
      ],
    };
    const out = toText(view, {
      format: "text",
      warnings: [],
      verbose: true,
    });
    assert.match(
      out,
      /Anchors: vs_prev: -5, vs_org: -10, vs_50th: -8, vs_75th: -25, vs_90th: -40/,
    );
  });

  it("emits a (candidate, skill) recommendation only on the first driver", () => {
    const out = toText(SIX_DRIVER_VIEW, {
      format: "text",
      warnings: [],
      verbose: true,
    });
    const occurrences = out.match(/⮕ Recommendation/g) ?? [];
    assert.equal(occurrences.length, 2);
  });

  it("preserves contributing skills, evidence, and comments", () => {
    const view = {
      teamLabel: "Team",
      drivers: [
        makeDriver({
          name: "Quality",
          score: 42,
          vs_org: -10,
          comments: [{ text: "great team work" }],
        }),
      ],
    };
    const out = toText(view, {
      format: "text",
      warnings: [],
      verbose: true,
    });
    assert.match(out, /Contributing skills:/);
    assert.match(out, /Evidence:/);
    assert.match(out, /GetDX comments:/);
  });

  it("suppresses Contributing skills / Evidence when contributingSkills is empty", () => {
    const view = {
      teamLabel: "Team",
      drivers: [
        makeDriver({
          name: "Clear Direction",
          score: 42,
          vs_org: -10,
          contributingSkills: [],
        }),
      ],
    };
    const out = toText(view, {
      format: "text",
      warnings: [],
      verbose: true,
    });
    assert.ok(
      !out.includes("Contributing skills:"),
      "verbose output should not include Contributing skills: when empty",
    );
    assert.ok(
      !out.includes("Evidence:"),
      "verbose output should not include Evidence: when empty",
    );
  });
});

describe("health formatter — driverJoin states", () => {
  it("renders NO_DRIVERS copy and skips the column header", () => {
    const view = {
      teamLabel: "Team",
      drivers: [],
      driverJoin: { state: "NO_DRIVERS", yamlIds: 0, scoreIds: 0, matched: 0 },
    };
    const out = toText(view, { format: "text", warnings: [] });
    assert.match(out, /Drivers \(no drivers configured\)/);
    assert.match(out, /npx fit-map init/);
    assert.ok(
      !/^\s*#\s+Driver\s+Percentile/m.test(out),
      "should not render the default table column header",
    );
  });

  it("renders NO_MATCH copy with the configured/snapshot id counts", () => {
    const view = {
      teamLabel: "Team",
      drivers: [],
      driverJoin: { state: "NO_MATCH", yamlIds: 2, scoreIds: 3, matched: 0 },
    };
    const out = toText(view, { format: "text", warnings: [] });
    assert.match(out, /Drivers \(no matches\)/);
    assert.match(
      out,
      /Snapshot has 3 driver ids, your `data\/pathway\/drivers\.yaml` declares 2/,
    );
    assert.match(out, /GetDX taxonomy/);
  });

  it("renders NO_DRIVERS copy in markdown", () => {
    const view = {
      teamLabel: "Team",
      drivers: [],
      driverJoin: { state: "NO_DRIVERS", yamlIds: 0, scoreIds: 0, matched: 0 },
    };
    const out = toMarkdown(view, { format: "markdown", warnings: [] });
    assert.match(out, /## Drivers \(no drivers configured\)/);
    assert.match(out, /npx fit-map init/);
    assert.ok(
      !out.includes("| # | Driver |"),
      "should not render the default markdown table header",
    );
  });

  it("renders NO_MATCH copy in markdown", () => {
    const view = {
      teamLabel: "Team",
      drivers: [],
      driverJoin: { state: "NO_MATCH", yamlIds: 2, scoreIds: 3, matched: 0 },
    };
    const out = toMarkdown(view, { format: "markdown", warnings: [] });
    assert.match(out, /## Drivers \(no matches\)/);
    assert.match(
      out,
      /Snapshot has 3 driver ids, your `data\/pathway\/drivers\.yaml` declares 2/,
    );
    assert.match(out, /GetDX taxonomy/);
    assert.ok(
      !out.includes("| # | Driver |"),
      "should not render the default markdown table header",
    );
  });
});
