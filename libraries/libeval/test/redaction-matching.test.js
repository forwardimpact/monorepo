import { describe, test } from "node:test";
import assert from "node:assert";

import { createRedactor, DEFAULT_ENV_ALLOWLIST } from "../src/redaction.js";
import { rt as _rt, assertJsonStableSentinel } from "./redaction-helpers.js";

/** Standard base64 of a UTF-8 string. */
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
/** Strip trailing `=` padding to get the unpadded standard-base64 variant. */
const unpad = (s) => s.replace(/=+$/, "");
/**
 * The offset-invariant base64 core of `secret` at byte alignment k (0/1/2),
 * mirroring the production recipe — the substring that actually carries the
 * secret's interior bytes when it sits at alignment k inside a larger
 * plaintext. Asserting this is absent after redaction is the load-bearing
 * non-recoverability check (a bare-encoding slice is absent at non-zero
 * alignments anyway and would pass vacuously).
 */
const offsetCore = (secret, k) => {
  const enc = b64("\0".repeat(k) + secret).replace(/=+$/, "");
  return enc.slice([0, 2, 3][k], enc.length - 4);
};

describe("Redactor — env-var allowlist (criterion 1)", () => {
  test("replaces sentinels with [REDACTED:env:NAME] across deep-walked carrier shapes", () => {
    const ANTHROPIC = "ANTHROPIC_SENTINEL_VALUE";
    const AWS_KEY = "AWS_ACCESS_KEY_SENTINEL_VALUE";
    const AWS_SECRET = "AWS_SECRET_KEY_SENTINEL_VALUE";
    const DB_PASS = "DATABASE_PASSWORD_SENTINEL_VALUE";
    const GH = "GH_TOKEN_SENTINEL_VALUE";
    const GITHUB = "GITHUB_TOKEN_SENTINEL_VALUE";
    const MCP = "MCP_TOKEN_SENTINEL_VALUE";
    const MS_PASS = "MS_APP_PASSWORD_SENTINEL_VALUE";
    const LANDMARK = "LANDMARK_TOKEN_SENTINEL_VALUE";
    const SVC = "SERVICE_SECRET_SENTINEL_VALUE";
    const SB_ANON = "SUPABASE_ANON_SENTINEL_VALUE";
    const SB_JWT = "SUPABASE_JWT_SENTINEL_VALUE";
    const SB_ROLE = "SUPABASE_ROLE_SENTINEL_VALUE";
    for (const s of [
      ANTHROPIC,
      AWS_KEY,
      AWS_SECRET,
      DB_PASS,
      GH,
      GITHUB,
      MCP,
      MS_PASS,
      LANDMARK,
      SVC,
      SB_ANON,
      SB_JWT,
      SB_ROLE,
    ]) {
      assertJsonStableSentinel(s);
    }

    const r = createRedactor({
      runtime: _rt,
      env: {
        ANTHROPIC_API_KEY: ANTHROPIC,
        AWS_ACCESS_KEY_ID: AWS_KEY,
        AWS_SECRET_ACCESS_KEY: AWS_SECRET,
        DATABASE_PASSWORD: DB_PASS,
        GH_TOKEN: GH,
        GITHUB_TOKEN: GITHUB,
        MCP_TOKEN: MCP,
        MICROSOFT_APP_PASSWORD: MS_PASS,
        PRODUCT_LANDMARK_TOKEN: LANDMARK,
        SERVICE_SECRET: SVC,
        SUPABASE_ANON_KEY: SB_ANON,
        JWT_SECRET: SB_JWT,
        SUPABASE_SERVICE_ROLE_KEY: SB_ROLE,
      },
    });

    const fixture = {
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: {
              command: `echo ${ANTHROPIC}`,
              description: "leak attempt",
            },
          },
          {
            type: "tool_result",
            content: `stdout: token=${GH}`,
          },
          { type: "text", text: `Leaked GITHUB=${GITHUB}` },
        ],
      },
      session: {
        nested: [
          { payload: `combo ${ANTHROPIC} and ${GH}` },
          [`array slot ${GITHUB}`],
        ],
      },
      credentials: {
        awsKey: AWS_KEY,
        awsSecret: AWS_SECRET,
        dbPass: DB_PASS,
        mcp: MCP,
        msPassword: MS_PASS,
        landmark: LANDMARK,
        svc: SVC,
        sbAnon: SB_ANON,
        sbJwt: SB_JWT,
        sbRole: SB_ROLE,
      },
      summary: `wrap-up ${ANTHROPIC}`,
    };

    const out = JSON.stringify(r.redactValue(fixture));
    assert.ok(!out.includes(ANTHROPIC), "ANTHROPIC sentinel leaked");
    assert.ok(!out.includes(AWS_KEY), "AWS_ACCESS_KEY_ID sentinel leaked");
    assert.ok(
      !out.includes(AWS_SECRET),
      "AWS_SECRET_ACCESS_KEY sentinel leaked",
    );
    assert.ok(!out.includes(DB_PASS), "DATABASE_PASSWORD sentinel leaked");
    assert.ok(!out.includes(GH), "GH sentinel leaked");
    assert.ok(!out.includes(GITHUB), "GITHUB sentinel leaked");
    assert.ok(!out.includes(MCP), "MCP_TOKEN sentinel leaked");
    assert.ok(!out.includes(MS_PASS), "MICROSOFT_APP_PASSWORD sentinel leaked");
    assert.ok(
      !out.includes(LANDMARK),
      "PRODUCT_LANDMARK_TOKEN sentinel leaked",
    );
    assert.ok(!out.includes(SVC), "SERVICE_SECRET sentinel leaked");
    assert.ok(!out.includes(SB_ANON), "SUPABASE_ANON_KEY sentinel leaked");
    assert.ok(!out.includes(SB_JWT), "JWT_SECRET sentinel leaked");
    assert.ok(
      !out.includes(SB_ROLE),
      "SUPABASE_SERVICE_ROLE_KEY sentinel leaked",
    );
    assert.ok(out.includes("[REDACTED:env:ANTHROPIC_API_KEY]"));
    assert.ok(out.includes("[REDACTED:env:AWS_ACCESS_KEY_ID]"));
    assert.ok(out.includes("[REDACTED:env:AWS_SECRET_ACCESS_KEY]"));
    assert.ok(out.includes("[REDACTED:env:DATABASE_PASSWORD]"));
    assert.ok(out.includes("[REDACTED:env:GH_TOKEN]"));
    assert.ok(out.includes("[REDACTED:env:GITHUB_TOKEN]"));
    assert.ok(out.includes("[REDACTED:env:MCP_TOKEN]"));
    assert.ok(out.includes("[REDACTED:env:MICROSOFT_APP_PASSWORD]"));
    assert.ok(out.includes("[REDACTED:env:PRODUCT_LANDMARK_TOKEN]"));
    assert.ok(out.includes("[REDACTED:env:SERVICE_SECRET]"));
    assert.ok(out.includes("[REDACTED:env:SUPABASE_ANON_KEY]"));
    assert.ok(out.includes("[REDACTED:env:JWT_SECRET]"));
    assert.ok(out.includes("[REDACTED:env:SUPABASE_SERVICE_ROLE_KEY]"));
  });

  test("multiple occurrences of the same sentinel in a single string all redacted", () => {
    const SENT = "MULTI_HIT_SENTINEL";
    const r = createRedactor({ runtime: _rt, env: { GH_TOKEN: SENT } });
    const out = r.redactValue(`${SENT} and ${SENT} again ${SENT}`);
    assert.strictEqual(
      out,
      "[REDACTED:env:GH_TOKEN] and [REDACTED:env:GH_TOKEN] again [REDACTED:env:GH_TOKEN]",
    );
  });

  test("empty-string env values do not poison redaction", () => {
    const r = createRedactor({
      runtime: _rt,
      env: { GH_TOKEN: "", GITHUB_TOKEN: "", ANTHROPIC_API_KEY: "" },
    });
    // Empty string input must come through identically; redactor must
    // not turn every empty string into a placeholder.
    assert.strictEqual(r.redactValue(""), "");
    assert.strictEqual(r.redactValue("hello"), "hello");
    const obj = { a: "", b: "x" };
    const out = r.redactValue(obj);
    assert.deepStrictEqual(out, { a: "", b: "x" });
  });

  test("LIBEVAL_REDACTION_ENV_VARS replaces (not extends) the default allowlist", () => {
    const r = createRedactor({
      runtime: _rt,
      env: {
        LIBEVAL_REDACTION_ENV_VARS: "FOO,BAR",
        FOO: "foo-secret",
        BAR: "bar-secret",
        ANTHROPIC_API_KEY: "anth-secret",
      },
    });
    assert.strictEqual(r.redactValue("foo-secret"), "[REDACTED:env:FOO]");
    assert.strictEqual(r.redactValue("bar-secret"), "[REDACTED:env:BAR]");
    // Default name not in override is NOT redacted via env layer.
    assert.strictEqual(r.redactValue("anth-secret"), "anth-secret");
  });

  test("LIBEVAL_REDACTION_ENV_VARS trims whitespace and ignores empty entries", () => {
    const r = createRedactor({
      runtime: _rt,
      env: {
        LIBEVAL_REDACTION_ENV_VARS: "  FOO , , BAR  ",
        FOO: "foo-secret",
        BAR: "bar-secret",
      },
    });
    assert.strictEqual(r.redactValue("foo-secret"), "[REDACTED:env:FOO]");
    assert.strictEqual(r.redactValue("bar-secret"), "[REDACTED:env:BAR]");
  });
});

