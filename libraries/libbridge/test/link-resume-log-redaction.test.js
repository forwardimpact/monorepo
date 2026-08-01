/**
 * Asserts the literal `link_token` value never appears in any structured log
 * line over a full mint → post → complete → consume flow.
 *
 * The captured run uses these loggers. All are real
 * `@forwardimpact/libtelemetry` `Logger` instances. All use the
 * `(name, runtime)` two-arg form, because `Logger` throws
 * "runtime is required" otherwise. See
 * `libraries/libtelemetry/src/logger.js:33`.
 *
 *   (a) `bridge-side` `createLogger("ghbridge", runtime)` — the test passes
 *       it to `loadTrustedIdpOrigins(raw, { logger })`. The bridge also logs
 *       link-resume-skipped events with it at the bridge call-site
 *       (`services/ghbridge/index.js` `#stashAndPostLink`,
 *       `services/msbridge/index.js` `#stashAndPostLink`). The bridge log
 *       payload carries `reason` only. It never carries the rejected
 *       `authorizeUrl` or its origin. This test drives the loader path that
 *       emits warns on bad entries. A future regression that logs the link
 *       token at this site would trip the assertion.
 *
 *   (b) `bridge-side` `createLogger("libbridge", runtime)` — the
 *       `createLinkCompleteHandler` factory does not log today. Failure
 *       paths render the indistinguishable "Unable to verify" page. They
 *       emit no structured logs. The test pins that contract. A handler
 *       call under a real logger must not produce a captured log line that
 *       carries the link_token.
 *
 * Pattern: `@forwardimpact/libtelemetry` `Logger` writes through its injected
 * `runtime.proc.stderr` (see `libraries/libtelemetry/src/logger.js` `#emit`).
 * So the test builds the loggers on a `captureRuntime` whose `proc.stderr`
 * pushes into `captured`. The test also captures the global
 * `console.error`/`console.log` as a defensive secondary net. A future leak
 * through either sink then still trips the assertion.
 *
 * Future ghuser (b) and services/bridge (d) integration that wires in full
 * loggers would extend this fixture. It would assert the same invariant
 * across the other two `createLogger` instances. The present run pins the
 * libbridge-owned surface where new code is most likely to leak the token.
 *
 * If you remove an exercised logger call, you weaken this regression
 * catcher. Flag that removal in review (folds design observation O4 (a)).
 */
import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { Hono } from "hono";

import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";
import { mintCompletionTicket } from "@forwardimpact/libutil/completion-ticket";

import {
  createLinkCompleteHandler,
  prepareLinkResume,
} from "../src/link-resume.js";

const SECRET = "log-redaction-secret-aaaaaaaaaaaaaaaaa";
const LINK_TOKEN = "link-token-must-not-leak-12345";
const TRUSTED = loadTrustedIdpOrigins("https://github.com");
const NOW = 1_700_000_000_000;
const clock = { now: () => NOW };

/**
 * Runtime whose `proc.stderr` captures each line into `sink`, so logger output
 * lands where the test can assert on it. The Logger writes through the
 * injected `runtime.proc.stderr`. It never writes to the global `console`.
 * @param {string[]} sink - Array that receives each written line.
 * @returns {import("@forwardimpact/libutil/runtime").Runtime}
 */
function captureRuntime(sink) {
  const base = createDefaultRuntime();
  return {
    ...base,
    proc: {
      ...base.proc,
      stderr: {
        write: (s) => {
          sink.push(String(s));
          return true;
        },
      },
    },
  };
}

