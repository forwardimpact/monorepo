import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockGitClient } from "@forwardimpact/libmock";
import { deriveWikiUrl } from "../src/commands/init.js";

describe("deriveWikiUrl", () => {
  test("FIT_WIKI_URL env var takes precedence over origin remote", async () => {
    const git = createMockGitClient({
      responses: { remoteGetUrl: "https://example.com/foo/bar" },
    });
    const url = await deriveWikiUrl(git, "/p", {
      FIT_WIKI_URL: "https://github.com/forwardimpact/monorepo.wiki.git",
    });
    assert.equal(url, "https://github.com/forwardimpact/monorepo.wiki.git");
  });

  test("appends .wiki.git to origin to derive the wiki URL", async () => {
    const git = createMockGitClient({
      responses: { remoteGetUrl: "https://github.com/foo/bar" },
    });
    assert.equal(
      await deriveWikiUrl(git, "/p", {}),
      "https://github.com/foo/bar.wiki.git",
    );
  });

  test("strips a trailing .git before it appends .wiki.git", async () => {
    const git = createMockGitClient({
      responses: { remoteGetUrl: "https://github.com/foo/bar.git" },
    });
    assert.equal(
      await deriveWikiUrl(git, "/p", {}),
      "https://github.com/foo/bar.wiki.git",
    );
  });

  test("returns null when no origin remote is configured", async () => {
    const git = createMockGitClient({ responses: { remoteGetUrl: "" } });
    assert.equal(await deriveWikiUrl(git, "/p", {}), null);
  });
});