describe("Redactor — credential patterns (criterion 2)", () => {
  test("each default pattern at canonical length yields [REDACTED:pattern:KIND]", () => {
    const r = createRedactor({ runtime: _rt, env: {} });

    // Anthropic prefix + 80 url-safe chars.
    const anth = "sk-ant-" + "a".repeat(80);
    assert.strictEqual(r.redactValue(anth), "[REDACTED:pattern:anthropic]");

    // gh-pat: ghp_ + exactly 36 word chars.
    const ghp = "ghp_" + "A".repeat(36);
    assert.strictEqual(r.redactValue(ghp), "[REDACTED:pattern:gh-pat]");

    // gh-installation: ghs_ + 36.
    const ghs = "ghs_" + "B".repeat(36);
    assert.strictEqual(
      r.redactValue(ghs),
      "[REDACTED:pattern:gh-installation]",
    );

    // gh-oauth: gho_ + 36.
    const gho = "gho_" + "C".repeat(36);
    assert.strictEqual(r.redactValue(gho), "[REDACTED:pattern:gh-oauth]");

    // gh-fine-grained: github_pat_ + 82 [A-Za-z0-9_].
    const ghfg = "github_pat_" + "x".repeat(82);
    assert.strictEqual(
      r.redactValue(ghfg),
      "[REDACTED:pattern:gh-fine-grained]",
    );
  });

  test("base64 x-access-token extraheader credential redacted across padding variants", () => {
    const r = createRedactor({ runtime: _rt, env: {} });
    // Token lengths chosen so the encoded blob ends with "==", "=", and
    // no padding respectively.
    for (const len of [36, 37, 38]) {
      const blob = Buffer.from(
        `x-access-token:ghs_${"B".repeat(len)}`,
      ).toString("base64");
      const out = r.redactValue(`AUTHORIZATION: basic ${blob}`);
      assert.ok(
        !out.includes(blob),
        `b64 credential leaked at token length ${len}`,
      );
      assert.strictEqual(
        out,
        "AUTHORIZATION: basic [REDACTED:pattern:gh-b64-basic-credential]",
      );
    }
  });

  test("bare base64 credential blob (no AUTHORIZATION header) redacted", () => {
    const r = createRedactor({ runtime: _rt, env: {} });
    const blob = Buffer.from(`x-access-token:ghs_${"C".repeat(36)}`).toString(
      "base64",
    );
    const out = r.redactValue(
      `http.https://github.com/.extraheader ${blob}\norigin url`,
    );
    assert.ok(!out.includes(blob));
    assert.ok(out.includes("[REDACTED:pattern:gh-b64-basic-credential]"));
  });

  test("b64 prefix without a credential payload is left unchanged", () => {
    const r = createRedactor({ runtime: _rt, env: {} });
    // The fixed 20-char prefix alone (e.g. quoted in a finding or doc)
    // carries no secret and must not match.
    const prose = "fingerprint prefix eC1hY2Nlc3MtdG9rZW46 decodes to it";
    assert.strictEqual(r.redactValue(prose), prose);
  });

  test("anthropic pattern hit inside tool_result.content JSON-string", () => {
    const r = createRedactor({ runtime: _rt, env: {} });
    const anth = "sk-ant-" + "z".repeat(95);
    const message = {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            content: JSON.stringify({ stdout: `KEY=${anth}\n` }),
          },
        ],
      },
    };
    const out = JSON.stringify(r.redactValue(message));
    assert.ok(!out.includes(anth));
    assert.ok(out.includes("[REDACTED:pattern:anthropic]"));
  });
});

