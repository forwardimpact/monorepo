/**
 * Redactor — replaces secrets in JSON-serialisable values before they reach
 * the trace artifact. Composes two layers: an env-var value allowlist and a
 * set of credential-shape regexes. Both run on every primitive string.
 *
 * Coverage includes encoded credential forms, not only raw bytes: the env
 * layer matches each allowlisted secret both raw and in its **standard
 * base64** form at any byte offset within the encoded plaintext, and the
 * pattern layer covers the git `extraheader` basic-auth wrapper. Boundary:
 * **standard base64 only** — URL-safe base64, hex, and percent-encoding are
 * not covered — and the **trace-write sink only**; content an agent authors
 * into a wiki commit is never passed through this redactor.
 *
 * Stateless after construction: `env` is captured once so in-process
 * `process.env` writes (e.g. agent-runner.js LIBHARNESS_SKILL, commands/run.js
 * LIBHARNESS_AGENT_PROFILE) cannot smuggle a value past the redactor.
 */

export const DEFAULT_ENV_ALLOWLIST = Object.freeze([
  "ANTHROPIC_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "DATABASE_PASSWORD",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "JWT_SECRET",
  "MCP_TOKEN",
  "MICROSOFT_APP_ID",
  "MICROSOFT_APP_PASSWORD",
  "MICROSOFT_APP_TENANT_ID",
  "PRODUCT_LANDMARK_TOKEN",
  "SERVICE_SECRET",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

// Anchored prefixes per
// https://github.blog/security/application-security/behind-githubs-new-authentication-token-formats/
// Anthropic prefix is heuristic — the env-allowlist layer is the primary
// defence for Anthropic keys.
export const DEFAULT_PATTERNS = Object.freeze([
  { kind: "anthropic", regex: /sk-ant-[A-Za-z0-9_-]{80,}/g },
  { kind: "gh-pat", regex: /\bghp_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-installation", regex: /\bghs_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-oauth", regex: /\bgho_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-fine-grained", regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  // git persists HTTP basic-auth credentials base64-encoded in
  // `http.<url>.extraheader` as `AUTHORIZATION: basic <b64>` where the
  // plaintext is `x-access-token:<token>` (actions/checkout form) — a shape
  // the raw-byte layers above cannot see. The plaintext prefix is 15 bytes
  // — five whole base64 triplets — so every encoding starts with the same
  // 20 chars no matter which token follows.
  {
    kind: "gh-b64-basic-credential",
    regex: /\beC1hY2Nlc3MtdG9rZW46[A-Za-z0-9+/]{8,}={0,2}/g,
  },
]);

const ENV_PLACEHOLDER = (name) => `[REDACTED:env:${name}]`;
const PATTERN_PLACEHOLDER = (kind) => `[REDACTED:pattern:${kind}]`;

/**
 * Minimum secret byte length for encoded-form matching. At 9 bytes the
 * shortest offset core is exactly 8 chars; below 9 it drops under 8 — too
 * short to be a sound needle against ordinary base64 trace content (margin of
 * safety, false positives). Every DEFAULT_ENV_ALLOWLIST value (token, key,
 * password) far exceeds it.
 */
const MIN_ENCODED_SECRET_BYTES = 9;

// Leading base64 chars contaminated by the k filler bytes, per alignment.
const ENCODED_LEAD_STRIP = [0, 2, 3];

/**
 * The three offset-invariant standard-base64 core substrings of `secret`, one
 * per byte alignment (k = 0/1/2). base64 maps disjoint 3-byte groups to 4 chars
 * independently, so the chars covering a secret's interior groups depend only
 * on the secret's bytes — never on the bytes surrounding it. Only the partial
 * groups at each edge are neighbour-dependent; stripping them leaves a core
 * that appears in the base64 of any plaintext placing `secret` at that
 * alignment. Padding lives only in the final partial group, which is stripped,
 * so each core is padding-free and one needle matches padded and unpadded
 * haystack content. Returns [] below MIN_ENCODED_SECRET_BYTES.
 * @param {string} secret
 * @returns {string[]}
 */
function encodedNeedles(secret) {
  if (Buffer.byteLength(secret, "utf8") < MIN_ENCODED_SECRET_BYTES) return [];
  const needles = [];
  for (let k = 0; k < 3; k++) {
    const enc = Buffer.from("\0".repeat(k) + secret, "utf8")
      .toString("base64")
      .replace(/=+$/, "");
    needles.push(enc.slice(ENCODED_LEAD_STRIP[k], enc.length - 4));
  }
  return needles;
}

/**
 * Build a frozen { name → { secret, needles } } snapshot of the requested env
 * vars. Empty strings are skipped — a leaked empty env var would otherwise
 * cause every empty string in the trace to be replaced. `needles` are the
 * precomputed standard-base64 cores (empty for sub-floor secrets).
 */
function snapshotEnv(env, allowlist) {
  const snap = {};
  for (const name of allowlist) {
    const v = env[name];
    if (typeof v === "string" && v.length > 0) {
      snap[name] = { secret: v, needles: encodedNeedles(v) };
    }
  }
  return Object.freeze(snap);
}

/** Recursively walk and redact a JSON-serialisable value in place-free style. */
function walk(value, redactString) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, redactString));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = walk(value[k], redactString);
    return out;
  }
  return value;
}

