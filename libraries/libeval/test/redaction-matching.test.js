import { describe, test } from "node:test";
import assert from "node:assert";

import { createRedactor } from "../src/redaction.js";
import { rt as _rt, assertJsonStableSentinel } from "./redaction-helpers.js";

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
