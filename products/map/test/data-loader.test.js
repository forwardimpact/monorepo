import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { DataLoader } from "../src/loader.js";

describe("DataLoader", () => {
  let mockFs;
  let mockParser;

  beforeEach(() => {
    mockFs = {
      readFile: async () => "",
      readdir: async () => [],
      stat: async () => ({}),
    };

    mockParser = {
      parseYaml: (content) => content,
    };
  });

  describe("constructor validation", () => {
    test("throws when fs is missing", () => {
      assert.throws(() => new DataLoader(null, mockParser), /fs is required/);
    });

    test("throws when parser is missing", () => {
      assert.throws(() => new DataLoader(mockFs, null), /parser is required/);
    });

    test("creates instance with valid dependencies", () => {
      const loader = new DataLoader(mockFs, mockParser);
      assert.ok(loader);
    });
  });

  describe("loadYamlFile", () => {
    test("reads and parses a YAML file", async () => {
      const yamlContent = "name: test\nvalue: 42";
      mockFs.readFile = async (path, encoding) => {
        assert.strictEqual(path, "/data/test.yaml");
        assert.strictEqual(encoding, "utf-8");
        return yamlContent;
      };
      mockParser.parseYaml = (content) => {
        assert.strictEqual(content, yamlContent);
        return { name: "test", value: 42 };
      };

      const loader = new DataLoader(mockFs, mockParser);
      const result = await loader.loadYamlFile("/data/test.yaml");

      assert.deepStrictEqual(result, { name: "test", value: 42 });
    });

    test("propagates fs read errors", async () => {
      mockFs.readFile = async () => {
        throw new Error("ENOENT: file not found");
      };

      const loader = new DataLoader(mockFs, mockParser);
      await assert.rejects(
        () => loader.loadYamlFile("/missing.yaml"),
        /ENOENT/,
      );
    });
  });

  describe("loadFrameworkConfig", () => {
    test("loads framework.yaml from data directory", async () => {
      const frameworkData = { name: "Test Framework", version: "1.0" };
      mockFs.readFile = async (path) => {
        assert.ok(path.endsWith("framework.yaml"));
        return "name: Test Framework";
      };
      mockParser.parseYaml = () => frameworkData;

      const loader = new DataLoader(mockFs, mockParser);
      const result = await loader.loadFrameworkConfig("/data");

      assert.deepStrictEqual(result, frameworkData);
    });
  });

  describe("loadAllData", () => {
    test("loads all entity types from data directory", async () => {
      const fileSystem = {
        capabilities: ["coding.yaml", "design.yaml"],
        behaviours: ["teamwork.yaml"],
        disciplines: ["backend.yaml"],
        tracks: ["senior.yaml"],
        "questions/skills": ["coding.yaml"],
        "questions/behaviours": ["teamwork.yaml"],
        "questions/capabilities": [],
      };

      mockFs.readdir = async (dir) => {
        for (const [key, files] of Object.entries(fileSystem)) {
          if (dir.endsWith(key)) return files;
        }
        return [];
      };

      const entities = {
        "capabilities/coding.yaml": {
          name: "Coding",
          skills: [
            {
              id: "js",
              name: "JavaScript",
              human: {
                description: "JS skill",
                proficiencyDescriptions: {},
              },
            },
          ],
        },
        "capabilities/design.yaml": {
          name: "Design",
          skills: [],
        },
        "behaviours/teamwork.yaml": {
          name: "Teamwork",
          human: { description: "Works well with others" },
        },
        "disciplines/backend.yaml": {
          specialization: "Backend",
          roleTitle: "Backend Engineer",
          isProfessional: true,
          validTracks: ["senior"],
          coreSkills: ["js"],
          supportingSkills: [],
          broadSkills: [],
          human: { description: "Backend dev" },
        },
        "tracks/senior.yaml": {
          name: "Senior",
          description: "Senior track",
          skillModifiers: {},
        },
        "drivers.yaml": [{ id: "quality", name: "Quality" }],
        "levels.yaml": [{ id: "junior", name: "Junior" }],
        "stages.yaml": [{ id: "plan", name: "Plan" }],
        "framework.yaml": { name: "Test Framework" },
        "questions/skills/coding.yaml": { awareness: "What is coding?" },
        "questions/behaviours/teamwork.yaml": {
          emerging: "How do you collaborate?",
        },
      };

      mockFs.readFile = async (path) => {
        for (const [key, data] of Object.entries(entities)) {
          if (path.endsWith(key)) return JSON.stringify(data);
        }
        return "{}";
      };
      mockParser.parseYaml = (content) => JSON.parse(content);

      // stat needed for #fileExists — make capabilities/questions dirs not throw
      mockFs.stat = async () => ({});

      const loader = new DataLoader(mockFs, mockParser);
      const result = await loader.loadAllData("/data");

      assert.ok(Array.isArray(result.skills));
      assert.ok(Array.isArray(result.behaviours));
      assert.ok(Array.isArray(result.disciplines));
      assert.ok(Array.isArray(result.tracks));
      assert.ok(Array.isArray(result.capabilities));
      assert.ok(result.drivers);
      assert.ok(result.levels);
      assert.ok(result.stages);
      assert.ok(result.framework);
      assert.ok(result.questions);

      // Skills extracted from capabilities
      assert.strictEqual(result.skills.length, 1);
      assert.strictEqual(result.skills[0].id, "js");
      assert.strictEqual(result.skills[0].capability, "coding");
    });
  });

  describe("loadSkillsWithAgentData", () => {
    test("loads skills preserving agent sections", async () => {
      mockFs.readdir = async () => ["coding.yaml"];
      mockFs.readFile = async () => "content";
      mockParser.parseYaml = () => ({
        name: "Coding",
        skills: [
          {
            id: "js",
            name: "JavaScript",
            human: { description: "JS" },
            agent: { instructions: "Use ESM" },
          },
        ],
      });

      const loader = new DataLoader(mockFs, mockParser);
      const skills = await loader.loadSkillsWithAgentData("/data");

      assert.strictEqual(skills.length, 1);
      assert.strictEqual(skills[0].id, "js");
      assert.strictEqual(skills[0].capability, "coding");
      assert.deepStrictEqual(skills[0].agent, { instructions: "Use ESM" });
    });

    test("filters out index files", async () => {
      mockFs.readdir = async () => ["_index.yaml", "coding.yaml"];
      mockFs.readFile = async () => "content";
      mockParser.parseYaml = () => ({
        name: "Coding",
        skills: [{ id: "js", name: "JS", human: { description: "JS" } }],
      });

      const loader = new DataLoader(mockFs, mockParser);
      const skills = await loader.loadSkillsWithAgentData("/data");

      assert.strictEqual(skills.length, 1);
    });
  });

  describe("loadQuestionFolder", () => {
    test("loads questions from skills and behaviours subdirectories", async () => {
      mockFs.readdir = async (dir) => {
        if (dir.includes("skills")) return ["coding.yaml"];
        if (dir.includes("behaviours")) return ["teamwork.yaml"];
        return [];
      };
      mockFs.readFile = async (path) => {
        if (path.includes("coding")) return "skill questions";
        if (path.includes("teamwork")) return "behaviour questions";
        return "";
      };
      mockParser.parseYaml = (content) => {
        if (content === "skill questions") return { awareness: "What is it?" };
        if (content === "behaviour questions")
          return { emerging: "How do you?" };
        return {};
      };

      const loader = new DataLoader(mockFs, mockParser);
      const result = await loader.loadQuestionFolder("/data/questions");

      assert.ok(result.skillProficiencies);
      assert.ok(result.behaviourMaturities);
      assert.deepStrictEqual(result.skillProficiencies.coding, {
        awareness: "What is it?",
      });
      assert.deepStrictEqual(result.behaviourMaturities.teamwork, {
        emerging: "How do you?",
      });
    });
  });
});
