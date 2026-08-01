/**
 * Redactor — replaces secrets in JSON-serialisable values before they reach
 * the trace artifact. It composes two layers: an env-var value allowlist and
 * a set of credential-shape regexes. Both run on every primitive string.
 *
 * Coverage includes encoded credential forms as well as raw bytes. The env
 * layer matches each allowlisted secret raw. It also matches the secret in
 * its **standard base64** form at any byte offset within the encoded
 * plaintext. The pattern layer covers the git `extraheader` basic-auth
 * wrapper. Two limits apply. The redactor covers **standard base64 only**,
 * so it does not cover URL-safe base64, hex, or percent-encoding. It also
 * covers the **trace-write sink only**. Content an agent authors into a wiki
 * commit never passes through this redactor.
 *
 * The redactor is stateless after construction. It captures `env` once, so
 * in-process `process.env` writes (e.g. agent-runner.js LIBHARNESS_SKILL,
 * commands/run.js LIBHARNESS_AGENT_PROFILE) cannot smuggle a value past it.
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
// The Anthropic prefix is heuristic. The env-allowlist layer is the primary
// defence for Anthropic keys.
export const DEFAULT_PATTERNS = Object.freeze([
  { kind: "anthropic", regex: /sk-ant-[A-Za-z0-9_-]{80,}/g },
  { kind: "gh-pat", regex: /\bghp_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-installation", regex: /\bghs_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-oauth", regex: /\bgho_[A-Za-z0-9]{36}\b/g },
  { kind: "gh-fine-grained", regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  // git persists HTTP basic-auth credentials base64-encoded in
  // `http.<url>.extraheader` as `AUTHORIZATION: basic <b64>`. There the
  // plaintext is `x-access-token:<token>` (actions/checkout form). The
  // raw-byte layers above cannot see that shape. The plaintext prefix is 15
  // bytes, which is five whole base64 triplets. So every encoded form starts
  // with the same 20 chars, whatever token follows.
  {
    kind: "gh-b64-basic-credential",
    regex: /\beC1hY2Nlc3MtdG9rZW46[A-Za-z0-9+/]{8,}={0,2}/g,
  },
]);

const ENV_PLACEHOLDER = (name) => `[REDACTED:env:${name}]`;
const PATTERN_PLACEHOLDER = (kind) => `[REDACTED:pattern:${kind}]`;

/**
 * The minimum byte length a secret needs before the redactor matches its
 * encoded form. At 9 bytes the shortest offset core is exactly 8 chars.
 * Below 9 bytes it drops under 8 chars. That is too short for a sound needle
 * against ordinary base64 trace content (margin of safety, false positives).
 * Every DEFAULT_ENV_ALLOWLIST value (token, key, password) far exceeds it.
 */
const MIN_ENCODED_SECRET_BYTES = 9;

// The k filler bytes contaminate this many base64 chars at the start, per
// alignment.
const ENCODED_LEAD_STRIP = [0, 2, 3];

/**
 * Return the three standard-base64 core substrings of `secret`, one per byte
 * alignment (k = 0/1/2). Each core is offset-invariant. base64 maps disjoint
 * 3-byte groups to 4 chars independently. So the chars that cover a secret's
 * interior groups depend only on the secret's bytes. They never depend on the
 * bytes around it. Only the partial groups at each edge depend on the
 * neighbours. This function strips those groups. The core that remains
 * appears in the base64 of any plaintext that puts `secret` at that
 * alignment. Padding lives only in the final partial group, and this function
 * strips that group. So each core is padding-free. One needle matches padded
 * and unpadded haystack content. Returns [] below MIN_ENCODED_SECRET_BYTES.
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
 * vars. This function skips empty strings. A leaked empty env var would
 * otherwise make the redactor replace every empty string in the trace.
 * `needles` are the precomputed standard-base64 cores (empty for sub-floor
 * secrets).
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
   * @param {Readonly<Record<string, {secret: string, needles: string[]}>>} deps.envSnapshot - Frozen { name → { secret, needles } } map captured at construction time. `needles` are the precomputed standard-base64 cores of `secret`.
   * @param {ReadonlyArray<{kind: string, regex: RegExp}>} deps.patterns - Credential-shape regexes. Each match becomes `[REDACTED:pattern:KIND]`.
   * @param {boolean} deps.enabled - When false, `redactValue` returns its input by reference.
   */
  constructor({ envSnapshot, patterns, enabled }) {
    this.envSnapshot = envSnapshot;
    this.patterns = patterns;
    this.enabled = enabled;
  }

  /**
   * Redact any JSON-serialisable value. This method deep-walks the value and
   * replaces secrets in every primitive string. When disabled, it returns its
   * input by reference.
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
      // Standard-base64 form at any byte offset. The order among the three
      // needles does not matter. Once a replacement puts the placeholder over
      // a region, those bytes are gone, so a later needle cannot re-match
      // them. The placeholder shares no base64 run with any needle. The floor
      // keeps every needle ≥ 8 chars.
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
 * Build a redactor. It reads `LIBHARNESS_REDACTION_DISABLED` and
 * `LIBHARNESS_REDACTION_ENV_VARS` from the supplied env. An injected
 * `runtime` supplies the env and the stderr sink (`runtime.proc.env` /
 * `runtime.proc.stderr`). When a caller supplies no runtime, the function
 * constructs a default one so current callers keep working. An explicit
 * `opts.env` override still wins for the snapshot. The function fires a
 * one-shot stderr warning when a caller constructs it disabled. Use
 * `createNoopRedactor()` for silent fixtures to bypass that warning.
 * @param {object} [opts]
 * @param {import("@forwardimpact/libutil/runtime").Runtime} [opts.runtime] - Ambient collaborators. The factory uses `proc.env` and `proc.stderr`.
 * @param {Record<string, string|undefined>} [opts.env] - Environment to snapshot. Defaults to `runtime.proc.env`.
 * @param {string[]} [opts.allowlist] - Override the env-var name list. Defaults to `DEFAULT_ENV_ALLOWLIST` or the parsed `LIBHARNESS_REDACTION_ENV_VARS` value.
 * @param {ReadonlyArray<{kind: string, regex: RegExp}>} [opts.patterns] - Credential-shape regexes. Defaults to `DEFAULT_PATTERNS`.
 * @param {boolean} [opts.enabled] - Force enabled or disabled. It bypasses `LIBHARNESS_REDACTION_DISABLED`.
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
      "libharness: trace redaction DISABLED through LIBHARNESS_REDACTION_DISABLED. Secrets may appear in the trace artifact\n",
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
 * Use this form in test fixtures. It bypasses `createRedactor`, so no stderr
 * warning fires whatever the env state.
 * @returns {Redactor}
 */
export function createNoopRedactor() {
  return new Redactor({
    envSnapshot: Object.freeze({}),
    patterns: [],
    enabled: false,
  });
}
