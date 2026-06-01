import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  findConstructions,
  violationsFor,
} from "../scripts/check-collaborator-construction.mjs";

const tagsAt = (src) => findConstructions(src, "fixture.js");

describe("check-collaborator-construction detector", () => {
  test("flags new Finder()", () => {
    assert.ok(tagsAt(`const f = new Finder({ fs, proc });`).has("Finder"));
  });

  test("flags the three leaf default-collaborator factories", () => {
    assert.ok(
      tagsAt(`const p = createDefaultProc();`).has("createDefaultProc"),
    );
    assert.ok(
      tagsAt(`const c = createDefaultClock();`).has("createDefaultClock"),
    );
    assert.ok(
      tagsAt(`const s = createDefaultSubprocess();`).has(
        "createDefaultSubprocess",
      ),
    );
  });

  test("never flags createDefaultRuntime() (sanctioned composition root)", () => {
    assert.equal(tagsAt(`const r = createDefaultRuntime();`).size, 0);
  });

  test("ignores a clean runtime-destructuring source", () => {
    assert.equal(
      tagsAt(`export const m = (runtime) => runtime.finder;`).size,
      0,
    );
  });
});

describe("violationsFor (prod-strict / test-lenient policy)", () => {
  test("new Finder() in a non-libutil src path is flagged", () => {
    const out = violationsFor(
      "libraries/libwiki/src/foo.js",
      `const f = new Finder({ fs, proc });`,
    );
    assert.deepEqual(out, ["Finder"]);
  });

  test("new Finder() inside libutil is not flagged", () => {
    const out = violationsFor(
      "libraries/libutil/src/index.js",
      `const f = new Finder({ fs, proc });`,
    );
    assert.equal(out.length, 0);
  });

  test("createDefaultClock() in a src path is flagged", () => {
    const out = violationsFor(
      "libraries/libwiki/src/foo.js",
      `const c = createDefaultClock();`,
    );
    assert.deepEqual(out, ["createDefaultClock"]);
  });

  test("createDefaultClock() in a *.test.js path is NOT flagged", () => {
    const out = violationsFor(
      "libraries/libwiki/test/foo.test.js",
      `const c = createDefaultClock();`,
    );
    assert.equal(out.length, 0);
  });

  test("new Finder() in a test path IS still flagged", () => {
    const out = violationsFor(
      "libraries/libwiki/test/helpers.js",
      `const f = new Finder({ fs, proc });`,
    );
    assert.deepEqual(out, ["Finder"]);
  });

  test("createDefaultRuntime() is never flagged, even in src", () => {
    const out = violationsFor(
      "libraries/libwiki/src/foo.js",
      `const r = createDefaultRuntime();`,
    );
    assert.equal(out.length, 0);
  });
});
