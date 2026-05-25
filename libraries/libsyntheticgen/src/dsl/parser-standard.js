/**
 * DSL Parser — standard and dataset block parsers.
 *
 * Extracted from parser.js to reduce file length.
 *
 * @module libterrain/dsl/parser-standard
 */

import { createDispatchHelpers } from "./parser-helpers.js";

/**
 * Create standard and dataset parsers bound to shared token helpers.
 * @param {{ peek: () => any, advance: () => any, expect: (type: string, value?: string) => any, parseStringOrIdent: () => string, parseStringValue: () => string, parseNumberValue: () => number, parseArray: () => any[] }} helpers
 * @returns {object}
 */
export function createStandardParsers(helpers) {
  const {
    peek,
    advance,
    expect,
    parseStringOrIdent,
    parseStringValue,
    parseNumberValue,
    parseArray,
  } = helpers;

  const { consumeFields, parseMappedArrays } = createDispatchHelpers(helpers);

  /**
   * Parse a brace-delimited block of keyword–value pairs using a dispatch
   * table. Throws on any keyword not present in the table.
   * @param {Record<string, (obj: object) => void>} dispatch
   * @param {string} context  — label for error messages
   * @returns {object}
   */
  function parseKeyedBlock(dispatch, context) {
    return consumeFields(dispatch, context, {
      target: {},
      consumeRBrace: true,
    });
  }

  /**
   * Parse a brace-delimited list of named items. Each item is identified by a
   * string/ident key, then parsed via parseKeyedBlock with the given dispatch.
   * @param {Record<string, (obj: object) => void>} dispatch
   * @param {string} context
   * @returns {object[]}
   */
  function parseBracedList(dispatch, context) {
    expect("LBRACE");
    const items = [];
    while (peek().type !== "RBRACE") {
      const id = parseStringOrIdent();
      expect("LBRACE");
      const item = parseKeyedBlock(dispatch, context);
      item.id = id;
      items.push(item);
    }
    expect("RBRACE");
    return items;
  }

  const LEVEL_DISPATCH = {
    title: (o) => {
      o.professionalTitle = parseStringValue();
    },
    roleTitle: (o) => {
      o.managementTitle = parseStringValue();
    },
    rank: (o) => {
      o.rank = parseNumberValue();
    },
    experience: (o) => {
      o.experience = parseStringValue();
    },
  };

  function parseStandardLevels() {
    return parseBracedList(LEVEL_DISPATCH, "level");
  }

  const CAPABILITY_DISPATCH = {
    name: (o) => {
      o.name = parseStringValue();
    },
    skills: (o) => {
      o.skills = parseArray();
    },
  };

  function parseStandardCapabilities() {
    return parseBracedList(CAPABILITY_DISPATCH, "capability");
  }

  const BEHAVIOUR_DISPATCH = {
    name: (o) => {
      o.name = parseStringValue();
    },
  };

  function parseStandardBehaviours() {
    return parseBracedList(BEHAVIOUR_DISPATCH, "behaviour");
  }

  const DISCIPLINE_DISPATCH = {
    roleTitle: (o) => {
      o.roleTitle = parseStringValue();
    },
    specialization: (o) => {
      o.specialization = parseStringValue();
    },
    isProfessional: (o) => {
      const val = parseStringOrIdent();
      o.isProfessional = val === "true";
    },
    core: (o) => {
      o.core = parseArray();
    },
    supporting: (o) => {
      o.supporting = parseArray();
    },
    broad: (o) => {
      o.broad = parseArray();
    },
    validTracks: (o) => {
      o.validTracks = parseNullableArray();
    },
  };

  function parseStandardDisciplines() {
    return parseBracedList(DISCIPLINE_DISPATCH, "discipline");
  }

  const TRACK_DISPATCH = {
    name: (o) => {
      o.name = parseStringValue();
    },
  };

  function parseStandardTracks() {
    return parseBracedList(TRACK_DISPATCH, "track");
  }

  const DRIVER_DISPATCH = {
    name: (o) => {
      o.name = parseStringValue();
    },
    skills: (o) => {
      o.skills = parseArray();
    },
    behaviours: (o) => {
      o.behaviours = parseArray();
    },
  };

  function parseStandardDrivers() {
    return parseBracedList(DRIVER_DISPATCH, "driver");
  }

  /**
   * Resolve a single nullable-array element from the current token.
   * Returns the parsed value or null for literal "null".
   */
  function resolveNullableElement() {
    const t = peek();
    if (t.type === "STRING") return advance().value;
    if (t.type === "IDENT" || t.type === "KEYWORD") {
      const val = advance().value;
      return val === "null" ? null : val;
    }
    throw new Error(`Unexpected ${t.type} in array at line ${t.line}`);
  }

  function parseNullableArray() {
    expect("LBRACKET");
    const items = [];
    while (peek().type !== "RBRACKET") {
      items.push(resolveNullableElement());
      if (peek().type === "COMMA") advance();
    }
    expect("RBRACKET");
    return items;
  }

  function parseStandard() {
    expect("LBRACE");
    const standard = {
      proficiencies: [],
      maturities: [],
      levels: [],
      capabilities: [],
      behaviours: [],
      disciplines: [],
      tracks: [],
      drivers: [],
    };
    const STANDARD_ARRAY_KEYS = new Set(["proficiencies", "maturities"]);
    const STANDARD_PARSERS = {
      levels: parseStandardLevels,
      capabilities: parseStandardCapabilities,
      behaviours: parseStandardBehaviours,
      disciplines: parseStandardDisciplines,
      tracks: parseStandardTracks,
      drivers: parseStandardDrivers,
    };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      if (STANDARD_ARRAY_KEYS.has(kw.value)) standard[kw.value] = parseArray();
      else if (STANDARD_PARSERS[kw.value])
        standard[kw.value] = STANDARD_PARSERS[kw.value]();
      else
        throw new Error(
          `Unexpected '${kw.value}' in standard at line ${kw.line}`,
        );
    }
    expect("RBRACE");
    return standard;
  }

  const DATASET_FORMATS = new Set([
    "json",
    "yaml",
    "csv",
    "markdown",
    "parquet",
    "sql",
    "supabase_migration",
    "embeddings_jsonl",
    "fhir_microdata_html",
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

  const DATASET_DISPATCH = {
    tool: (ds) => {
      ds.tool = parseStringOrIdent();
    },
    population: (ds) => {
      ds.config.population = parseNumberValue();
    },
    modules: (ds) => {
      ds.config.modules = parseArray();
    },
    conditions: (ds) => {
      ds.config.conditions = parseArray();
    },
    metadata: (ds) => {
      ds.config.metadata = parseStringValue();
    },
    data: (ds) => {
      ds.config.data = parseDatasetFields();
    },
    rows: (ds) => {
      ds.config.rows = parseNumberValue();
    },
    fields: (ds) => {
      ds.config.fields = parseDatasetFields();
    },
  };

  function parseDataset(id) {
    expect("LBRACE");
    const ds = { id, tool: null, config: {} };
    while (peek().type !== "RBRACE") {
      const kw = advance();
      const handler = DATASET_DISPATCH[kw.value];
      if (!handler) {
        throw new Error(
          `Unexpected '${kw.value}' in dataset at line ${kw.line}`,
        );
      }
      handler(ds);
    }
    expect("RBRACE");
    return ds;
  }

  function parseBooleanIdent() {
    return parseStringOrIdent() === "true";
  }

  const OUTPUT_DISPATCH = {
    path: (out) => {
      out.config.path = parseStringValue();
    },
    table: (out) => {
      out.config.table = parseStringValue();
    },
    prefix: (out) => {
      out.config.prefix = parseStringValue();
    },
    entities: (out) => {
      out.config.entities = parseArray();
    },
    include_embeddings: (out) => {
      out.config.include_embeddings = parseBooleanIdent();
    },
    text_fields: (out) => {
      out.config.text_fields = parseMappedArrays("text_fields");
    },
  };

  function parseOutput(datasetId) {
    const format = parseStringOrIdent();
    if (!DATASET_FORMATS.has(format)) {
      throw new Error(
        `Unknown output format '${format}'. Expected one of: ${[...DATASET_FORMATS].join(", ")}`,
      );
    }
    expect("LBRACE");
    const out = { dataset: datasetId, format, config: {} };
    consumeFields(OUTPUT_DISPATCH, "output", {
      target: out,
      consumeRBrace: true,
    });
    return out;
  }

  return {
    parseStandard,
    parseDataset,
    parseOutput,
  };
}
