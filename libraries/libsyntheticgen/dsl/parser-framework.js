/**
 * DSL Parser — framework and dataset block parsers.
 *
 * Extracted from parser.js to reduce file length.
 *
 * @module libuniverse/dsl/parser-framework
 */

/**
 * Create framework and dataset parsers bound to shared token helpers.
 * @param {{ peek: () => any, advance: () => any, expect: (type: string, value?: string) => any, parseStringOrIdent: () => string, parseStringValue: () => string, parseNumberValue: () => number, parseArray: () => any[] }} helpers
 * @returns {object}
 */
export function createFrameworkParsers(helpers) {
  const {
    peek,
    advance,
    expect,
    parseStringOrIdent,
    parseStringValue,
    parseNumberValue,
    parseArray,
  } = helpers;

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
    const FW_ARRAY_KEYS = new Set(["proficiencies", "maturities", "stages"]);
    const FW_PARSERS = {
      levels: parseFrameworkLevels,
      capabilities: parseFrameworkCapabilities,
      behaviours: parseFrameworkBehaviours,
      disciplines: parseFrameworkDisciplines,
      tracks: parseFrameworkTracks,
      drivers: parseFrameworkDrivers,
    };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (FW_ARRAY_KEYS.has(kw.value)) fw[kw.value] = parseArray();
      else if (FW_PARSERS[kw.value]) fw[kw.value] = FW_PARSERS[kw.value]();
      else
        throw new Error(
          `Unexpected '${kw.value}' in framework at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return fw;
  }

  const DATASET_FORMATS = new Set([
    "json",
    "yaml",
    "csv",
    "markdown",
    "parquet",
    "sql",
  ]);

  function parseDatasetFields() {
    expect("LBRACE");
    const fields = {};
    while (peek().type !== "RBRACE") {
      const name = parseStringOrIdent();
      const value = parseStringValue();
      fields[name] = value;
    }
    expect("RBRACE");
    return fields;
  }

  function parseDataset(id) {
    expect("LBRACE");
    const ds = { id, tool: null, config: {} };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "tool") ds.tool = parseStringOrIdent();
      else if (kw.value === "population")
        ds.config.population = parseNumberValue();
      else if (kw.value === "modules") ds.config.modules = parseArray();
      else if (kw.value === "metadata") ds.config.metadata = parseStringValue();
      else if (kw.value === "data") ds.config.data = parseDatasetFields();
      else if (kw.value === "rows") ds.config.rows = parseNumberValue();
      else if (kw.value === "fields") ds.config.fields = parseDatasetFields();
      else
        throw new Error(
          `Unexpected '${kw.value}' in dataset at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return ds;
  }

  function parseOutput(datasetId) {
    const format = parseStringOrIdent();
    if (!DATASET_FORMATS.has(format)) {
      throw new Error(
        `Unknown output format '${format}'. Expected one of: ${[...DATASET_FORMATS].join(", ")}`,
      );
    }
    expect("LBRACE");
    const out = { dataset: datasetId, format, config: {} };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (kw.value === "path") out.config.path = parseStringValue();
      else if (kw.value === "table") out.config.table = parseStringValue();
      else
        throw new Error(
          `Unexpected '${kw.value}' in output at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return out;
  }

  return {
    parseFramework,
    parseDataset,
    parseOutput,
  };
}
