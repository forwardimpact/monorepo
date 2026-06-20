/**
 * DSL Parser — block-level parsers for specific AST node types.
 *
 * Extracted from parser.js to reduce file length and complexity.
 *
 * @module libterrain/dsl/parser-blocks
 */

import { createDispatchHelpers } from "./parser-helpers.js";

/**
 * Create block parsers bound to shared token helpers.
 * @param {{ peek: () => any, advance: () => any, expect: (type: string, value?: string) => any, parseStringOrIdent: () => string, parseStringValue: () => string, parseNumberValue: () => number, parseDateValue: () => string, parseArray: () => any[] }} helpers
 * @returns {object}
 */
export function createBlockParsers(helpers) {
  const {
    peek,
    advance,
    expect,
    parseStringOrIdent,
    parseStringValue,
    parseNumberValue,
    parseDateValue,
    parseArray,
  } = helpers;

  const { consumeFields } = createDispatchHelpers(helpers);

  function parseOrg() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const org = { id };
    consumeFields(
      {
        name: () => {
          org.name = parseStringValue();
        },
        location: () => {
          org.location = parseStringValue();
        },
      },
      "org",
    );
    expect("RBRACE");
    return org;
  }

  function parseTeam(departmentId) {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const team = { id, department: departmentId };
    consumeFields(
      {
        name: () => {
          team.name = parseStringValue();
        },
        size: () => {
          team.size = parseNumberValue();
        },
        manager: () => {
          team.manager = advance().value;
        },
        repos: () => {
          team.repos = parseArray();
        },
      },
      "team",
    );
    expect("RBRACE");
    return team;
  }

  function parseDirector() {
    const handle = advance().value; // AT_IDENT — '@' already stripped
    expect("LBRACE");
    const director = { handle };
    consumeFields(
      {
        name: () => {
          director.name = parseStringValue();
        },
        title: () => {
          director.title = parseStringValue();
        },
        level: () => {
          director.level = parseStringOrIdent();
        },
        discipline: () => {
          director.discipline = parseStringOrIdent();
        },
      },
      "director",
    );
    expect("RBRACE");
    return director;
  }

  function parseDepartment() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const dept = { id, _children: [] };
    const teams = [];
    consumeFields(
      {
        name: () => {
          dept.name = parseStringValue();
        },
        parent: () => {
          dept.parent = parseStringOrIdent();
        },
        headcount: () => {
          dept.headcount = parseNumberValue();
        },
        director: () => {
          dept.director = parseDirector();
        },
        team: () => {
          teams.push(parseTeam(id));
        },
      },
      "department",
    );
    expect("RBRACE");
    return { dept, teams };
  }

  function parsePeopleMap() {
    expect("LBRACE");
    const map = {};
    while (peek().type !== "RBRACE") {
      const key = parseStringOrIdent();
      const pct = parseNumberValue();
      map[key] = pct;
    }
    expect("RBRACE");
    return map;
  }

  function parseServiceAccount() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const sa = { id };
    consumeFields(
      {
        name: () => {
          sa.name = parseStringValue();
        },
        email: () => {
          sa.email = parseStringValue();
        },
      },
      "service_account",
    );
    expect("RBRACE");
    return sa;
  }

  function parsePeople() {
    expect("LBRACE");
    const people = { service_accounts: [] };
    consumeFields(
      {
        count: () => {
          people.count = parseNumberValue();
        },
        names: () => {
          people.names = parseStringValue();
        },
        distribution: () => {
          people.distribution = parsePeopleMap();
        },
        disciplines: () => {
          people.disciplines = parsePeopleMap();
        },
        archetypes: () => {
          people.archetypes = parsePeopleMap();
        },
        service_account: () => {
          people.service_accounts.push(parseServiceAccount());
        },
      },
      "people",
    );
    expect("RBRACE");
    return people;
  }

  const PROJECT_STRING_KEYS = new Set([
    "name",
    "type",
    "phase",
    "prose_topic",
    "prose_tone",
  ]);
  const PROJECT_DATE_KEYS = new Set(["timeline_start", "timeline_end"]);
  const PROJECT_ARRAY_KEYS = new Set([
    "milestones",
    "risks",
    "technical_choices",
    "teams",
  ]);

  function parseProjectField(proj, kw) {
    if (PROJECT_STRING_KEYS.has(kw.value)) proj[kw.value] = parseStringValue();
    else if (PROJECT_DATE_KEYS.has(kw.value)) proj[kw.value] = parseDateValue();
    else if (PROJECT_ARRAY_KEYS.has(kw.value)) proj[kw.value] = parseArray();
    else
      throw new Error(`Unexpected '${kw.value}' in project at line ${kw.line}`);
  }

  function parseProject() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const proj = { id };
    while (peek().type !== "RBRACE") {
      parseProjectField(proj, advance());
    }
    expect("RBRACE");
    return proj;
  }

  function parseSingleDxDriver() {
    const driverId = parseStringOrIdent();
    expect("LBRACE");
    const driver = { driver_id: driverId };
    consumeFields(
      {
        trajectory: () => {
          driver.trajectory = parseStringValue();
        },
        magnitude: () => {
          driver.magnitude = parseNumberValue();
        },
      },
      "dx_driver",
    );
    expect("RBRACE");
    return driver;
  }

  function parseDxDrivers() {
    expect("LBRACE");
    const drivers = [];
    while (peek().type !== "RBRACE") {
      drivers.push(parseSingleDxDriver());
    }
    expect("RBRACE");
    return drivers;
  }

  function parseAffect() {
    const teamId = parseStringOrIdent();
    expect("LBRACE");
    const affect = { team_id: teamId };
    consumeFields(
      {
        github_commits: () => {
          affect.github_commits = parseStringValue();
        },
        github_prs: () => {
          affect.github_prs = parseStringValue();
        },
        dx_drivers: () => {
          affect.dx_drivers = parseDxDrivers();
        },
        evidence_skills: () => {
          affect.evidence_skills = parseArray();
        },
        evidence_floor: () => {
          affect.evidence_floor = parseStringValue();
        },
      },
      "affect",
    );
    expect("RBRACE");
    return affect;
  }

  function parseScenario() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const scenario = { id, affects: [] };
    consumeFields(
      {
        name: () => {
          scenario.name = parseStringValue();
        },
        narrative: () => {
          scenario.narrative = parseStringValue();
        },
        timerange_start: () => {
          scenario.timerange_start = parseDateValue();
        },
        timerange_end: () => {
          scenario.timerange_end = parseDateValue();
        },
        affect: () => {
          scenario.affects.push(parseAffect());
        },
      },
      "scenario",
    );
    expect("RBRACE");
    return scenario;
  }

  function parseSnapshots() {
    expect("LBRACE");
    const snaps = {};
    consumeFields(
      {
        quarterly_from: () => {
          snaps.quarterly_from = parseDateValue();
        },
        quarterly_to: () => {
          snaps.quarterly_to = parseDateValue();
        },
        account_id: () => {
          snaps.account_id = parseStringValue();
        },
        comments_per_snapshot: () => {
          snaps.comments_per_snapshot = parseNumberValue();
        },
        webhook_prose_cap: () => {
          snaps.webhook_prose_cap = parseNumberValue();
        },
      },
      "snapshots",
    );
    expect("RBRACE");
    return snaps;
  }

  const CONTENT_NUMBER_KEYS = new Set([
    "articles",
    "blogs",
    "faqs",
    "howtos",
    "reviews",
    "comments",
    "courses",
    "events",
    "personas",
    "briefings_per_persona",
    "notes_per_persona",
  ]);
  const CONTENT_ARRAY_KEYS = new Set([
    "article_topics",
    "howto_topics",
    "persona_levels",
  ]);

  function parseContentField(content, kw) {
    if (CONTENT_NUMBER_KEYS.has(kw.value))
      content[kw.value] = parseNumberValue();
    else if (CONTENT_ARRAY_KEYS.has(kw.value)) content[kw.value] = parseArray();
    else if (kw.value === "blog_topics") content.blog_topics = parsePeopleMap();
    else
      throw new Error(`Unexpected '${kw.value}' in content at line ${kw.line}`);
  }

  function parseContent() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const content = { id };
    while (peek().type !== "RBRACE") {
      parseContentField(content, advance());
    }
    expect("RBRACE");
    return content;
  }

  return {
    parseOrg,
    parseDepartment,
    parsePeople,
    parseProject,
    parseScenario,
    parseSnapshots,
    parseContent,
  };
}
