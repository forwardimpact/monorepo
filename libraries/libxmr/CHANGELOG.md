# Changelog

This file records all notable changes to `@forwardimpact/libxmr`.

## Unreleased

### The read slice comes from the caller or the file (breaking)

The library holds no built-in slice.

- `analyze` and `listMetrics` take parsed rows and one options object with a
  required `eventType` (a value, or `"*"` for all rows). A call without one
  throws a `TypeError`.
- `analyzeSlice` and `listSliceMetrics` compose parse, tally, resolve, and
  compute. Without an explicit slice they read the file's sole value. They
  throw `SliceResolutionError` (with the tally) when the file holds several
  values or only empty values, or when a named slice matches no row of a
  non-empty file.
- The four read commands map that error to the exit-2 envelope through
  `withReadGuard` (renamed from `withIntegrityGuard`). The message carries
  the tally and names the flag.
- `DEFAULT_SHIFT_TYPE` and `EVENT_TYPE_COLUMN` are removed.
- `record` writes the reserved value `interactive` when the caller names no
  slice and no host workflow exists. It no longer refuses the row.
- `validate` rejects a row whose field count is outside 7 to 8.
- The parser normalises the `event_type` cell once. A trailing carriage
  return or surrounding whitespace never splits one slice into two.
- `formatTally` and `sliceLabel` are package-root exports.

**Migration:** pass `eventType` to `analyze` and `listMetrics` (rows in, not
CSV text), or call the composed `analyzeSlice` and `listSliceMetrics` with
CSV text.

### Bin moved to `@forwardimpact/gemba` (breaking)

The `fit-xmr` CLI entry point moved to the `@forwardimpact/gemba` product
package as `gemba-xmr`. This change removes the `bin` field and the `bin/`
directory. libxmr is an import-only library. The command modules the bin
dispatches to are now package exports
(`./commands/{analyze,list,validate,chart,summarize,record}.js`). **Migration:**
install `@forwardimpact/gemba` for the command. Import `@forwardimpact/libxmr`
for the APIs.
