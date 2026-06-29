import path from "node:path";
import { emitFindingsJson } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { parseRepoSlug } from "../issue-list-renderer.js";
import { resolveProjectRoot } from "../util/wiki-dir.js";
import { auditWiki } from "./audit.js";

// The routing contract: a single open issue, addressed to the technical-writer,
// holding the audit findings. The title is matched verbatim on every run so a
// dirty wiki appends to one issue rather than opening a new one each day.
const LABEL = {
  name: "wiki-curation",
  color: "BFD4F2",
  description: "Shared-wiki audit findings from scheduled curation",
};
const TITLE = "Wiki curation: shared-state audit findings";

/**
 * Compose the issue body from the audit's JSON findings. The findings ride a
 * fenced ```json block; the body is passed to `gh` via `--body-file` (a temp
 * file), never argv, so untrusted finding text cannot be misread as a flag.
 * @param {string} findingsJson
 * @returns {string}
 */
function buildBody(findingsJson) {
  return [
    "Scheduled `curate-wiki` audit found shared-wiki violations.",
    "",
    "Owner: **technical-writer** (service these via the curation shift; the per-PR `wiki` gate no longer reads shared wiki state).",
    "",
    "```json",
    findingsJson,
    "```",
    "",
  ].join("\n");
}

// Resolve the monorepo's `owner/repo` slug the way refresh.js/product-mix.js
// do: an explicit FIT_GH_REPO override (sandbox proxy URLs), else the origin
// remote parsed via the injected git client. Null lets `gh` fall back to its
// own cwd resolution.
async function deriveRepo(gitClient, cwd, env) {
  if (env.FIT_GH_REPO) return env.FIT_GH_REPO;
  if (!gitClient) return null;
  try {
    return parseRepoSlug(await gitClient.remoteGetUrl("origin", { cwd }));
  } catch {
    return null;
  }
}

// A missing token is non-fatal: `gh` may still resolve ambient auth.
async function resolveToken() {
  try {
    return (await createScriptConfig("wiki")).ghToken();
  } catch {
    return null;
  }
}

/**
 * Audit the shared wiki and, when it is dirty, route the findings to the
 * single `wiki-curation` issue (create or comment) addressed to the
 * technical-writer. This is the SOLE home of the shared-wiki audit verdict; the
 * per-PR `wiki` gate no longer reads live wiki state. A clean wiki routes
 * nothing. The label/search/create-or-comment logic lives here, not in the
 * workflow, so the curation step is one CLI call.
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: boolean}>}
 */
export async function runCurateCommand(ctx) {
  const { runtime, gitClient } = ctx.deps;
  const logger = createLogger("wiki", runtime);
  const { findings } = auditWiki(ctx);

  if (!findings.some((f) => f.level === "fail")) {
    runtime.proc.stdout.write("wiki audit clean — no curation issue routed\n");
    return { ok: true };
  }

  const body = buildBody(emitFindingsJson(findings));

  if (ctx.options["dry-run"]) {
    runtime.proc.stdout.write(
      `[dry-run] would route findings to issue "${TITLE}":\n\n${body}`,
    );
    return { ok: true };
  }

  const cwd = resolveProjectRoot(runtime);
  const repo =
    ctx.options.repo || (await deriveRepo(gitClient, cwd, runtime.proc.env));
  const token = await resolveToken();
  const env = token
    ? { ...runtime.proc.env, GH_TOKEN: token }
    : runtime.proc.env;
  const repoArgs = repo ? ["--repo", repo] : [];

  // Ensure the label exists; a re-create on an existing label exits non-zero,
  // which is expected and ignored.
  await runtime.subprocess.run(
    "gh",
    [
      "label",
      "create",
      LABEL.name,
      "--color",
      LABEL.color,
      "--description",
      LABEL.description,
      ...repoArgs,
    ],
    { cwd, env },
  );

  const list = await runtime.subprocess.run(
    "gh",
    [
      "issue",
      "list",
      "--search",
      `${TITLE} in:title`,
      "--state",
      "open",
      "--json",
      "number",
      ...repoArgs,
    ],
    { cwd, env },
  );
  let number = null;
  try {
    number = JSON.parse(list.stdout || "[]")[0]?.number ?? null;
  } catch {
    number = null;
  }

  // Pass the body through a temp file, not argv — robust to length and immune
  // to finding text being read as a flag.
  const tmp = runtime.proc.env.RUNNER_TEMP || runtime.proc.env.TMPDIR || "/tmp";
  const bodyFile = path.join(tmp, "wiki-curation-body.md");
  runtime.fsSync.writeFileSync(bodyFile, body);

  const result = number
    ? await runtime.subprocess.run(
        "gh",
        [
          "issue",
          "comment",
          String(number),
          "--body-file",
          bodyFile,
          ...repoArgs,
        ],
        { cwd, env },
      )
    : await runtime.subprocess.run(
        "gh",
        [
          "issue",
          "create",
          "--title",
          TITLE,
          "--body-file",
          bodyFile,
          "--label",
          LABEL.name,
          ...repoArgs,
        ],
        { cwd, env },
      );

  if (result.exitCode !== 0) {
    logger.warn("curate", `gh issue ${number ? "comment" : "create"} failed`);
    return { ok: false };
  }
  runtime.proc.stdout.write(
    number
      ? `Commented curation findings on issue #${number}\n`
      : "Opened a new wiki-curation issue\n",
  );
  return { ok: true };
}
