-- Substrate Contract implementation for the map product: fixed-name views
-- in a dedicated `substrate` schema mapping `activity.*` onto the contract
-- relations `fit-terrain substrate` verbs consume. Normative reference:
-- https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md
--
-- Grants go to service_role only — `substrate` stays out of anon and
-- authenticated reach, matching the contract's auth model (provisioning
-- and picking use the service-role key; product RLS keys on auth.email()
-- against activity tables, not these views).

create schema substrate;
grant usage on schema substrate to service_role;

-- team_id strips the `gdx_team_` vendor prefix: the contract column carries
-- the DSL team id the terrain enricher keys on. The vendor coupling lives
-- here, in the consumer view — never in the library.
create view substrate.people as
select p.email,
       p.name,
       p.kind,
       p.manager_email,
       replace(p.getdx_team_id, 'gdx_team_', '') as team_id,
       t.name as team_name,
       p.discipline,
       p.level,
       p.track
from activity.organization_people p
left join activity.getdx_teams t on t.getdx_team_id = p.getdx_team_id;

-- One row per authored evidence item, keyed by author email.
create view substrate.evidence as
select ga.email
from activity.evidence e
join activity.github_artifacts ga on ga.artifact_id = e.artifact_id;

-- Discovery vector: the latest snapshot id and one of its driver item ids,
-- folded to key/value rows per the contract's discovery shape.
create view substrate.discovery as
with latest as (
  select snapshot_id
  from activity.getdx_snapshots
  order by scheduled_for desc
  limit 1
)
select 'snapshot_id' as key, latest.snapshot_id as value
from latest
union all
select 'item_id' as key, sc.item_id as value
from latest
join lateral (
  select item_id
  from activity.getdx_snapshot_team_scores
  where snapshot_id = latest.snapshot_id
  limit 1
) sc on true;

grant select on all tables in schema substrate to service_role;
