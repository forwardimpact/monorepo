import { createSupabaseClient } from "../_shared/supabase.ts";

Deno.serve(async (_req) => {
  const supabase = createSupabaseClient();
  const results = {
    people: { imported: 0, errors: [] as string[] },
    getdx: { teams: 0, snapshots: 0, scores: 0, errors: [] as string[] },
    github: { events: 0, artifacts: 0, errors: [] as string[] },
  };

  // Transform in dependency order: people → getdx → github

  // 1. People (must be first for email resolution)
  // Read latest people file from storage, parse, upsert

  // 2. GetDX teams and snapshots
  // Read latest teams-list, transform into getdx_teams
  // Read latest snapshots-list, transform into getdx_snapshots
  // Read all snapshots-info, transform into getdx_snapshot_team_scores

  // 3. GitHub
  // Read all github/ webhook documents, transform into events + artifacts

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
