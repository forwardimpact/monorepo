/**
 * Canonical fit-landmark command manifest. The bin imports this and
 * builds its dispatcher COMMANDS map from the same source; the
 * substrate self-smoke imports it directly so its gated-command list
 * cannot drift from the dispatcher.
 *
 * Each entry mirrors today's `COMMANDS` shape. `SUBCOMMAND_EXPANSIONS`
 * and `FLAT_SMOKE_OPTIONS` describe the user-visible subcommand
 * expansions and option placeholders the substrate-stage self-smoke
 * supplies; placeholders are expanded at smoke-runtime against the
 * chosen persona and discovery vector.
 */

import { runOrgCommand } from "../commands/org.js";
import { runSnapshotCommand } from "../commands/snapshot.js";
import { runMarkerCommand } from "../commands/marker.js";
import { runEvidenceCommand } from "../commands/evidence.js";
import { runReadinessCommand } from "../commands/readiness.js";
import { runTimelineCommand } from "../commands/timeline.js";
import { runCoverageCommand } from "../commands/coverage.js";
import { runPracticeCommand } from "../commands/practice.js";
import { runPracticedCommand } from "../commands/practiced.js";
import { runHealthCommand } from "../commands/health.js";
import { runVoiceCommand } from "../commands/voice.js";
import { runSourcesCommand } from "../commands/sources.js";
import { runLoginCommand } from "../commands/login.js";
import { runLogoutCommand } from "../commands/logout.js";

export const COMMANDS = {
  org: { handler: runOrgCommand, needsSupabase: true },
  snapshot: { handler: runSnapshotCommand, needsSupabase: true },
  marker: { handler: runMarkerCommand, needsSupabase: false },
  evidence: { handler: runEvidenceCommand, needsSupabase: true },
  readiness: { handler: runReadinessCommand, needsSupabase: true },
  timeline: { handler: runTimelineCommand, needsSupabase: true },
  coverage: { handler: runCoverageCommand, needsSupabase: true },
  practice: { handler: runPracticeCommand, needsSupabase: true },
  practiced: { handler: runPracticedCommand, needsSupabase: true },
  health: { handler: runHealthCommand, needsSupabase: true },
  voice: { handler: runVoiceCommand, needsSupabase: true },
  sources: { handler: runSourcesCommand, needsSupabase: true },
  login: { handler: runLoginCommand, needsSupabase: false },
  logout: { handler: runLogoutCommand, needsSupabase: false },
};

// User-visible subcommand expansions for top-level COMMANDS keys whose
// libcli `commands` array entries use space-separated names. Each entry
// names the option flags substrate-stage must supply with placeholders
// expanded at smoke-runtime: $PERSONA_EMAIL, $SNAPSHOT_ID, $ITEM_ID.
export const SUBCOMMAND_EXPANSIONS = {
  org: [
    { command: "org show", smokeOptions: {} },
    { command: "org team", smokeOptions: { manager: "$PERSONA_EMAIL" } },
  ],
  snapshot: [
    { command: "snapshot list", smokeOptions: {} },
    { command: "snapshot show", smokeOptions: { snapshot: "$SNAPSHOT_ID" } },
    { command: "snapshot trend", smokeOptions: { item: "$ITEM_ID" } },
    {
      command: "snapshot compare",
      smokeOptions: { snapshot: "$SNAPSHOT_ID" },
    },
  ],
};

// Flat (non-subcommand-style) command options. Every gated command whose
// handler throws on missing args must appear here so the substrate stage
// self-smoke runs to non-error completion.
//   - voice.js: throws if neither --email nor --manager supplied
//   - practiced.js: throws on missing --manager
//   - health.js: no required option
export const FLAT_SMOKE_OPTIONS = {
  evidence: { email: "$PERSONA_EMAIL" },
  practice: { manager: "$PERSONA_EMAIL" },
  practiced: { manager: "$PERSONA_EMAIL" },
  readiness: { email: "$PERSONA_EMAIL" },
  timeline: { email: "$PERSONA_EMAIL" },
  coverage: { email: "$PERSONA_EMAIL" },
  sources: { email: "$PERSONA_EMAIL" },
  voice: { email: "$PERSONA_EMAIL" },
  // health — no required option
};
