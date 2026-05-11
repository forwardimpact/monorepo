/**
 * `fit-landmark sources` — list activity row classes retained about an engineer.
 *
 * Iterates the SOURCE_CLASSES registry — one entry per RLS'd activity table —
 * issuing an asc+desc pair through the authenticated Supabase client. RLS
 * clamps both, so results reflect the caller's view. Classes with zero
 * visible rows are filtered out; if all classes clamp to zero the command
 * renders NO_SOURCES_FOR_PERSON.
 */

import { readRetention } from "@forwardimpact/map/activity/retention";
import { EMPTY_STATES } from "../lib/empty-state.js";

export const needsSupabase = true;

const CLASSES = [
  {
    id: "organization_people",
    label: "Profile",
    // organization_people is the null-window class — its retention COMMENT is
    // intentionally empty (admitted by activity._validate_retention_blob's
    // organization_people exemption), so readRetention returns {window: null,
    // clock: null}. The table's actual timestamp column is `updated_at`, so
    // declare it here so the asc/desc probes in inventoryClass don't fall
    // back to `imported_at` (which doesn't exist on this table).
    clock: "updated_at",
    plan: async (_s, e) => ({
      table: "organization_people",
      filter: (q) => q.eq("email", e),
    }),
  },
  {
    id: "evidence",
    label: "Evidence",
    plan: async (_s, e) => ({
      table: "evidence",
      select: "created_at,github_artifacts!inner(email)",
      filter: (q) => q.eq("github_artifacts.email", e),
    }),
  },
  {
    id: "github_artifacts",
    label: "GitHub artifacts",
    plan: async (_s, e) => ({
      table: "github_artifacts",
      filter: (q) => q.eq("email", e),
    }),
  },
  {
    id: "getdx_snapshot_comments",
    label: "GetDX comments",
    plan: async (_s, e) => ({
      table: "getdx_snapshot_comments",
      filter: (q) => q.eq("email", e),
    }),
  },
  {
    id: "getdx_snapshot_team_scores",
    label: "GetDX team scores",
    plan: async (s, e) => {
      const { data, error } = await s
        .from("organization_people")
        .select("getdx_team_id")
        .eq("email", e)
        .maybeSingle();
      if (error) throw error;
      const t = data?.getdx_team_id;
      return t
        ? {
            table: "getdx_snapshot_team_scores",
            filter: (q) => q.eq("getdx_team_id", t),
          }
        : null;
    },
  },
  {
    id: "getdx_snapshots",
    label: "GetDX snapshot cycles",
    plan: async (s, e) => {
      const { data, error } = await s.rpc("snapshot_ids_for_person", {
        p_email: e,
      });
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.snapshot_id);
      return ids.length
        ? {
            table: "getdx_snapshots",
            filter: (q) => q.in("snapshot_id", ids),
          }
        : null;
    },
  },
];

async function inventoryClass(supabase, cls, email) {
  const plan = await cls.plan(supabase, email);
  if (!plan) return null;
  const ret = await readRetention(supabase, cls.id);
  // Resolution order: retention metadata wins (single source of truth for
  // classes that declare a window), then per-class override (for null-window
  // classes that still have a usable timestamp column), then "imported_at"
  // as the documented default the other five tables happen to use.
  const clock = ret.clock ?? cls.clock ?? "imported_at";
  const sel = plan.select ?? `${clock}`;
  const asc = plan.filter(
    supabase
      .from(plan.table)
      .select(sel, { count: "exact" })
      .order(clock, { ascending: true })
      .limit(1),
  );
  const desc = plan.filter(
    supabase
      .from(plan.table)
      .select(sel)
      .order(clock, { ascending: false })
      .limit(1),
  );
  const [ascRes, descRes] = await Promise.all([asc, desc]);
  if (ascRes.error) throw ascRes.error;
  if (descRes.error) throw descRes.error;
  const { data: oldRows, count } = ascRes;
  const { data: newRows } = descRes;
  if (!count) return null;
  const oldest = oldRows[0]?.[clock] ?? null;
  const newest = newRows[0]?.[clock] ?? null;
  const falloff = ret.window && oldest ? addIso(oldest, ret.window) : null;
  return {
    id: cls.id,
    label: cls.label,
    count,
    oldest,
    newest,
    window: ret.window,
    falloff,
  };
}

/**
 * Run the sources command — list activity row classes retained about `email`.
 *
 * @param {object} params
 * @param {object} params.options
 * @param {string} params.options.email
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {string} [params.format]
 * @returns {Promise<{view: {email: string, items: object[]}|null, meta: object}>}
 */
export async function runSourcesCommand({ options, supabase, format }) {
  const email = options.email;
  if (!email) throw new Error("sources: --email <e> is required");
  const items = [];
  for (const cls of CLASSES) {
    const item = await inventoryClass(supabase, cls, email);
    if (item) items.push(item);
  }
  if (!items.length) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.NO_SOURCES_FOR_PERSON(email),
      },
    };
  }
  return { view: { email, items }, meta: { format } };
}

function addIso(ts, p) {
  const m = /^P(\d+)([DWMY])$/.exec(p);
  if (!m) return null;
  const d = new Date(ts);
  const n = Number(m[1]);
  if (m[2] === "D") d.setUTCDate(d.getUTCDate() + n);
  if (m[2] === "W") d.setUTCDate(d.getUTCDate() + 7 * n);
  if (m[2] === "M") d.setUTCMonth(d.getUTCMonth() + n);
  if (m[2] === "Y") d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString();
}
