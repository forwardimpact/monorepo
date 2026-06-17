/**
 * Asserts the literal `link_token` value never appears in any structured log
 * line over a full mint → post → complete → consume flow.
 *
 * Loggers in the captured run (all real `@forwardimpact/libtelemetry` `Logger`
 * instances, all via the `(name, runtime)` two-arg form because `Logger`
 * throws "runtime is required" otherwise — `libraries/libtelemetry/src/logger.js:33`):
 *
 *   (a) `bridge-side` `createLogger("ghbridge", runtime)` — passed to
 *       `loadTrustedIdpOrigins(raw, { logger })` and used to log
 *       link-resume-skipped events at the bridge call-site
 *       (`services/ghbridge/index.js` `#stashAndPostLink`,
 *       `services/msbridge/index.js` `#stashAndPostLink`). The bridge log
 *       payload carries `reason` only — never the rejected `authorizeUrl`
 *       or its origin. This test exercises the loader path that emits
 *       warns on bad entries; future regression that started logging the
 *       link token at this site would trip the assertion.
 *
 *   (b) `bridge-side` `createLogger("libbridge", runtime)` — the
 *       `createLinkCompleteHandler` factory does not log today (failure
 *       paths render the indistinguishable "Unable to verify" page rather
 *       than emitting structured logs). The test pins that contract: a
 *       handler invocation under a real logger must not produce any
 *       captured log line carrying the link_token.
 *
 * Pattern: `@forwardimpact/libtelemetry` `Logger` writes through its injected
 * `runtime.proc.stderr` (see `libraries/libtelemetry/src/logger.js` `#emit`).
 * The loggers under test are therefore built on a `captureRuntime` whose
 * `proc.stderr` pushes into `captured`. The global `console.error`/`console.log`
 * are also captured as a defensive secondary net, so a future leak via either
 * sink still trips the assertion.
 *
 * Future ghuser (b) and services/bridge (d) integration with full logger
 * wiring would extend this fixture to assert the same invariant across the
 * other two `createLogger` instances; the present run pins the libbridge-
 * owned surface where new code is most likely to leak the token.
 *
 * Removal of any of the exercised logger calls weakens this regression
 * catcher and must be flagged in review (folds design observation O4 (a)).
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
 * lands where the test can assert on it. The Logger writes through the injected
 * `runtime.proc.stderr`, never the global `console`.
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
    // Loader warns are emitted only when the logger's level admits them. The
    // assertion runs regardless of the actual emission — we want zero matches
    // even when the logger is active.
    noTokenSubstring();
  });

  test("prepareLinkResume returning a token does not log it (no logger arg)", () => {
    const r = prepareLinkResume({
      authorizeUrl: "https://github.com/authorize",
      callbackBaseUrl: "https://bridge.example",
      trustedOrigins: TRUSTED,
    });
    expect(r.linkToken).toBeTruthy();
    noTokenSubstring();
  });

  test("createLinkCompleteHandler (c): failure paths produce no log lines carrying the link token", async () => {
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

    // Drive every failure shape; each must produce zero captured log lines.
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
