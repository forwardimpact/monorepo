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
 */

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

  function parsePeople() {
    expect("LBRACE");
    const people = {};
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "count") people.count = parseNumberValue();
      else if (kw.value === "names") people.names = parseStringValue();
      else if (kw.value === "distribution") {
        expect("LBRACE");
        people.distribution = {};
        while (peek().type !== "RBRACE") {
          const level = parseStringOrIdent();
          const pct = parseNumberValue();
          people.distribution[level] = pct;
        }
        expect("RBRACE");
      } else if (kw.value === "disciplines") {
        expect("LBRACE");
        people.disciplines = {};
        while (peek().type !== "RBRACE") {
          const disc = parseStringOrIdent();
          const pct = parseNumberValue();
          people.disciplines[disc] = pct;
        }
        expect("RBRACE");
      } else
        throw new Error(
          `Unexpected '${kw.value}' in people at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return people;
  }

  function parseProject() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const proj = { id };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "name") proj.name = parseStringValue();
      else if (kw.value === "type") proj.type = parseStringValue();
      else if (kw.value === "phase") proj.phase = parseStringValue();
      else if (kw.value === "teams") proj.teams = parseArray();
      else if (kw.value === "timeline_start")
        proj.timeline_start = parseDateValue();
      else if (kw.value === "timeline_end")
        proj.timeline_end = parseDateValue();
      else if (kw.value === "prose_topic")
        proj.prose_topic = parseStringValue();
      else if (kw.value === "prose_tone") proj.prose_tone = parseStringValue();
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
      else
        throw new Error(
          `Unexpected '${kw.value}' in snapshots at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return snaps;
  }

  function parseFramework() {
    expect("LBRACE");
    const fw = {
      proficiencies: [],
      maturities: [],
      levels: [],
      capabilities: [],
      behaviours: [],
      disciplines: [],
      tracks: [],
      drivers: [],
      stages: [],
    };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "proficiencies") fw.proficiencies = parseArray();
      else if (kw.value === "maturities") fw.maturities = parseArray();
      else if (kw.value === "stages") fw.stages = parseArray();
      else if (kw.value === "levels") fw.levels = parseFrameworkLevels();
      else if (kw.value === "capabilities")
        fw.capabilities = parseFrameworkCapabilities();
      else if (kw.value === "behaviours")
        fw.behaviours = parseFrameworkBehaviours();
      else if (kw.value === "disciplines")
        fw.disciplines = parseFrameworkDisciplines();
      else if (kw.value === "tracks") fw.tracks = parseFrameworkTracks();
      else if (kw.value === "drivers") fw.drivers = parseFrameworkDrivers();
      else
        throw new Error(
          `Unexpected '${kw.value}' in framework at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return fw;
  }

  /**
   * Parse levels block: levels { J040 { title "..." rank 1 experience "..." } ... }
   * @returns {object[]}
   */
  function parseFrameworkLevels() {
    expect("LBRACE");
    const levels = [];
    while (peek().type !== "RBRACE") {
      const id = parseStringOrIdent();
      expect("LBRACE");
      const level = { id };
      while (peek().type !== "RBRACE") {
        const kw = advance();
        if (kw.value === "title") level.professionalTitle = parseStringValue();
        else if (kw.value === "roleTitle")
          level.managementTitle = parseStringValue();
        else if (kw.value === "rank") level.rank = parseNumberValue();
        else if (kw.value === "experience")
          level.experience = parseStringValue();
        else
          throw new Error(
            `Unexpected '${kw.value}' in level at line ${kw.line}`,
          );
      }
      expect("RBRACE");
      levels.push(level);
    }
    expect("RBRACE");
    return levels;
  }

  /**
   * Parse capabilities block: capabilities { id { name "..." skills [...] } ... }
   * @returns {object[]}
   */
  function parseFrameworkCapabilities() {
    expect("LBRACE");
    const caps = [];
    while (peek().type !== "RBRACE") {
      const id = parseStringOrIdent();
      expect("LBRACE");
      const cap = { id };
      while (peek().type !== "RBRACE") {
        const kw = advance();
        if (kw.value === "name") cap.name = parseStringValue();
        else if (kw.value === "skills") cap.skills = parseArray();
        else
          throw new Error(
            `Unexpected '${kw.value}' in capability at line ${kw.line}`,
          );
      }
      expect("RBRACE");
      caps.push(cap);
    }
    expect("RBRACE");
    return caps;
  }

  /**
   * Parse behaviours block: behaviours { id { name "..." } ... }
   * @returns {object[]}
   */
  function parseFrameworkBehaviours() {
    expect("LBRACE");
    const behaviours = [];
    while (peek().type !== "RBRACE") {
      const id = parseStringOrIdent();
      expect("LBRACE");
      const beh = { id };
      while (peek().type !== "RBRACE") {
        const kw = advance();
        if (kw.value === "name") beh.name = parseStringValue();
        else
          throw new Error(
            `Unexpected '${kw.value}' in behaviour at line ${kw.line}`,
          );
      }
      expect("RBRACE");
      behaviours.push(beh);
    }
    expect("RBRACE");
    return behaviours;
  }

  /**
   * Parse disciplines block.
   * @returns {object[]}
   */
  function parseFrameworkDisciplines() {
    expect("LBRACE");
    const disciplines = [];
    while (peek().type !== "RBRACE") {
      const id = parseStringOrIdent();
      expect("LBRACE");
      const disc = { id };
      while (peek().type !== "RBRACE") {
        const kw = advance();
        if (kw.value === "roleTitle") disc.roleTitle = parseStringValue();
        else if (kw.value === "specialization")
          disc.specialization = parseStringValue();
        else if (kw.value === "isProfessional") {
          const val = parseStringOrIdent();
          disc.isProfessional = val === "true";
        } else if (kw.value === "core") disc.core = parseArray();
        else if (kw.value === "supporting") disc.supporting = parseArray();
        else if (kw.value === "broad") disc.broad = parseArray();
        else if (kw.value === "validTracks")
          disc.validTracks = parseNullableArray();
        else
          throw new Error(
            `Unexpected '${kw.value}' in discipline at line ${kw.line}`,
          );
      }
      expect("RBRACE");
      disciplines.push(disc);
    }
    expect("RBRACE");
    return disciplines;
  }

  /**
   * Parse tracks block: tracks { id { name "..." } ... }
   * @returns {object[]}
   */
  function parseFrameworkTracks() {
    expect("LBRACE");
    const tracks = [];
    while (peek().type !== "RBRACE") {
      const id = parseStringOrIdent();
      expect("LBRACE");
      const track = { id };
      while (peek().type !== "RBRACE") {
        const kw = advance();
        if (kw.value === "name") track.name = parseStringValue();
        else
          throw new Error(
            `Unexpected '${kw.value}' in track at line ${kw.line}`,
          );
      }
      expect("RBRACE");
      tracks.push(track);
    }
    expect("RBRACE");
    return tracks;
  }

  /**
   * Parse drivers block: drivers { id { name "..." skills [...] behaviours [...] } ... }
   * @returns {object[]}
   */
  function parseFrameworkDrivers() {
    expect("LBRACE");
    const drivers = [];
    while (peek().type !== "RBRACE") {
      const id = parseStringOrIdent();
      expect("LBRACE");
      const driver = { id };
      while (peek().type !== "RBRACE") {
        const kw = advance();
        if (kw.value === "name") driver.name = parseStringValue();
        else if (kw.value === "skills") driver.skills = parseArray();
        else if (kw.value === "behaviours") driver.behaviours = parseArray();
        else
          throw new Error(
            `Unexpected '${kw.value}' in driver at line ${kw.line}`,
          );
      }
      expect("RBRACE");
      drivers.push(driver);
    }
    expect("RBRACE");
    return drivers;
  }

  /**
   * Parse array that may contain null literals: [null, platform, sre]
   * @returns {Array<string|null>}
   */
  function parseNullableArray() {
    expect("LBRACKET");
    const items = [];
    while (peek().type !== "RBRACKET") {
      const t = peek();
      if (t.type === "STRING") items.push(advance().value);
      else if (t.type === "IDENT") {
        const val = advance().value;
        items.push(val === "null" ? null : val);
      } else if (t.type === "KEYWORD") {
        const val = advance().value;
        items.push(val === "null" ? null : val);
      } else throw new Error(`Unexpected ${t.type} in array at line ${t.line}`);
      if (peek().type === "COMMA") advance();
    }
    expect("RBRACKET");
    return items;
  }

  function parseContent() {
    const id = parseStringOrIdent();
    expect("LBRACE");
    const content = { id };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "articles") content.articles = parseNumberValue();
      else if (kw.value === "article_topics")
        content.article_topics = parseArray();
      else if (kw.value === "blogs") content.blogs = parseNumberValue();
      else if (kw.value === "faqs") content.faqs = parseNumberValue();
      else if (kw.value === "howtos") content.howtos = parseNumberValue();
      else if (kw.value === "howto_topics") content.howto_topics = parseArray();
      else if (kw.value === "reviews") content.reviews = parseNumberValue();
      else if (kw.value === "comments") content.comments = parseNumberValue();
      else if (kw.value === "courses") content.courses = parseNumberValue();
      else if (kw.value === "events") content.events = parseNumberValue();
      else if (kw.value === "personas") content.personas = parseNumberValue();
      else if (kw.value === "persona_levels")
        content.persona_levels = parseArray();
      else if (kw.value === "briefings_per_persona")
        content.briefings_per_persona = parseNumberValue();
      else if (kw.value === "notes_per_persona")
        content.notes_per_persona = parseNumberValue();
      else
        throw new Error(
          `Unexpected '${kw.value}' in content at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return content;
  }

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
  };

  while (peek().type !== "RBRACE" && peek().type !== "EOF") {
    const kw = advance();
    switch (kw.value) {
      case "domain":
        ast.domain = parseStringValue();
        break;
      case "industry":
        ast.industry = parseStringValue();
        break;
      case "seed":
        ast.seed = parseNumberValue();
        break;
      case "org":
        ast.orgs.push(parseOrg());
        break;
      case "department": {
        const { dept, teams } = parseDepartment();
        ast.departments.push(dept);
        ast.teams.push(...teams);
        break;
      }
      case "people":
        ast.people = parsePeople();
        break;
      case "project":
        ast.projects.push(parseProject());
        break;
      case "scenario":
        ast.scenarios.push(parseScenario());
        break;
      case "snapshots":
        ast.snapshots = parseSnapshots();
        break;
      case "framework":
        ast.framework = parseFramework();
        break;
      case "content":
        ast.content.push(parseContent());
        break;
      default:
        throw new Error(
          `Unexpected keyword '${kw.value}' at top level, line ${kw.line}`,
        );
    }
  }

  if (peek().type === "RBRACE") advance();

  return ast;
}
