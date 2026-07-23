/**
 * Multi-file orchestrator for cross-trace `gemba-trace` verbs.
 *
 * Two functions centralise the load-tag-concat (`runOver`) and
 * aggregate-and-sort (`aggregate`) policies so every cross-trace verb shares
 * one source-attribution rule. `compareTwo` derives per-side identity from
 * each input's basename and threads it into `TraceQuery.compare()`.
 *
 * `load` is injected (the exported `loadTrace` from `commands/trace.js`) so
 * this module stays IO-policy-free and unit-testable with a stub.
 */
import { basename } from "node:path";

import { parseIdentity } from "./trace-identity.js";

/**
 * Load each file → `TraceQuery`, run `query(tq)`, tag each emitted record with
 * `source: <basename>` only when more than one file is supplied. Records are
 * concatenated in file-then-record order.
 * @param {string[]} files
 * @param {(tq: object) => object[]} query
 * @param {(file: string) => object} load
 * @returns {object[]}
 */
export function runOver(files, query, load) {
  const multi = files.length > 1;
  const out = [];
  for (const file of files) {
    const source = basename(file);
    const records = query(load(file));
    for (const record of records) {
      out.push(multi ? { ...record, source } : record);
    }
  }
  return out;
}

/**
 * Merge per-file record arrays by `key(record)`, summing each record's
 * existing `count` field (not occurrence count), and frequency-sort by
 * `count desc`. Merged records carry `sources: string[]` only when more than
 * one file is supplied.
 * @param {string[]} files
 * @param {(tq: object) => Array<{count: number}>} query
 * @param {(record: object) => string} key
 * @param {(file: string) => object} load
 * @returns {object[]}
 */
export function aggregate(files, query, key, load) {
  const multi = files.length > 1;
  const merged = new Map();
  for (const file of files) {
    const source = basename(file);
    for (const record of query(load(file))) {
      const k = key(record);
      if (!merged.has(k)) {
        merged.set(k, { record: { ...record }, sources: new Set() });
      } else {
        merged.get(k).record.count += record.count;
      }
      merged.get(k).sources.add(source);
    }
  }
  return [...merged.values()]
    .map(({ record, sources }) =>
      multi ? { ...record, sources: [...sources].sort() } : record,
    )
    .sort((a, b) => b.count - a.count);
}

/**
 * Load two files, derive each side's `{caseName, participant}` from its
 * basename via the `split` convention, and thread them into
 * `a.compare(b, {aIdentity, bIdentity})`.
 * @param {string} a
 * @param {string} b
 * @param {(file: string) => object} load
 * @returns {object}
 */
export function compareTwo(a, b, load) {
  const qa = load(a);
  const qb = load(b);
  return qa.compare(qb, {
    aIdentity: parseIdentity(a),
    bIdentity: parseIdentity(b),
  });
}
