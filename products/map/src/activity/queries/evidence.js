/**
 * Evidence Queries
 *
 * Query functions for skill evidence written by Guide.
 */

/**
 * Get evidence rows, with optional filters for skill or person.
 * The person filter joins through artifact_id → github_artifacts.email.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} [options]
 * @param {string} [options.skillId] - Filter by skill ID
 * @param {string} [options.email] - Filter by person email (through artifact)
 * @returns {Promise<Array<Object>>} Evidence rows
 */
export async function getEvidence(supabase, options = {}) {
  let query = supabase
    .from("evidence")
    .select("*, github_artifacts!inner(email, artifact_type, repository)");

  if (options.skillId) {
    query = query.eq("skill_id", options.skillId);
  }

  if (options.email) {
    query = query.eq("github_artifacts.email", options.email);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) throw new Error(`getEvidence: ${error.message}`);
  return data;
}

/**
 * Get aggregated practice patterns across a manager's team.
 * Groups evidence by skill and counts matched/unmatched.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {Object} [options]
 * @param {string} [options.skillId] - Filter by skill ID
 * @param {string} [options.managerEmail] - Filter to this manager's team
 * @returns {Promise<Array<Object>>} Aggregated evidence patterns
 */
export async function getPracticePatterns(supabase, options = {}) {
  // First, get the team emails if the caller filters by manager
  let teamEmails = null;

  if (options.managerEmail) {
    const { data: team } = await supabase.rpc("get_team", {
      root_email: options.managerEmail,
    });
    if (team) {
      teamEmails = new Set(team.map((p) => p.email));
    }
  }

  // Get all evidence (with artifact join for email)
  let query = supabase
    .from("evidence")
    .select("*, github_artifacts!inner(email)");

  if (options.skillId) {
    query = query.eq("skill_id", options.skillId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getPracticePatterns: ${error.message}`);

  // Filter by team if needed
  const filtered = teamEmails
    ? data.filter((e) => teamEmails.has(e.github_artifacts.email))
    : data;

  // Aggregate by skill_id
  const patterns = new Map();
  for (const row of filtered) {
    const key = row.skill_id;
    if (!patterns.has(key)) {
      patterns.set(key, { skill_id: key, matched: 0, unmatched: 0, total: 0 });
    }
    const p = patterns.get(key);
    p.total++;
    if (row.matched) p.matched++;
    else p.unmatched++;
  }

  return Array.from(patterns.values());
}
