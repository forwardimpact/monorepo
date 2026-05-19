/**
 * DSL Parser — recursive-descent parser that produces a TerrainAST.
 *
 * @typedef {object} TerrainAST
 * @property {string} name
 * @property {string} domain
 * @property {string} industry
 * @property {number} seed
 * @property {object[]} orgs
 * @property {object[]} departments
 * @property {object[]} teams
 * @property {object} people
 * @property {object[]} projects
 * @property {object[]} scenarios
 * @property {object} snapshots
 * @property {object} standard
 * @property {object[]} content
 * @property {object[]} datasets
 * @property {object[]} outputs
 */

import { createBlockParsers } from "./parser-blocks.js";
import { createClinicalParsers } from "./parser-clinical.js";
import { createStandardParsers } from "./parser-standard.js";

/**
 * Parse a token stream into a TerrainAST.
 * @param {import('./tokenizer.js').Token[]} tokens
 * @returns {TerrainAST}
 */
export function parse(tokens) {
  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  function advance() {
    return tokens[pos++];
  }

  function expect(type, value) {
    const t = advance();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(
        `Expected ${type}${value ? ` '${value}'` : ""} but got ${t.type} '${t.value}' at line ${t.line}`,
      );
    }
    return t;
  }

  function expectKeyword(kw) {
    return expect("KEYWORD", kw);
  }

  function parseStringOrIdent() {
    const t = peek();
    if (t.type === "STRING") return advance().value;
    if (t.type === "IDENT") return advance().value;
    if (t.type === "DOTTED_IDENT") return advance().value;
    if (t.type === "KEYWORD") return advance().value;
    throw new Error(
      `Expected string or identifier at line ${t.line}, got ${t.type} '${t.value}'`,
    );
  }

  function parseStringValue() {
    return expect("STRING").value;
  }

  function parseNumberValue() {
    const t = advance();
    if (t.type === "NUMBER") return Number(t.value);
    if (t.type === "PERCENT") return Number(t.value);
    throw new Error(`Expected number at line ${t.line}`);
  }

  function parseDateValue() {
    const t = advance();
    if (t.type === "DATE") return t.value;
    if (t.type === "STRING") return t.value;
    throw new Error(`Expected date at line ${t.line}`);
  }

  /** Resolve a single array element from the current token. */
  function resolveArrayElement() {
    const t = peek();
    if (
      t.type === "STRING" ||
      t.type === "IDENT" ||
      t.type === "KEYWORD" ||
      t.type === "DOTTED_IDENT"
    ) {
      return advance().value;
    }
    if (t.type === "NUMBER") return Number(advance().value);
    throw new Error(`Unexpected ${t.type} in array at line ${t.line}`);
  }

  function parseArray() {
    expect("LBRACKET");
    const items = [];
    while (peek().type !== "RBRACKET") {
      items.push(resolveArrayElement());
      if (peek().type === "COMMA") advance();
    }
    expect("RBRACKET");
    return items;
  }

  const helpers = {
    peek,
    advance,
    expect,
    parseStringOrIdent,
    parseStringValue,
    parseNumberValue,
    parseDateValue,
    parseArray,
  };

  const blocks = createBlockParsers(helpers);
  const clinical = createClinicalParsers(helpers);
  const std = createStandardParsers(helpers);

  // Main: parse terrain
  expectKeyword("terrain");
  const name = parseStringOrIdent();
  expect("LBRACE");

  const ast = {
    name,
    domain: null,
    industry: null,
    seed: 42,
    orgs: [],
    departments: [],
    teams: [],
    people: null,
    projects: [],
    scenarios: [],
    snapshots: null,
    standard: null,
    content: [],
    clinical: null,
    datasets: [],
    outputs: [],
  };

  const TOP_LEVEL = {
    domain: () => {
      ast.domain = parseStringValue();
    },
    industry: () => {
      ast.industry = parseStringValue();
    },
    seed: () => {
      ast.seed = parseNumberValue();
    },
    org: () => ast.orgs.push(blocks.parseOrg()),
    department: () => {
      const { dept, teams } = blocks.parseDepartment();
      ast.departments.push(dept);
      ast.teams.push(...teams);
    },
    people: () => {
      ast.people = blocks.parsePeople();
    },
    project: () => ast.projects.push(blocks.parseProject()),
    scenario: () => ast.scenarios.push(blocks.parseScenario()),
    snapshots: () => {
      ast.snapshots = blocks.parseSnapshots();
    },
    standard: () => {
      ast.standard = std.parseStandard();
    },
    content: () => ast.content.push(blocks.parseContent()),
    clinical: () => {
      ast.clinical = clinical.parseClinical();
    },
    dataset: () => {
      const id = parseStringOrIdent();
      ast.datasets.push(std.parseDataset(id));
    },
    output: () => {
      const datasetId = parseStringOrIdent();
      ast.outputs.push(std.parseOutput(datasetId));
    },
  };

  while (peek().type !== "RBRACE" && peek().type !== "EOF") {
    const kw = advance();
    const handler = TOP_LEVEL[kw.value];
    if (handler) handler();
    else
      throw new Error(
        `Unexpected keyword '${kw.value}' at top level, line ${kw.line}`,
      );
  }

  if (peek().type === "RBRACE") advance();

  // Validate distribution keys against standard levels (when both exist)
  if (ast.people?.distribution && ast.standard?.levels?.length) {
    const levelIds = new Set(ast.standard.levels.map((l) => l.id));
    for (const key of Object.keys(ast.people.distribution)) {
      if (!levelIds.has(key)) {
        const have = ast.standard.levels.map((l) => l.id).join(", ");
        throw new Error(
          `distribution key "${key}" does not match any standard level (have: ${have})`,
        );
      }
    }
  }

  return ast;
}
