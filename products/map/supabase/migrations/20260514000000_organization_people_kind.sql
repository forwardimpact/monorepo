-- Add a `kind` discriminator to organization_people so service-account rows
-- (operator-minted, no human owner) can sit alongside engineer rows without
-- abusing the human-only columns. RLS policies from
-- 20260510000000_landmark_rls.sql remain unchanged: both kinds share the
-- same per-row-class scope rule.

ALTER TABLE activity.organization_people
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'human'
  CHECK (kind IN ('human', 'service_account'));

-- Service-account rows carry no Pathway job profile. Relax the NOT NULL
-- on `level` and enforce the kind-specific shape via a check constraint:
-- human rows must have a level; service-account rows must not.
ALTER TABLE activity.organization_people
  ALTER COLUMN level DROP NOT NULL;

ALTER TABLE activity.organization_people
  ADD CONSTRAINT organization_people_kind_level_check CHECK (
    (kind = 'human' AND level IS NOT NULL)
    OR (kind = 'service_account' AND level IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_organization_people_kind
  ON activity.organization_people(kind);
