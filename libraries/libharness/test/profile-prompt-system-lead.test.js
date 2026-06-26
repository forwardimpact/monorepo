import { describe, test } from "node:test";
import assert from "node:assert";

import {
  composeLeadPrompt,
  composeSystemPrompt,
} from "@forwardimpact/libharness";

import { RT, FIXTURES } from "./profile-prompt-helpers.js";

describe("composeSystemPrompt", () => {
  test("folds amend into the <session_protocol> section", () => {
    const result = composeSystemPrompt({
      role: "agent",
      profile: "with-frontmatter",
      profilesDir: FIXTURES,
      trailer: "PROTOCOL",
      amend: "<AMENDMENT>",
      runtime: RT,
    });
    const open = result.append.indexOf("<session_protocol>");
    const close = result.append.indexOf("</session_protocol>");
    const amendAt = result.append.indexOf("<AMENDMENT>");
    assert.ok(
      open < amendAt && amendAt < close,
      "amendment lands inside the <session_protocol> section",
    );
    assert.ok(
      result.append.includes("PROTOCOL\n\n<AMENDMENT>"),
      "amendment follows the trailer with a blank-line separator",
    );
  });

  test("orders trailer, hoisted section, then amend inside <session_protocol>", () => {
    const result = composeSystemPrompt({
      role: "agent",
      profile: "with-session-protocol",
      profilesDir: FIXTURES,
      trailer: "PROTOCOL",
      amend: "<AMENDMENT>",
      runtime: RT,
    });
    const trailerAt = result.append.indexOf("PROTOCOL");
    const hoistedAt = result.append.indexOf("Before any task");
    const amendAt = result.append.indexOf("<AMENDMENT>");
    const close = result.append.indexOf("</session_protocol>");
    assert.ok(
      trailerAt < hoistedAt && hoistedAt < amendAt && amendAt < close,
      "fragments run trailer → hoisted → amend, all inside the section",
    );
  });

  test("wraps the protocol even when no profile is supplied", () => {
    const result = composeSystemPrompt({
      role: "agent",
      profilesDir: FIXTURES,
      trailer: "PROTOCOL",
      amend: "<AMENDMENT>",
      runtime: RT,
    });
    assert.strictEqual(result.type, "preset");
    assert.ok(!result.append.includes("<agent_profile>"));
    assert.strictEqual(
      result.append,
      "<session_protocol>\nPROTOCOL\n\n<AMENDMENT>\n</session_protocol>",
    );
  });

  test("lead role returns a wrapped plain string", () => {
    const result = composeSystemPrompt({
      role: "lead",
      profilesDir: FIXTURES,
      trailer: "LEAD_PROTOCOL",
      runtime: RT,
    });
    assert.strictEqual(typeof result, "string");
    assert.strictEqual(
      result,
      "<session_protocol>\nLEAD_PROTOCOL\n</session_protocol>",
    );
  });
});

describe("composeLeadPrompt", () => {
  test("wraps profile and trailer as parallel sections", () => {
    const result = composeLeadPrompt({
      profile: "with-frontmatter",
      profilesDir: FIXTURES,
      trailer: "LEAD_PROTOCOL",
      runtime: RT,
    });
    assert.ok(result.startsWith("<agent_profile>\n"));
    assert.ok(
      result.includes(
        "</agent_profile>\n\n<session_protocol>\nLEAD_PROTOCOL\n</session_protocol>",
      ),
    );
  });

  test("emits only <session_protocol> when no profile is supplied", () => {
    const result = composeLeadPrompt({
      profilesDir: FIXTURES,
      trailer: "LEAD_PROTOCOL",
      runtime: RT,
    });
    assert.strictEqual(
      result,
      "<session_protocol>\nLEAD_PROTOCOL\n</session_protocol>",
    );
  });

  test("hoists a profile's ## Session Protocol section alongside the trailer", () => {
    const result = composeLeadPrompt({
      profile: "with-session-protocol",
      profilesDir: FIXTURES,
      trailer: "LEAD_PROTOCOL",
      runtime: RT,
    });
    const protocolBody = result.slice(
      result.indexOf("<session_protocol>"),
      result.indexOf("</session_protocol>"),
    );
    assert.ok(protocolBody.includes("LEAD_PROTOCOL"));
    assert.ok(protocolBody.includes("Before any task"));
    assert.ok(!result.includes("## Session Protocol"));
    assert.ok(
      result.indexOf("LEAD_PROTOCOL") < result.indexOf("Before any task"),
    );
  });

  test("throws when trailer is missing", () => {
    assert.throws(
      () => composeLeadPrompt({ profilesDir: FIXTURES, runtime: RT }),
      /trailer is required/,
    );
  });
});
