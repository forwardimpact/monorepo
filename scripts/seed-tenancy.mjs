#!/usr/bin/env node
// Seed services/tenancy for hosted (multi-tenant) manual tests.
//
// The hosted Teams path needs TWO active tenant rows for one repo. The order
// in which you create them matters:
//
//   1. A `github-discussions` row keyed `"{installation_id}:{owner}/{name}"`
//      (with UpsertByPair). services/ghserver splits this key for the
//      installation id and mints the workflow_dispatch token. So this row MUST
//      exist and MUST be the one ResolveByRepo returns. resolveByRepo returns
//      the first active row that matches the repo in index-insertion order.
//      So create it FIRST, before the msteams row that carries the same repo.
//   2. An `msteams` row keyed by the Entra tenant id (with UpsertByChannelKey +
//      SetRepo). msbridge resolves the dispatch target from this row's repo on
//      every inbound Teams activity.
//
// This bypasses POST /onboard. POST /onboard requires a Bot Framework-issued
// bearer token (audience = the bot's app id). It never writes the github row
// anyway. Run this script against a tenancy service that is running.
//
// Usage (values fall back to .env, which libconfig loads):
//   bun scripts/seed-tenancy.mjs \
//     --repo <owner/name> \            # default: SERVICE_MSBRIDGE_GITHUB_REPO
//     --installation-id <id> \         # default: SERVICE_GHSERVER_INSTALLATION_ID
//                                       #   then SERVICE_GHBRIDGE_APP_INSTALLATION_ID
//     --tid <entra-tenant-id>          # default: SEED_ENTRA_TENANT_ID or MICROSOFT_APP_TENANT_ID
//
//   bun scripts/seed-tenancy.mjs --verify-only   # read-back, no writes

import { createServiceConfig } from "@forwardimpact/libconfig";
import { clients } from "@forwardimpact/librpc";
import { createLogger } from "@forwardimpact/libtelemetry";
import { tenancy } from "@forwardimpact/libtype";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

function parseArgs(argv) {
  const args = { verifyOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--verify-only") args.verifyOnly = true;
    else if (a === "--repo") args.repo = argv[++i];
    else if (a === "--installation-id") args.installationId = argv[++i];
    else if (a === "--tid") args.tid = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function parseRepo(spec) {
  if (typeof spec !== "string") return undefined;
  const [owner, name] = spec.split("/");
  if (!owner || !name) return undefined;
  return { owner, name };
}

function summarize(label, t) {
  if (!t?.tenant_id) {
    console.log(`  ${label}: <none>`);
    return;
  }
  const repo = t.repo ? `${t.repo.owner}/${t.repo.name}` : "—";
  console.log(
    `  ${label}: id=${t.tenant_id} channel=${t.channel} key=${t.channel_tenant_key} state=${t.state} repo=${repo}`,
  );
}

const args = parseArgs(process.argv.slice(2));

// createServiceConfig loads .env (non-credential keys land in process.env).
// So the fallbacks below see SERVICE_*/MICROSOFT_* values, and you do not
// have to source the file.
const tenancyConfig = await createServiceConfig("tenancy");
const runtime = createDefaultRuntime();
const logger = createLogger("seed-tenancy", runtime);
const { TenancyClient } = clients;
const client = new TenancyClient(tenancyConfig, runtime, logger, null);

const repo = parseRepo(args.repo ?? process.env.SERVICE_MSBRIDGE_GITHUB_REPO);
const installationId =
  args.installationId ??
  process.env.SERVICE_GHSERVER_INSTALLATION_ID ??
  process.env.SERVICE_GHBRIDGE_APP_INSTALLATION_ID;
const tid =
  args.tid ??
  process.env.SEED_ENTRA_TENANT_ID ??
  process.env.MICROSOFT_APP_TENANT_ID;

const missing = [];
if (!repo) missing.push("--repo / SERVICE_MSBRIDGE_GITHUB_REPO (owner/name)");
if (!installationId)
  missing.push(
    "--installation-id / SERVICE_GHSERVER_INSTALLATION_ID / SERVICE_GHBRIDGE_APP_INSTALLATION_ID",
  );
if (!tid)
  missing.push("--tid / SEED_ENTRA_TENANT_ID / MICROSOFT_APP_TENANT_ID");
if (missing.length) {
  console.error("Missing required inputs:\n  - " + missing.join("\n  - "));
  process.exit(2);
}

console.log(
  `tenancy=${tenancyConfig.url ?? "(default)"} repo=${repo.owner}/${repo.name} installation=${installationId} tid=${tid}`,
);

if (!args.verifyOnly) {
  // 1. github-discussions row FIRST. The mint step can parse the installation
  //    id from this key.
  const gh = await client.UpsertByPair(
    new tenancy.UpsertPairRequest({
      installation_id: String(installationId),
      owner: repo.owner,
      name: repo.name,
    }),
  );
  // 2. msteams row, then bind the repo onto it.
  const ms = await client.UpsertByChannelKey(
    new tenancy.UpsertChannelKeyRequest({
      channel: "msteams",
      channel_tenant_key: tid,
      state: "active",
    }),
  );
  await client.SetRepo(
    new tenancy.SetRepoRequest({
      tenant_id: ms.tenant_id,
      repo: new tenancy.Repo({ owner: repo.owner, name: repo.name }),
    }),
  );
  console.log("seeded:");
  summarize("github", gh);
  summarize("msteams", ms);
}

// Read back the exact resolutions the bridges and ghserver perform.
const byChannel = await client.ResolveByChannelKey(
  new tenancy.ChannelTenantKey({ channel: "msteams", key: tid }),
);
const byRepo = await client.ResolveByRepo(
  new tenancy.RepoKey({ owner: repo.owner, name: repo.name }),
);
console.log("resolution check:");
summarize(
  "ResolveByChannelKey(msteams,tid) [msbridge dispatch target]",
  byChannel,
);
summarize("ResolveByRepo(repo)              [ghserver mint source]   ", byRepo);

// ghserver splits channel_tenant_key as "{installation_id}:{owner}/{name}".
// An msteams key (bare Entra tid) would throw INTERNAL at mint time.
const mintable = /^[^:]+:[^/]+\/.+$/.test(byRepo?.channel_tenant_key ?? "");
if (!byChannel?.tenant_id || byChannel.state !== "active") {
  console.error(
    "FAIL: msteams tenant not active. The service will reject the dispatch.",
  );
  process.exit(1);
}
if (!mintable) {
  console.error(
    `FAIL: ResolveByRepo returned key "${byRepo?.channel_tenant_key}" which ghserver cannot split for an installation id. The github-discussions row must win ResolveByRepo.`,
  );
  process.exit(1);
}
console.log("OK: msteams active + ResolveByRepo yields a mintable github row.");
process.exit(0);
