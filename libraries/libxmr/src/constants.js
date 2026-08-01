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
export const EVENT_TYPE_COLUMN = "event_type";
// Default read slice. This constant couples to the workflow filename
// `.github/workflows/kata-shift.yml`. If somebody renames that file,
// update this constant. Also search `wiki/metrics/` for the old name.
export const DEFAULT_SHIFT_TYPE = "kata-shift";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
