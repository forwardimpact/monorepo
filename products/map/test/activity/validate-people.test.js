import { test, describe } from "node:test";
import assert from "node:assert";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPeopleFile,
  validatePeople,
} from "@forwardimpact/map/activity/validate/people";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STARTER_DIR = resolve(__dirname, "../../..", "pathway/starter");

describe("activity/validate/people", () => {
  test("validatePeople flags unknown levels", async () => {
    const people = [
      {
        email: "a@x",
        name: "A",
        discipline: "software_engineering",
        level: "L999",
      },
    ];
    const { valid, errors } = await validatePeople(people, STARTER_DIR);
    assert.strictEqual(valid.length, 0);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /unknown level/);
  });

  test("validatePeople accepts valid people", async () => {
    const people = [
      {
        email: "a@x",
        name: "A",
        discipline: "software_engineering",
        level: "J040",
      },
    ];
    const { valid, errors } = await validatePeople(people, STARTER_DIR);
    assert.strictEqual(valid.length, 1);
    assert.strictEqual(errors.length, 0);
  });

  test("loadPeopleFile parses yaml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "map-people-"));
    const path = join(dir, "test.yaml");
    await writeFile(
      path,
      "- email: a@x\n  name: A\n  discipline: se\n  level: L1",
    );
    const people = await loadPeopleFile(path);
    assert.strictEqual(people.length, 1);
    assert.strictEqual(people[0].email, "a@x");
    await rm(dir, { recursive: true });
  });

  test("loadPeopleFile parses csv", async () => {
    const dir = await mkdtemp(join(tmpdir(), "map-people-"));
    const path = join(dir, "test.csv");
    await writeFile(path, "email,name\na@x,A\nb@x,B");
    const people = await loadPeopleFile(path);
    assert.strictEqual(people.length, 2);
    await rm(dir, { recursive: true });
  });

  test("validatePeople flags missing fields", async () => {
    const people = [{ email: null, name: null }];
    const { errors } = await validatePeople(people, STARTER_DIR);
    assert.ok(errors.length > 0);
    assert.match(errors[0].message, /missing/);
  });
});
