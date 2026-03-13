import { test, describe } from "node:test";
import assert from "node:assert";
import {
  createMockConfig,
  createMockServiceConfig,
  createMockExtensionConfig,
} from "../mock/config.js";
import { createMockStorage, MockStorage } from "../mock/storage.js";
import { createMockLogger, createSilentLogger } from "../mock/logger.js";
import { createMockFs } from "../mock/fs.js";
import {
  createTestLevel,
  createTestSkill,
  createTestDiscipline,
  createTestTrack,
  createTestBehaviour,
  createTestCapability,
  createTestDriver,
  createTestSkillEntry,
  createTestBehaviourEntry,
} from "../fixture/pathway.js";

describe("libharness", () => {
  test("createMockConfig creates config with defaults", () => {
    const config = createMockConfig();
    assert.strictEqual(config.name, "test-service");
    assert.strictEqual(config.namespace, "test");
    assert.strictEqual(config.port, 3000);
  });

  test("createMockConfig accepts overrides", () => {
    const config = createMockConfig("custom", { port: 5000 });
    assert.strictEqual(config.name, "custom");
    assert.strictEqual(config.port, 5000);
  });

  test("createMockServiceConfig includes service properties", () => {
    const config = createMockServiceConfig("test");
    assert.strictEqual(config.budget, 1000);
    assert.strictEqual(config.threshold, 0.3);
  });

  test("createMockExtensionConfig includes extension properties", () => {
    const config = createMockExtensionConfig("test");
    assert.strictEqual(config.secret, "test-secret");
    assert.ok(config.llmToken);
  });

  test("createMockStorage provides storage interface", async () => {
    const storage = createMockStorage();
    await storage.put("key", "value");
    assert.strictEqual(storage.data.get("key"), "value");
    const exists = await storage.exists("key");
    assert.strictEqual(exists, true);
  });

  test("MockStorage class provides storage interface", async () => {
    const storage = new MockStorage();
    await storage.put("key", "value");
    assert.strictEqual(storage.data.get("key"), "value");
    const exists = await storage.exists("key");
    assert.strictEqual(exists, true);
  });

  test("createMockLogger provides logger interface", () => {
    const logger = createMockLogger();
    logger.debug("app", "message", {});
    assert.strictEqual(logger.debug.mock.calls.length, 1);
  });

  test("createSilentLogger provides no-op logger", () => {
    const logger = createSilentLogger();
    logger.debug("app", "message");
    logger.info("app", "message");
  });

  test("createMockStorage JSON parsing", async () => {
    const storage = createMockStorage();
    await storage.put("test.json", JSON.stringify({ foo: "bar" }));
    const result = await storage.get("test.json");
    assert.deepStrictEqual(result, { foo: "bar" });
  });

  test("createMockStorage JSONL parsing", async () => {
    const storage = createMockStorage();
    const lines = ['{"a":1}', '{"b":2}'].join("\n");
    await storage.put("test.jsonl", lines);
    const result = await storage.get("test.jsonl");
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], { a: 1 });
  });

  test("createMockStorage append", async () => {
    const storage = createMockStorage();
    await storage.append("key", "line1");
    await storage.append("key", "line2");
    const value = storage.data.get("key");
    assert.strictEqual(value, "line1\nline2");
  });

  describe("createMockFs", () => {
    test("readFile returns file content", async () => {
      const fs = createMockFs({ "/test.txt": "hello" });
      const content = await fs.readFile("/test.txt", "utf-8");
      assert.strictEqual(content, "hello");
    });

    test("readFile throws ENOENT for missing file", async () => {
      const fs = createMockFs({});
      await assert.rejects(() => fs.readFile("/missing.txt"), {
        code: "ENOENT",
      });
    });

    test("writeFile stores content", async () => {
      const fs = createMockFs({});
      await fs.writeFile("/new.txt", "content");
      const result = await fs.readFile("/new.txt", "utf-8");
      assert.strictEqual(result, "content");
    });

    test("readdir lists immediate children", async () => {
      const fs = createMockFs({
        "/dir/a.txt": "a",
        "/dir/b.txt": "b",
        "/dir/sub/c.txt": "c",
      });
      const entries = await fs.readdir("/dir");
      assert.deepStrictEqual(entries.sort(), ["a.txt", "b.txt", "sub"]);
    });

    test("stat identifies files and directories", async () => {
      const fs = createMockFs({ "/dir/file.txt": "content" });
      const fileStat = await fs.stat("/dir/file.txt");
      assert.strictEqual(fileStat.isFile(), true);
      assert.strictEqual(fileStat.isDirectory(), false);
      const dirStat = await fs.stat("/dir");
      assert.strictEqual(dirStat.isDirectory(), true);
    });

    test("copyFile copies content between keys", async () => {
      const fs = createMockFs({ "/src.txt": "data" });
      await fs.copyFile("/src.txt", "/dest.txt");
      const content = await fs.readFile("/dest.txt", "utf-8");
      assert.strictEqual(content, "data");
    });

    test("existsSync returns true for existing files", () => {
      const fs = createMockFs({ "/file.txt": "content" });
      assert.strictEqual(fs.existsSync("/file.txt"), true);
      assert.strictEqual(fs.existsSync("/missing.txt"), false);
    });
  });

  describe("pathway fixtures", () => {
    test("createTestLevel creates valid level", () => {
      const level = createTestLevel();
      assert.strictEqual(level.id, "mid");
      assert.strictEqual(level.ordinalRank, 3);
      assert.strictEqual(level.baseSkillProficiencies.primary, "working");
    });

    test("createTestLevel accepts overrides", () => {
      const level = createTestLevel({ id: "custom", ordinalRank: 5 });
      assert.strictEqual(level.id, "custom");
      assert.strictEqual(level.ordinalRank, 5);
    });

    test("createTestSkill creates valid skill", () => {
      const skill = createTestSkill();
      assert.strictEqual(skill.id, "test_skill");
      assert.strictEqual(skill.capability, "delivery");
      assert.strictEqual(skill.isHumanOnly, false);
    });

    test("createTestDiscipline creates valid discipline", () => {
      const discipline = createTestDiscipline();
      assert.strictEqual(discipline.id, "software_engineering");
      assert.ok(Array.isArray(discipline.coreSkills));
      assert.strictEqual(discipline.isManagement, false);
    });

    test("createTestTrack creates valid track", () => {
      const track = createTestTrack();
      assert.strictEqual(track.id, "platform");
      assert.strictEqual(track.skillModifiers.scale, 1);
    });

    test("createTestBehaviour creates valid behaviour", () => {
      const behaviour = createTestBehaviour();
      assert.strictEqual(behaviour.id, "collaboration");
      assert.ok(behaviour.maturityDescriptions.emerging);
    });

    test("createTestCapability creates valid capability", () => {
      const cap = createTestCapability();
      assert.strictEqual(cap.id, "delivery");
      assert.ok(cap.professionalResponsibilities.working);
    });

    test("createTestDriver creates valid driver", () => {
      const driver = createTestDriver();
      assert.strictEqual(driver.id, "velocity");
      assert.ok(Array.isArray(driver.contributingSkills));
    });

    test("createTestSkillEntry creates valid entry", () => {
      const entry = createTestSkillEntry();
      assert.strictEqual(entry.type, "primary");
      assert.strictEqual(entry.proficiency, "working");
    });

    test("createTestBehaviourEntry creates valid entry", () => {
      const entry = createTestBehaviourEntry();
      assert.strictEqual(entry.maturity, "developing");
    });
  });
});
