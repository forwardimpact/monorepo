// XmR constants for individuals charts (subgroup size n=2).
// Values from Wheeler's *Understanding Variation* tables.

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
// Header before spec 1910 added the trailing `host_run` column. Legacy
// current-year files written with this 7-column header stay valid.
export const LEGACY_HEADER = "date,metric,value,unit,run,note,event_type";
export const EVENT_TYPE_COLUMN = "event_type";
// Default read slice. Couples to the workflow filename
// `.github/workflows/kata-shift.yml` — if that file is ever renamed,
// update this constant and search `wiki/metrics/` for the old name.
export const DEFAULT_SHIFT_TYPE = "kata-shift";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
