-- =============================================================================
-- get_team recursive function
-- =============================================================================
-- Returns the full team tree rooted at the given email address.
-- Used by activity/queries/ via supabase.rpc('get_team', ...).
-- =============================================================================

CREATE OR REPLACE FUNCTION activity.get_team(root_email TEXT)
RETURNS SETOF activity.organization_people
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH RECURSIVE team AS (
    SELECT * FROM activity.organization_people WHERE email = root_email
    UNION ALL
    SELECT p.* FROM activity.organization_people p
    JOIN team t ON p.manager_email = t.email
  )
  SELECT * FROM team;
$$;
