import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { extractRepo, extractTenant } from "../src/tenant-extractor.js";

describe("ghbridge tenant extractor", () => {
  test("extractRepo reads owner/name from full_name", () => {
    expect(extractRepo({ repository: { full_name: "acme/web" } })).toEqual({
      owner: "acme",
      name: "web",
    });
  });

  test("extractRepo reads owner/name from nested owner.login", () => {
    expect(
      extractRepo({ repository: { owner: { login: "acme" }, name: "api" } }),
    ).toEqual({ owner: "acme", name: "api" });
  });

  test("extractRepo returns null when no repository is named", () => {
    expect(extractRepo({})).toBeNull();
  });

  test("single installation, many repos: each delivery resolves its own repo", async () => {
    // One installation (id 99) covers both acme/web and acme/api. The
    // resolver disambiguates by repo — each delivery names exactly one.
    const rows = {
      "acme/web": { tenant_id: "t-web", state: "active" },
      "acme/api": { tenant_id: "t-api", state: "active" },
    };
    const tenantResolver = {
      resolveByRepo: async ({ owner, name }) =>
        rows[`${owner}/${name}`] ?? null,
    };

    const web = await extractTenant(
      { installation: { id: 99 }, repository: { full_name: "acme/web" } },
      tenantResolver,
    );
    expect(web.tenant_id).toBe("t-web");

    const api = await extractTenant(
      { installation: { id: 99 }, repository: { full_name: "acme/api" } },
      tenantResolver,
    );
    expect(api.tenant_id).toBe("t-api");
  });

  test("extractTenant returns null when no repo is present", async () => {
    const tenantResolver = { resolveByRepo: async () => ({ tenant_id: "x" }) };
    expect(await extractTenant({}, tenantResolver)).toBeNull();
  });
});