describe("Redactor — env-allowlist encoded forms (criterion 2)", () => {
  // criterion 2: the standard base64 of any env-allowlisted secret, at any
  // byte offset within the encoded plaintext, padded and unpadded.
  for (const name of DEFAULT_ENV_ALLOWLIST) {
    // Synthetic, credential-length value derived from the name — never the
    // captured fixture's bytes (spec anti-fixture requirement).
    const value = `${name}-0123456789abcdef0123456789abcdef`;

    test(`${name}: bare base64 redacted (padded + unpadded)`, () => {
      const r = createRedactor({ runtime: _rt, env: { [name]: value } });
      for (const blob of [b64(value), unpad(b64(value))]) {
        const out = r.redactValue(`prefix ${blob} suffix`);
        assert.ok(!out.includes(blob), `bare b64 leaked for ${name}`);
        assert.ok(out.includes(`[REDACTED:env:${name}]`));
      }
    });

    test(`${name}: embedded at all three byte offsets redacted (padded + unpadded)`, () => {
      const r = createRedactor({ runtime: _rt, env: { [name]: value } });
      // Usernames of length 0/1/2 mod 3 put the secret at each alignment;
      // a trailing run forces a non-trivial suffix group.
      for (const user of ["", "u", "me"]) {
        const prefix = `${user}:`;
        const k = Buffer.byteLength(prefix, "utf8") % 3;
        const core = offsetCore(value, k);
        const plaintext = `${prefix}${value}:trailing-data`;
        for (const blob of [b64(plaintext), unpad(b64(plaintext))]) {
          // Sanity: the alignment-k core is genuinely present in the blob,
          // so the post-redaction absence check below is non-vacuous.
          assert.ok(
            blob.includes(core),
            `test bug: core absent from blob for ${name} user="${user}"`,
          );
          const out = r.redactValue(blob);
          assert.ok(
            !out.includes(core),
            `embedded b64 secret recoverable for ${name} user="${user}"`,
          );
          assert.ok(
            out.includes(`[REDACTED:env:${name}]`),
            `no placeholder for ${name} user="${user}"`,
          );
        }
      }
    });
  }

  test("criterion 1 — extraheader basic-auth via env layer (all alignments)", () => {
    const token = `ghs_${"D".repeat(36)}`;
    const r = createRedactor({ runtime: _rt, env: { GITHUB_TOKEN: token } });
    // x-access-token: is 15 bytes (0 mod 3) → token at k=0; user:/me: shift it.
    for (const prefix of ["x-access-token:", "user:", "me:"]) {
      const k = Buffer.byteLength(prefix, "utf8") % 3;
      const core = offsetCore(token, k);
      const blob = b64(`${prefix}${token}`);
      assert.ok(blob.includes(core), `test bug: core absent for "${prefix}"`);
      const out = r.redactValue(`AUTHORIZATION: basic ${blob}`);
      assert.ok(
        !out.includes(core),
        `extraheader token recoverable for prefix "${prefix}"`,
      );
      assert.ok(out.includes("[REDACTED:env:GITHUB_TOKEN]"));
    }
  });

  test("criterion 4 — reconstructed run 27288359408 leak shape fully redacted", () => {
    // Synthetic token (the literal leaked bytes were never recorded).
    const token = `ghs_${"E".repeat(36)}`;
    const blob = b64(`x-access-token:${token}`);
    const r = createRedactor({ runtime: _rt, env: { GITHUB_TOKEN: token } });
    const event = {
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            content: JSON.stringify({
              stdout: `http.https://github.com/.extraheader AUTHORIZATION: basic ${blob}\n`,
            }),
          },
        ],
      },
    };
    const out = JSON.stringify(r.redactValue(event));
    assert.ok(!out.includes(blob), "leaked extraheader blob survived");
    // x-access-token: is 15 bytes (0 mod 3) → the token sits at alignment 0.
    assert.ok(!out.includes(offsetCore(token, 0)), "token core survived");
    assert.ok(out.includes("[REDACTED:env:GITHUB_TOKEN]"));
  });

  test("criterion 5 — benign base64 carrying no secret is unchanged", () => {
    // Empty allowlist: ordinary base64 content must round-trip.
    const r0 = createRedactor({ runtime: _rt, env: {} });
    const fileBlob = b64(
      "The quick brown fox jumps over the lazy dog. ".repeat(8),
    );
    const toolOut = b64(JSON.stringify({ files: ["a.js", "b.js"], count: 2 }));
    for (const content of [fileBlob, toolOut]) {
      assert.strictEqual(r0.redactValue(content), content);
    }
    // Populated allowlist whose secrets do not appear: still unchanged.
    const r1 = createRedactor({
      runtime: _rt,
      env: {
        GITHUB_TOKEN: `ghs_${"F".repeat(36)}`,
        ANTHROPIC_API_KEY: "anth-secret-value-123",
      },
    });
    assert.strictEqual(r1.redactValue(fileBlob), fileBlob);
    assert.strictEqual(r1.redactValue(toolOut), toolOut);
  });

  test("short secret (below floor) is not matched in encoded form", () => {
    // An 8-byte secret is below MIN_ENCODED_SECRET_BYTES (9): no encoded
    // needle is generated, so its base64 passes the env layer untouched.
    const short = "abcdefgh";
    const r = createRedactor({ runtime: _rt, env: { GH_TOKEN: short } });
    const blob = b64(`x:${short}:y`);
    assert.strictEqual(r.redactValue(blob), blob);
    // Raw form still redacts.
    assert.strictEqual(r.redactValue(short), "[REDACTED:env:GH_TOKEN]");
  });
});

