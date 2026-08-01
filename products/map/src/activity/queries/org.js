/**
 * Organization Queries
 *
 * Query functions for the unified person model and team hierarchy.
 */

/**
 * Get all people in the organization.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Promise<Array<Object>>} All people
 */
export async function getOrganization(supabase) {
  const { data, error } = await supabase
    .from("organization_people")
    .select("*")
    .order("name");

  if (error) throw new Error(`getOrganization: ${error.message}`);
  return data;
}

/**
 * Get a team. The query walks the manager_email hierarchy.
 * Returns the manager and all direct/indirect reports.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} managerEmail - Email of the team manager
 * @returns {Promise<Array<Object>>} Team members (including manager)
 */
export async function getTeam(supabase, managerEmail) {
  const { data, error } = await supabase.rpc("get_team", {
    root_email: managerEmail,
  });

  if (error) throw new Error(`getTeam: ${error.message}`);
  return data;
}

/**
 * Get a single person by email.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} email - Person's email
 * @returns {Promise<Object|null>} Person or null
 */
export async function getPerson(supabase, email) {
  const { data, error } = await supabase
    .from("organization_people")
    .select("*")
    .eq("email", email)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`getPerson: ${error.message}`);
  }
  return data;
}
