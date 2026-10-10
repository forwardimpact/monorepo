// XmR constants for individuals charts (subgroup size n=2).
// The values come from Wheeler's *Understanding Variation* tables.

export const d2 = 1.128;
export const E2 = 2.66;
export const D4 = 3.268;
export const ZONE_SIGMAS = 1.5;

export const MIN_POINTS = 15;

export const HEADER = "date,metric,value,unit,run,note,event_type,host_run";
export const COLUMNS = [
  "date",
  "metric",
  "value",
  "unit",
  "run",
  "note",
  "event_type",
  "host_run",
];
// The 7-column header that came before the trailing `host_run` column.
// Legacy current-year files that carry this header stay valid.
export const LEGACY_HEADER = "date,metric,value,unit,run,note,event_type";
// A row holds the seven legacy columns or the eight current ones. The range
// derives from the two headers, so the column count has one home.
export const MIN_FIELDS = LEGACY_HEADER.split(",").length;
export const MAX_FIELDS = HEADER.split(",").length;
// The reserved off-workflow value. `record` writes it when the caller names
// no slice and no host workflow exists. It is not a workflow filename, and
// no workflow file may take the name.
export const INTERACTIVE_EVENT_TYPE = "interactive";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
