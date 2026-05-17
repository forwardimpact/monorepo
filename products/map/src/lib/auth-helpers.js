/**
 * Shared helpers for fit-map commands that need to reconcile
 * `organization_people` roster rows against the underlying
 * `auth.users` table via the Supabase admin API.
 *
 * Used by both `fit-map auth issue` (operator-facing) and
 * `fit-map substrate issue` (workflow-facing).
 */

/**
 * Look up a Supabase `auth.users` row by email via the admin API.
 * Iterates pages so it works on rosters larger than the API's page size.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} email
 * @returns {Promise<object | null>} The matching user row, or null if absent.
 */
export async function findAuthUser(supabase, email) {
  // Roster size in the hundreds; one page covers any practical org.
  // listUsers() returns paginated results; iterate to be safe.
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}
