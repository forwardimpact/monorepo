/**
 * Initiative Queries
 *
 * Thin SELECT wrappers for GetDX initiatives.
 */

/**
 * List initiatives with optional filters.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} [options]
 * @param {string} [options.ownerEmail] - Filter by owner email
 * @param {string} [options.managerEmail] - Filter to this manager's team
 * @param {"active"|"completed"} [options.status] - Filter by completion status
 * @returns {Promise<Array<Object>>} Initiatives
 */
export async function listInitiatives(supabase, options = {}) {
  let query = supabase
    .from("getdx_initiatives")
    .select("*")
    .order("due_date", { ascending: true });

  if (options.ownerEmail) {
    query = query.eq("owner_email", options.ownerEmail);
  }

  if (options.managerEmail) {
    const { data: team } = await supabase
      .from("organization_people")
      .select("email")
      .eq("manager_email", options.managerEmail);
    const emails = (team ?? []).map((t) => t.email);
    if (emails.length === 0) return [];
    query = query.in("owner_email", emails);
  }

  if (options.status === "active") {
    query = query.is("completed_at", null);
  }
  if (options.status === "completed") {
    query = query.not("completed_at", "is", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Get a single initiative by ID.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} id - Initiative ID
 * @returns {Promise<Object|null>}
 */
export async function getInitiative(supabase, id) {
  const { data, error } = await supabase
    .from("getdx_initiatives")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
