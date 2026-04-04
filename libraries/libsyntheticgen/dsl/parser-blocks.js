/**
 * DSL Parser — block-level parsers for specific AST node types.
 *
 * Extracted from parser.js to reduce file length and complexity.
 *
 * @module libuniverse/dsl/parser-blocks
 */

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

  function parseOrg() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const org = { id };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "name") org.name = parseStringValue();
      else if (kw.value === "location") org.location = parseStringValue();
      else
        throw new Error(`Unexpected '${kw.value}' in org at line ${kw.line}`);
    }
    expect("RBRACE");
    return org;
  }

  function parseTeam(departmentId) {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const team = { id, department: departmentId };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "name") team.name = parseStringValue();
      else if (kw.value === "size") team.size = parseNumberValue();
      else if (kw.value === "manager") {
        const t = advance();
        team.manager = t.type === "AT_IDENT" ? t.value : t.value;
      } else if (kw.value === "repos") team.repos = parseArray();
      else
        throw new Error(`Unexpected '${kw.value}' in team at line ${kw.line}`);
    }
    expect("RBRACE");
    return team;
  }

  function parseDepartment() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const dept = { id, _children: [] };
    const teams = [];
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "name") dept.name = parseStringValue();
      else if (kw.value === "parent") dept.parent = parseStringOrIdent();
      else if (kw.value === "headcount") dept.headcount = parseNumberValue();
      else if (kw.value === "team") {
        const team = parseTeam(id);
        teams.push(team);
      } else
        throw new Error(
          `Unexpected '${kw.value}' in department at line ${kw.line}`,
        );
    }
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

  function parsePeople() {
    expect("LBRACE");
    const people = {};
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "count") people.count = parseNumberValue();
      else if (kw.value === "names") people.names = parseStringValue();
      else if (kw.value === "distribution")
        people.distribution = parsePeopleMap();
      else if (kw.value === "disciplines")
        people.disciplines = parsePeopleMap();
      else if (kw.value === "archetypes") people.archetypes = parsePeopleMap();
      else
        throw new Error(
          `Unexpected '${kw.value}' in people at line ${kw.line}`,
        );
    }
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

  function parseProject() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const proj = { id };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (PROJECT_STRING_KEYS.has(kw.value))
        proj[kw.value] = parseStringValue();
      else if (PROJECT_DATE_KEYS.has(kw.value))
        proj[kw.value] = parseDateValue();
      else if (PROJECT_ARRAY_KEYS.has(kw.value)) proj[kw.value] = parseArray();
      else
        throw new Error(
          `Unexpected '${kw.value}' in project at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return proj;
  }

  function parseDxDrivers() {
    expect("LBRACE");
    const drivers = [];
    while (peek().type !== "RBRACE") {
      const driverId = parseStringOrIdent();
      expect("LBRACE");
      const driver = { driver_id: driverId };
      while (peek().type !== "RBRACE") {
        const kw = advance();
        if (kw.value === "trajectory") driver.trajectory = parseStringValue();
        else if (kw.value === "magnitude")
          driver.magnitude = parseNumberValue();
        else
          throw new Error(
            `Unexpected '${kw.value}' in dx_driver at line ${kw.line}`,
          );
      }
      expect("RBRACE");
      drivers.push(driver);
    }
    expect("RBRACE");
    return drivers;
  }

  function parseAffect() {
    const teamId = parseStringOrIdent();
    expect("LBRACE");
    const affect = { team_id: teamId };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "github_commits")
        affect.github_commits = parseStringValue();
      else if (kw.value === "github_prs")
        affect.github_prs = parseStringValue();
      else if (kw.value === "dx_drivers") affect.dx_drivers = parseDxDrivers();
      else if (kw.value === "evidence_skills")
        affect.evidence_skills = parseArray();
      else if (kw.value === "evidence_floor")
        affect.evidence_floor = parseStringValue();
      else
        throw new Error(
          `Unexpected '${kw.value}' in affect at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return affect;
  }

  function parseScenario() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const scenario = { id, affects: [] };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "name") scenario.name = parseStringValue();
      else if (kw.value === "narrative")
        scenario.narrative = parseStringValue();
      else if (kw.value === "timerange_start")
        scenario.timerange_start = parseDateValue();
      else if (kw.value === "timerange_end")
        scenario.timerange_end = parseDateValue();
      else if (kw.value === "affect") scenario.affects.push(parseAffect());
      else
        throw new Error(
          `Unexpected '${kw.value}' in scenario at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return scenario;
  }

  function parseSnapshots() {
    expect("LBRACE");
    const snaps = {};
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "quarterly_from")
        snaps.quarterly_from = parseDateValue();
      else if (kw.value === "quarterly_to")
        snaps.quarterly_to = parseDateValue();
      else if (kw.value === "account_id") snaps.account_id = parseStringValue();
      else if (kw.value === "comments_per_snapshot")
        snaps.comments_per_snapshot = parseNumberValue();
      else
        throw new Error(
          `Unexpected '${kw.value}' in snapshots at line ${kw.line}`,
        );
    }
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

  function parseContent() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const content = { id };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (CONTENT_NUMBER_KEYS.has(kw.value))
        content[kw.value] = parseNumberValue();
      else if (CONTENT_ARRAY_KEYS.has(kw.value))
        content[kw.value] = parseArray();
      else if (kw.value === "blog_topics") {
        expect("LBRACE");
        content.blog_topics = {};
        while (peek().type !== "RBRACE") {
          const topic = parseStringOrIdent();
          const pct = parseNumberValue();
          content.blog_topics[topic] = pct;
        }
        expect("RBRACE");
      } else
        throw new Error(
          `Unexpected '${kw.value}' in content at line ${kw.line}`,
        );
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
