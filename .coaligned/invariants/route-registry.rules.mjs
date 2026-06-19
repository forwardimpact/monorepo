// Keep the kata-implement route taxonomy in
// .claude/skills/kata-implement/references/route-decision.md aligned with
// the single source of truth, ROUTES in libraries/libxmr/src/routes.js. The
// recorder, validator, and analyze reader consume ROUTES by direct import,
// so their alignment is structural (a removed id is a build/test error at
// the import site). The published doc is prose and cannot import, so this
// rule parses its id → route table and fails when an id or label drifts
// from ROUTES in either direction.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROUTES_PATH = "libraries/libxmr/src/routes.js";
const DOC_PATH = ".claude/skills/kata-implement/references/route-decision.md";

// Markdown table rows shaped `| <id> | <route> |`, restricted to numeric
// ids so the header and separator rows are skipped.
const TABLE_ROW = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*$/;

function parseDocRoutes(text) {
  const routes = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = TABLE_ROW.exec(lines[i]);
    if (m) routes[m[1]] = { label: m[2], line: i + 1 };
  }
  return routes;
}

export default {
  name: "route-registry",

  async build({ root, readText }) {
    const { ROUTES } = await import(pathToFileURL(resolve(root, ROUTES_PATH)));
    const docRoutes = parseDocRoutes(readText(DOC_PATH) ?? "");
    const docPath = resolve(root, DOC_PATH);

    const problems = [];
    // Every source id must appear in the doc with a matching label.
    for (const [id, label] of Object.entries(ROUTES)) {
      const doc = docRoutes[id];
      if (!doc) {
        problems.push({
          path: docPath,
          line: 1,
          message: `route ${id} ("${label}") in ${ROUTES_PATH} is missing from the route table`,
        });
      } else if (doc.label !== label) {
        problems.push({
          path: docPath,
          line: doc.line,
          message: `route ${id} label "${doc.label}" does not match "${label}" in ${ROUTES_PATH}`,
        });
      }
    }
    // Every doc id must exist in the source.
    for (const [id, doc] of Object.entries(docRoutes)) {
      if (!Object.hasOwn(ROUTES, id)) {
        problems.push({
          path: docPath,
          line: doc.line,
          message: `route ${id} in the route table is not declared in ${ROUTES_PATH}`,
        });
      }
    }

    return { subjects: { "route-drift": problems } };
  },

  rules: [
    {
      id: "route-registry.drift",
      scope: "route-drift",
      severity: "fail",
      check: () => ({}),
      message: (s) => s.message,
      hint: `align the route table in ${DOC_PATH} with ROUTES in ${ROUTES_PATH}`,
    },
  ],
};
