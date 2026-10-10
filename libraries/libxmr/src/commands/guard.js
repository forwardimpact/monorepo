import { CSVIntegrityError } from "../csv.js";
import { SliceResolutionError } from "../slice.js";

// The commands' read seam. It covers the two error classes a read can raise
// at the seam: a CSV the parser refuses (conflict markers) and a slice the
// resolver cannot settle. Each carries what the library knows; the command
// layer owns the file path and the flag, so the envelope adds both. Any
// other error is a bug. It propagates.
/** Run a read thunk. On CSVIntegrityError or SliceResolutionError, return a CLI error envelope that names the file. Otherwise return `{ok: true, value}`. */
export function withReadGuard(csvPath, fn) {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (err instanceof CSVIntegrityError) {
      return {
        ok: false,
        code: 2,
        error: `cannot parse CSV "${csvPath}": ${err.message}`,
      };
    }
    if (err instanceof SliceResolutionError) {
      return {
        ok: false,
        code: 2,
        error: `cannot resolve slice for "${csvPath}": ${err.message}. Pass --event-type <name> or --event-type '*'`,
      };
    }
    throw err;
  }
}
