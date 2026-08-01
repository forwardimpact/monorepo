import { DEFAULT_SHIFT_TYPE } from "../constants.js";

// The CLI's read commands share one slice-resolution rule. No flag means
// the kata-shift slice. "*" disables the filter. `eventType` is the
// machine value that the code hands to analyze(), listMetrics(), and JSON
// consumers. `label` is the human form for text output.
/** Resolve the effective event_type slice and its display label from a command's --event-type option value. */
export function resolveSlice(value) {
  const eventType = value || DEFAULT_SHIFT_TYPE;
  const label = eventType === "*" ? "* (all rows)" : eventType;
  return { eventType, label };
}
