import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { handleInstall, isInstallEvent } from "../src/install-handler.js";

function fakeTenancyClient() {
  const calls = [];
  return {
    calls,
    UpsertByPair: async (req) => {
      calls.push(req);
      return { tenant_id: `${req.installation_id}:${req.owner}/${req.name}` };
    },
  };
}

describe("ghbridge install handler", () => {
  test("isInstallEvent recognizes created and added", () => {
    expect(isInstallEvent("installation", { action: "created" })).toBe(true);
    expect(
      isInstallEvent("installation_repositories", { action: "added" }),
    ).toBe(true);
    expect(isInstallEvent("discussion", { action: "created" })).toBe(false);
    expect(isInstallEvent("installation", { action: "deleted" })).toBe(false);
  });

  test("installation.created with two repos upserts both", async () => {
    const tenancyClient = fakeTenancyClient();
    const result = await handleInstall(
      {
        action: "created",
        installation: { id: 1234 },
        repositories: [{ full_name: "acme/web" }, { full_name: "acme/api" }],
      },
      { tenancyClient },
    );
    expect(result.upserted).toBe(2);
    expect(tenancyClient.calls).toEqual([
      { installation_id: "1234", owner: "acme", name: "web" },
      { installation_id: "1234", owner: "acme", name: "api" },
    ]);
  });

  test("idempotent re-fire of the same event does not error", async () => {
    const tenancyClient = fakeTenancyClient();
    const payload = {
      action: "created",
      installation: { id: 1234 },
      repositories: [{ full_name: "acme/web" }],
    };
    await handleInstall(payload, { tenancyClient });
    const second = await handleInstall(payload, { tenancyClient });
    expect(second.upserted).toBe(1);
    expect(tenancyClient.calls.length).toBe(2);
  });

  test("repositories_added upserts only the new repo", async () => {
    const tenancyClient = fakeTenancyClient();
    const result = await handleInstall(
      {
        action: "added",
        installation: { id: 5678 },
        repositories_added: [{ full_name: "acme/new" }],
      },
      { tenancyClient },
    );
    expect(result.upserted).toBe(1);
    expect(tenancyClient.calls).toEqual([
      { installation_id: "5678", owner: "acme", name: "new" },
    ]);
  });

  test("delivery without installation id is a no-op", async () => {
    const tenancyClient = fakeTenancyClient();
    const result = await handleInstall(
      { action: "created", repositories: [{ full_name: "acme/web" }] },
      { tenancyClient },
    );
    expect(result.upserted).toBe(0);
    expect(tenancyClient.calls.length).toBe(0);
  });
});