describe("Redactor — word boundary adversarial cases (Risks table)", () => {
  const r = createRedactor({ runtime: _rt, env: {} });
  const body = "A".repeat(36);
  const token = `ghp_${body}`;

  test("'-ghp_<36>' matches (\\b between '-' and 'g')", () => {
    const out = r.redactValue(`prefix-${token} trailing`);
    assert.ok(out.includes("[REDACTED:pattern:gh-pat]"));
    assert.ok(!out.includes(token));
  });

  test("'_ghp_<36>' does NOT match (no \\b between '_' and 'g')", () => {
    const out = r.redactValue(`under_${token} trailing`);
    assert.strictEqual(out, `under_${token} trailing`);
  });

  test("'.ghp_<36>' matches", () => {
    const out = r.redactValue(`x.${token}`);
    assert.ok(out.includes("[REDACTED:pattern:gh-pat]"));
  });

  test("ghp_<36> followed by ',' / ';' / '\\n' matches", () => {
    for (const sep of [",", ";", "\n"]) {
      const out = r.redactValue(`pre ${token}${sep}post`);
      assert.ok(
        out.includes("[REDACTED:pattern:gh-pat]"),
        `failed for separator ${JSON.stringify(sep)}`,
      );
      assert.ok(
        !out.includes(token),
        `token leaked for ${JSON.stringify(sep)}`,
      );
    }
  });

  test("ghp_<37> (one extra word char) does NOT match (anchored to 36)", () => {
    const longer = `ghp_${"A".repeat(37)}`;
    assert.strictEqual(r.redactValue(longer), longer);
  });
});

describe("Redactor — benign content unchanged (criterion 3)", () => {
  const r = createRedactor({ runtime: _rt, env: {} });
  const benign = [
    "Hello world — this is plain prose.",
    "# Markdown header\n\n- item 1\n- item 2",
    "https://www.forwardimpact.team/docs/products/index.md",
    "Visit https://github.com/forwardimpact/monorepo/pull/123.",
    // git SHA (40 hex)
    "7dd76efba1234567890abcdef0123456789abcde",
    // UUID
    "550e8400-e29b-41d4-a716-446655440000",
    // ghp_ prefix at less than 36 chars — should NOT match
    "ghp_short",
    "ghp_" + "A".repeat(35),
    // quoted shell commands
    "echo 'hello world' | grep -v foo",
    'curl -X POST -d "{\\"foo\\":1}" http://example.com',
  ];
  for (const text of benign) {
    test(`round-trips identically: ${JSON.stringify(text).slice(0, 60)}`, () => {
      assert.strictEqual(r.redactValue(text), text);
    });
  }
});