/** Stateless secret redactor — composes env-allowlist and pattern layers. */
export class Redactor {
  /**
   * @param {object} deps
   * @param {Readonly<Record<string, {secret: string, needles: string[]}>>} deps.envSnapshot - Frozen { name → { secret, needles } } map captured at construction time; `needles` are the precomputed standard-base64 cores of `secret`.
   * @param {ReadonlyArray<{kind: string, regex: RegExp}>} deps.patterns - Credential-shape regexes; each match becomes `[REDACTED:pattern:KIND]`.
   * @param {boolean} deps.enabled - When false, `redactValue` returns its input by reference.
   */
  constructor({ envSnapshot, patterns, enabled }) {
    this.envSnapshot = envSnapshot;
    this.patterns = patterns;
    this.enabled = enabled;
  }

  /**
   * Redact any JSON-serialisable value by deep-walking and replacing secrets
   * in every primitive string. Identity on the input when disabled.
   * @param {unknown} value
   * @returns {unknown}
   */
  redactValue(value) {
    if (!this.enabled) return value;
    return walk(value, (s) => this.#redactString(s));
  }

  /**
   * Apply the env-allowlist and pattern layers to a single string.
   * @param {string} s
   * @returns {string}
   */
  #redactString(s) {
    let out = s;
    for (const [name, { secret, needles }] of Object.entries(
      this.envSnapshot,
    )) {
      if (out.includes(secret)) {
        out = out.split(secret).join(ENV_PLACEHOLDER(name));
      }
      // Standard-base64 form at any byte offset. Order among the three needles
      // is irrelevant: once a region is replaced by the placeholder (which
      // shares no base64 run with any needle) those bytes are gone, so a later
      // needle cannot re-match them. The floor keeps every needle ≥ 8 chars.
      for (const needle of needles) {
        if (out.includes(needle)) {
          out = out.split(needle).join(ENV_PLACEHOLDER(name));
        }
      }
    }
    for (const { kind, regex } of this.patterns) {
      out = out.replace(regex, PATTERN_PLACEHOLDER(kind));
    }
    return out;
  }
}

/**
 * Build a redactor. Reads `LIBHARNESS_REDACTION_DISABLED` and
 * `LIBHARNESS_REDACTION_ENV_VARS` from the supplied env. The env and the stderr
 * sink are sourced from an injected `runtime` (`runtime.proc.env` /
 * `runtime.proc.stderr`); when no runtime is supplied a default one is
 * constructed so existing callers keep working. An explicit `opts.env`
 * override still wins for the snapshot. Fires a one-shot stderr warning when
 * constructed disabled — bypass via `createNoopRedactor()` for silent
 * fixtures.
 * @param {object} [opts]
 * @param {import("@forwardimpact/libutil/runtime").Runtime} [opts.runtime] - Ambient collaborators; `proc.env`/`proc.stderr` are used.
 * @param {Record<string, string|undefined>} [opts.env] - Environment to snapshot. Defaults to `runtime.proc.env`.
 * @param {string[]} [opts.allowlist] - Override the env-var name list. Defaults to `DEFAULT_ENV_ALLOWLIST` or the parsed `LIBHARNESS_REDACTION_ENV_VARS` value.
 * @param {ReadonlyArray<{kind: string, regex: RegExp}>} [opts.patterns] - Credential-shape regexes. Defaults to `DEFAULT_PATTERNS`.
 * @param {boolean} [opts.enabled] - Force enabled/disabled; bypasses `LIBHARNESS_REDACTION_DISABLED`.
 * @returns {Redactor}
 */
export function createRedactor({
  runtime,
  env,
  allowlist,
  patterns = DEFAULT_PATTERNS,
  enabled,
} = {}) {
  if (!runtime) throw new Error("runtime is required");
  const proc = runtime.proc;
  const resolvedEnv = env ?? proc.env;
  const envDisabled = resolvedEnv.LIBHARNESS_REDACTION_DISABLED === "1";
  const resolvedEnabled = enabled ?? !envDisabled;
  const resolvedAllowlist = allowlist ?? resolveAllowlistFromEnv(resolvedEnv);
  const envSnapshot = resolvedEnabled
    ? snapshotEnv(resolvedEnv, resolvedAllowlist)
    : Object.freeze({});
  if (!resolvedEnabled) {
    proc.stderr.write(
      "libharness: trace redaction DISABLED via LIBHARNESS_REDACTION_DISABLED — secrets may appear in trace artifact\n",
    );
  }
  return new Redactor({ envSnapshot, patterns, enabled: resolvedEnabled });
}

/**
 * Parse `LIBHARNESS_REDACTION_ENV_VARS` into a trimmed, non-empty name list.
 * Falls back to `DEFAULT_ENV_ALLOWLIST` when unset or empty.
 * @param {Record<string, string|undefined>} env
 * @returns {string[]}
 */
function resolveAllowlistFromEnv(env) {
  const override = env.LIBHARNESS_REDACTION_ENV_VARS;
  if (typeof override !== "string" || override.length === 0) {
    return DEFAULT_ENV_ALLOWLIST;
  }
  return override
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a disabled redactor whose `redactValue` is the identity function.
 * Test-fixture form — bypasses `createRedactor` so no stderr warning
 * fires regardless of env state.
 * @returns {Redactor}
 */
export function createNoopRedactor() {
  return new Redactor({
    envSnapshot: Object.freeze({}),
    patterns: [],
    enabled: false,
  });
}