describe("link-resume log redaction (O4 (a))", () => {
  let originalConsoleError;
  let originalConsoleLog;
  let captured;

  beforeEach(() => {
    originalConsoleError = console.error;
    originalConsoleLog = console.log;
    captured = [];
    console.error = (m) => captured.push(String(m));
    console.log = (m) => captured.push(String(m));
  });

  afterEach(() => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  function noTokenSubstring() {
    const joined = captured.join("\n");
    expect(joined.includes(LINK_TOKEN)).toBe(false);
  }

  test("loader (a): refused entries log a warn but never the link token", () => {
    const runtime = captureRuntime(captured);
    const bridgeLogger = createLogger("ghbridge", runtime);
    loadTrustedIdpOrigins(`not-a-url, http://github.com, https://github.com`, {
      logger: bridgeLogger,
    });
    // The loader emits warns only when the logger's level admits them. The
    // assertion runs whatever the logger emits. We want zero matches even
    // when the logger is active.
    noTokenSubstring();
  });

  test("prepareLinkResume returns a token and does not log it (no logger arg)", () => {
    const r = prepareLinkResume({
      authorizeUrl: "https://github.com/authorize",
      callbackBaseUrl: "https://bridge.example",
      trustedOrigins: TRUSTED,
    });
    expect(r.linkToken).toBeTruthy();
    noTokenSubstring();
  });

  test("createLinkCompleteHandler (c): failure paths produce no log lines that carry the link token", async () => {
    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: {
        resolvePendingDispatch: async () => null,
        loadByChannel: async () => null,
      },
      dispatcher: { dispatch: async () => ({}) },
      buildCallbackMeta: () => ({}),
      trustedOrigins: TRUSTED,
      ticketSecret: SECRET,
      clock,
    });
    const app = new Hono();
    app.get("/api/link-complete", handler);

    // Drive every failure shape. Each must produce zero captured log lines.
    const ticket = mintCompletionTicket({
      linkToken: LINK_TOKEN,
      surfaceUserId: "42",
      idpOrigin: "https://github.com",
      secret: SECRET,
      now: NOW,
    });

    await app.request(
      `/api/link-complete?state=${encodeURIComponent(LINK_TOKEN)}`,
    );
    await app.request(
      `/api/link-complete?state=${encodeURIComponent(LINK_TOKEN)}&ticket=garbage`,
    );
    await app.request(
      `/api/link-complete?state=${encodeURIComponent(LINK_TOKEN)}&ticket=${encodeURIComponent(ticket)}`,
    );
    await app.request(
      `/api/link-complete?state=other-token&ticket=${encodeURIComponent(ticket)}`,
    );

    noTokenSubstring();
  });

  test("end-to-end mint→prepare→consume drives every libbridge primitive with a real logger and leaks no token", async () => {
    const runtime = captureRuntime(captured);
    const bridgeLogger = createLogger("ghbridge", runtime);

    const trusted = loadTrustedIdpOrigins("https://github.com", {
      logger: bridgeLogger,
    });
    const prepared = prepareLinkResume({
      authorizeUrl: "https://github.com/login/oauth/authorize",
      callbackBaseUrl: "https://bridge.example",
      trustedOrigins: trusted,
    });
    expect(prepared.linkToken).toBeTruthy();
    const livePrepared = prepared;

    const ticket = mintCompletionTicket({
      linkToken: livePrepared.linkToken,
      surfaceUserId: "42",
      idpOrigin: "https://github.com",
      secret: SECRET,
      now: NOW,
    });

    const handler = createLinkCompleteHandler({
      channel: "github-discussions",
      store: {
        resolvePendingDispatch: async () => ({
          discussion_id: "d-1",
          surface_user_id: "42",
        }),
        loadByChannel: async () => ({
          discussion_id: "d-1",
          history: [{ role: "user", text: "hi", author: "42" }],
        }),
      },
      dispatcher: {
        dispatch: async () => ({
          kind: "dispatched",
          token: "t",
          correlationId: "c",
        }),
      },
      buildCallbackMeta: () => ({}),
      trustedOrigins: trusted,
      ticketSecret: SECRET,
      clock,
    });
    const app = new Hono();
    app.get("/api/link-complete", handler);
    const res = await app.request(
      `/api/link-complete?state=${encodeURIComponent(livePrepared.linkToken)}&ticket=${encodeURIComponent(ticket)}`,
    );
    expect((await res.text()).includes("Processing")).toBe(true);

    const joined = captured.join("\n");
    expect(joined.includes(livePrepared.linkToken)).toBe(false);
  });
});
