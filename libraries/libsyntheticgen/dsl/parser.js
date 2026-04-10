/**
 * DSL Parser — recursive-descent parser that produces a UniverseAST.
 *
 * @typedef {object} UniverseAST
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
 * @property {object} framework
 * @property {object[]} content
 * @property {object[]} datasets
 * @property {object[]} outputs
 */

import { createBlockParsers } from "./parser-blocks.js";
import { createFrameworkParsers } from "./parser-framework.js";

/**
 * Parse a token stream into a UniverseAST.
 * @param {import('./tokenizer.js').Token[]} tokens
 * @returns {UniverseAST}
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

  function parseArray() {
    expect("LBRACKET");
    const items = [];
    while (peek().type !== "RBRACKET") {
      const t = peek();
      if (t.type === "STRING") items.push(advance().value);
      else if (t.type === "IDENT") items.push(advance().value);
      else if (t.type === "KEYWORD") items.push(advance().value);
      else if (t.type === "NUMBER") items.push(Number(advance().value));
      else throw new Error(`Unexpected ${t.type} in array at line ${t.line}`);
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
  const fw = createFrameworkParsers(helpers);

  // Main: parse universe
  expectKeyword("universe");
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
    framework: null,
    content: [],
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
    framework: () => {
      ast.framework = fw.parseFramework();
    },
    content: () => ast.content.push(blocks.parseContent()),
    dataset: () => {
      const id = parseStringOrIdent();
      ast.datasets.push(fw.parseDataset(id));
    },
    output: () => {
      const datasetId = parseStringOrIdent();
      ast.outputs.push(fw.parseOutput(datasetId));
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

  // Validate distribution keys against framework levels (when both exist)
  if (ast.people?.distribution && ast.framework?.levels?.length) {
    const levelIds = new Set(ast.framework.levels.map((l) => l.id));
    for (const key of Object.keys(ast.people.distribution)) {
      if (!levelIds.has(key)) {
        const have = ast.framework.levels.map((l) => l.id).join(", ");
        throw new Error(
          `distribution key "${key}" does not match any framework level (have: ${have})`,
        );
      }
    }
  }

  return ast;
}
