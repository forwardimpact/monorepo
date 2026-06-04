import { test, describe } from "node:test";
import assert from "node:assert";
import { buildValidator } from "./helpers.js";

describe("OidcValidator", () => {
  test("extracts owner/name from a valid token", async () => {
    const { validator, sign } = await buildValidator();
    const claims = await validator.validate(await sign());
    assert.strictEqual(claims.owner, "acme");
    assert.strictEqual(claims.name, "agents");
    assert.strictEqual(claims.repository, "acme/agents");
  });

  test("rejects a token signed by an unknown key (INVALID_SIGNATURE)", async () => {
    const { validator, sign } = await buildValidator();
    const token = await sign({ foreignKey: true });
    await assert.rejects(
      () => validator.validate(token),
      (err) => err.code === "INVALID_SIGNATURE",
    );
  });

  test("rejects an expired token (EXPIRED)", async () => {
    const { validator, sign } = await buildValidator();
    const token = await sign({ exp: Math.floor(Date.now() / 1000) - 3600 });
    await assert.rejects(
      () => validator.validate(token),
      (err) => err.code === "EXPIRED",
    );
  });

  test("rejects a wrong issuer (WRONG_ISSUER)", async () => {
    const { validator, sign } = await buildValidator();
    const token = await sign({ issuer: "https://evil.example" });
    await assert.rejects(
      () => validator.validate(token),
      (err) => err.code === "WRONG_ISSUER",
    );
  });

  test("rejects a wrong audience (WRONG_AUDIENCE)", async () => {
    const { validator, sign } = await buildValidator();
    const token = await sign({ audience: "someone-else" });
    await assert.rejects(
      () => validator.validate(token),
      (err) => err.code === "WRONG_AUDIENCE",
    );
  });

  test("rejects a token missing the repository claim (MISSING_REPOSITORY_CLAIM)", async () => {
    const { validator, sign } = await buildValidator();
    const token = await sign({ repository: null });
    await assert.rejects(
      () => validator.validate(token),
      (err) => err.code === "MISSING_REPOSITORY_CLAIM",
    );
  });
});
