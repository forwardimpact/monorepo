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

// GitHub rejects an issue or comment body over 65536 characters. Keep the whole
// body under a margin below that so the preamble, JSON fence, and truncation
// notice always fit. When the findings overflow, the body carries the first N
// that fit plus a count; the full list stays reproducible via `gemba-wiki audit`.
const MAX_BODY = 65000;

/**
 * Compose the issue body from the audit's JSON findings. The findings ride a
 * fenced ```json block; the body is passed to `gh` via `--body-file` (a temp
 * file), never argv, so untrusted finding text cannot be misread as a flag.
 * @param {string} findingsJson
 * @param {{shown?: number, total?: number}} [trunc]
 * @returns {string}
 */
function buildBody(findingsJson, { shown, total } = {}) {
  const lines = [
    "Scheduled `curate-wiki` audit found shared-wiki violations.",
    "",
    "Owner: **technical-writer** (service these via the curation shift; the per-PR `wiki` gate no longer reads shared wiki state).",
    "",
  ];
  if (total != null && shown != null && shown < total) {
    lines.push(
      `Showing ${shown} of ${total} findings — the body was truncated to fit GitHub's comment limit. Run \`gemba-wiki audit\` for the full list.`,
      "",
    );
  }
  lines.push("```json", findingsJson, "```", "");
  return lines.join("\n");
}

/**
 * Build the largest postable body for the audit findings. The full findings
 * usually fit; when they don't, keep the first N `fail` findings that stay
 * under GitHub's body limit and label the body as truncated. The shrink steps
 * down proportionally to the overflow, so it converges in a couple of passes.
 * @param {{level: string}[]} findings
 * @returns {string}
 */
function fitBody(findings) {
  const total = findings.filter((f) => f.level === "fail").length;
  const full = buildBody(emitFindingsJson(findings), { shown: total, total });
  if (full.length <= MAX_BODY) return full;

  const failures = findings.filter((f) => f.level === "fail");
  let shown = failures.length;
  while (shown > 0) {
    const body = buildBody(emitFindingsJson(failures.slice(0, shown)), {
      shown,
      total,
    });
    if (body.length <= MAX_BODY) return body;
    const next = Math.floor((shown * MAX_BODY) / body.length);
    shown = next < shown ? next : shown - 1;
  }
  return buildBody(emitFindingsJson([]), { shown: 0, total });
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
 * Find the open `wiki-curation` issue by its verbatim title, or null. Any
 * parse failure or empty result is treated as "no issue" (create path).
 * @param {import("@forwardimpact/libcli").InvocationContext["deps"]["runtime"]} runtime
 * @param {string[]} repoArgs
 * @param {{cwd: string, env: object}} opts
 * @returns {Promise<number|null>}
 */
async function findOpenIssue(runtime, repoArgs, opts) {
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
    opts,
  );
  try {
    return JSON.parse(list.stdout || "[]")[0]?.number ?? null;
  } catch {
    return null;
  }
}

/**
 * Route the composed body to the single `wiki-curation` issue: ensure the
 * label, find the open issue by title, then comment on it or create it. The
 * body goes through a temp file (never argv) so untrusted finding text cannot
 * be read as a flag. On a `gh` failure the reason is logged and `ok:false`
 * returned so the caller exits non-zero.
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @param {string} body
 * @param {ReturnType<typeof createLogger>} logger
 * @returns {Promise<{ok: boolean}>}
 */
async function routeFindings(ctx, body, logger) {
  const { runtime, gitClient } = ctx.deps;
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

  const number = await findOpenIssue(runtime, repoArgs, { cwd, env });

  // Pass the body through a temp file, not argv — robust to length and immune
  // to finding text being read as a flag.
  const tmp = runtime.proc.env.RUNNER_TEMP || runtime.proc.env.TMPDIR || "/tmp";
  const bodyFile = path.join(tmp, "wiki-curation-body.md");
  runtime.fsSync.writeFileSync(bodyFile, body);

  const args = number
    ? ["issue", "comment", String(number), "--body-file", bodyFile, ...repoArgs]
    : [
        "issue",
        "create",
        "--title",
        TITLE,
        "--body-file",
        bodyFile,
        "--label",
        LABEL.name,
        ...repoArgs,
      ];
  const result = await runtime.subprocess.run("gh", args, { cwd, env });

  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    const action = number ? "comment" : "create";
    logger.warn(
      "curate",
      `gh issue ${action} failed${detail ? `: ${detail}` : ""}`,
    );
    return { ok: false };
  }
  runtime.proc.stdout.write(
    number
      ? `Commented curation findings on issue #${number}\n`
      : "Opened a new wiki-curation issue\n",
  );
  return { ok: true };
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
  const { runtime } = ctx.deps;
  const logger = createLogger("wiki", runtime);
  const { findings } = auditWiki(ctx);

  if (!findings.some((f) => f.level === "fail")) {
    runtime.proc.stdout.write("wiki audit clean — no curation issue routed\n");
    return { ok: true };
  }

  const body = fitBody(findings);

  if (ctx.options["dry-run"]) {
    runtime.proc.stdout.write(
      `[dry-run] would route findings to issue "${TITLE}":\n\n${body}`,
    );
    return { ok: true };
  }

  return routeFindings(ctx, body, logger);
}
