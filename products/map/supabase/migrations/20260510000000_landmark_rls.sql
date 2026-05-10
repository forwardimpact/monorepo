-- Revoke prior grants on the six RLS'd tables only. Tables not in
-- the slice (e.g. activity.getdx_teams, activity.github_events) are
-- left untouched so the panel-flagged blast radius stays bounded.
REVOKE ALL ON
  activity.organization_people, activity.evidence,
  activity.github_artifacts, activity.getdx_snapshot_comments,
  activity.getdx_snapshot_team_scores, activity.getdx_snapshots
  FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA activity REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA activity REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Re-grant SELECT to authenticated on the six RLS'd tables only.
GRANT SELECT ON activity.organization_people, activity.evidence,
  activity.github_artifacts, activity.getdx_snapshot_comments,
  activity.getdx_snapshot_team_scores, activity.getdx_snapshots
  TO authenticated;

ALTER TABLE activity.organization_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.github_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.getdx_snapshot_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.getdx_snapshot_team_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.getdx_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY landmark_select ON activity.organization_people
  FOR SELECT TO authenticated
  USING (email = (SELECT auth.email()) OR manager_email = (SELECT auth.email()));

CREATE POLICY landmark_select ON activity.github_artifacts
  FOR SELECT TO authenticated
  USING (
    email = (SELECT auth.email()) OR EXISTS (
      SELECT 1 FROM activity.organization_people op
      WHERE op.email = github_artifacts.email
        AND op.manager_email = (SELECT auth.email())
    )
  );

CREATE POLICY landmark_select ON activity.evidence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM activity.github_artifacts ga
    WHERE ga.artifact_id = evidence.artifact_id
  ));

CREATE POLICY landmark_select ON activity.getdx_snapshot_comments
  FOR SELECT TO authenticated
  USING (
    email = (SELECT auth.email()) OR EXISTS (
      SELECT 1 FROM activity.organization_people op
      WHERE op.email = getdx_snapshot_comments.email
        AND op.manager_email = (SELECT auth.email())
    )
  );

CREATE POLICY landmark_select ON activity.getdx_snapshot_team_scores
  FOR SELECT TO authenticated
  USING (getdx_team_id IN (
    SELECT getdx_team_id FROM activity.organization_people
    WHERE email = (SELECT auth.email()) OR manager_email = (SELECT auth.email())
  ));

CREATE POLICY landmark_select ON activity.getdx_snapshots
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_evidence_artifact_id
  ON activity.evidence(artifact_id);
CREATE INDEX IF NOT EXISTS idx_github_artifacts_email
  ON activity.github_artifacts(email);

-- Retention metadata.
COMMENT ON TABLE activity.organization_people IS '';
COMMENT ON TABLE activity.evidence IS
  'retention.window=P180D retention.clock=created_at';
COMMENT ON TABLE activity.github_artifacts IS
  'retention.window=P180D retention.clock=occurred_at';
COMMENT ON TABLE activity.getdx_snapshot_comments IS
  'retention.window=P730D retention.clock=timestamp';
COMMENT ON TABLE activity.getdx_snapshot_team_scores IS
  'retention.window=P730D retention.clock=imported_at';
COMMENT ON TABLE activity.getdx_snapshots IS
  'retention.window=P730D retention.clock=imported_at';

CREATE OR REPLACE FUNCTION activity._validate_retention_blob(t TEXT, blob TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
  win TEXT; clk TEXT; ok BOOL;
BEGIN
  IF blob IS NULL OR blob = '' THEN
    -- Empty admitted only for organization_people (null-window class).
    IF t <> 'organization_people' THEN
      RAISE EXCEPTION 'retention metadata missing for activity.%', t;
    END IF;
    RETURN;
  END IF;
  win := substring(blob FROM 'retention\.window=(P[0-9]+[DWMY])');
  clk := substring(blob FROM 'retention\.clock=([a-z_][a-z0-9_]*)');
  IF t = 'organization_people' AND win IS NULL AND clk IS NULL THEN
    RETURN;
  END IF;
  IF win IS NULL OR clk IS NULL THEN
    RAISE EXCEPTION 'retention metadata malformed for activity.%: %', t, blob;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'activity' AND table_name = t AND column_name = clk
  ) INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'retention.clock=% references missing column on activity.%', clk, t;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION activity.retention_blob(p_table TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT obj_description(format('activity.%I', p_table)::regclass, 'pg_class')
  WHERE p_table IN ('organization_people','evidence','github_artifacts',
    'getdx_snapshot_comments','getdx_snapshot_team_scores','getdx_snapshots');
$$;
GRANT EXECUTE ON FUNCTION activity.retention_blob(TEXT) TO authenticated, service_role;

-- Source inventory snapshot-id union, used by `fit-landmark sources`.
-- SECURITY INVOKER so RLS clamps inside the UNION; declared explicitly.
CREATE OR REPLACE FUNCTION activity.snapshot_ids_for_person(p_email TEXT)
RETURNS TABLE (snapshot_id TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT DISTINCT snapshot_id FROM activity.getdx_snapshot_comments
    WHERE email = p_email
  UNION
  SELECT DISTINCT s.snapshot_id FROM activity.getdx_snapshot_team_scores s
    JOIN activity.organization_people op
      ON op.getdx_team_id = s.getdx_team_id
    WHERE op.email = p_email;
$$;
GRANT EXECUTE ON FUNCTION activity.snapshot_ids_for_person(TEXT)
  TO authenticated, service_role;

DO $$
DECLARE
  rec RECORD;
  blob TEXT;
BEGIN
  FOR rec IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'activity' AND c.relname IN
      ('organization_people','evidence','github_artifacts',
       'getdx_snapshot_comments','getdx_snapshot_team_scores','getdx_snapshots')
  LOOP
    blob := obj_description(format('activity.%I', rec.relname)::regclass, 'pg_class');
    PERFORM activity._validate_retention_blob(rec.relname, blob);
  END LOOP;
END $$;
