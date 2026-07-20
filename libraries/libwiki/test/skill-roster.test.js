import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createMockFs } from "@forwardimpact/libmock";
import { listSkills } from "../src/skill-roster.js";

const SKILLS_DIR = "/repo/skills";

// Register the directory entries `names` (and optional plain `files`) under
// SKILLS_DIR in an in-memory fs; listSkills reads them via readdirSync/statSync.
function skillsFs(names = [], files = {}) {
  const fs = createMockFs(files);
  fs.mkdirSync(SKILLS_DIR);
  for (const name of names) fs.mkdirSync(join(SKILLS_DIR, name));
  return fs;
}

describe("listSkills", () => {
  test("empty dir returns []", () => {
    const fs = skillsFs();
    assert.deepEqual(listSkills({ skillsDir: SKILLS_DIR }, fs), []);
  });

  test("returns only kata-* directories", () => {
    const fs = skillsFs(
      ["kata-spec", "kata-plan", "gemba-wiki", "kata-session"],
      {
        [`${SKILLS_DIR}/kata-file.txt`]: "not a dir",
      },
    );

    const result = listSkills({ skillsDir: SKILLS_DIR }, fs);
    assert.deepEqual(result, ["kata-plan", "kata-session", "kata-spec"]);
  });

  test("ignores dot-prefixed entries", () => {
    const fs = skillsFs([".DS_Store_kata-hidden", "kata-real"]);

    const result = listSkills({ skillsDir: SKILLS_DIR }, fs);
    assert.deepEqual(result, ["kata-real"]);
  });

  test("sorted output is stable", () => {
    const fs = skillsFs(["kata-z", "kata-a", "kata-m"]);

    const r1 = listSkills({ skillsDir: SKILLS_DIR }, fs);
    const r2 = listSkills({ skillsDir: SKILLS_DIR }, fs);
    assert.deepEqual(r1, ["kata-a", "kata-m", "kata-z"]);
    assert.deepEqual(r1, r2);
  });
});
