import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
  assertThrowsMessage,
  assertRejectsMessage,
} from "@forwardimpact/libmock";

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
      assertThrowsMessage(
        () => new DataLoader(null, mockParser),
        /fs is required/,
      );
    });

    test("throws when parser is missing", () => {
      assertThrowsMessage(
        () => new DataLoader(mockFs, null),
        /parser is required/,
      );
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
      await assertRejectsMessage(
        () => loader.loadYamlFile("/missing.yaml"),
        /ENOENT/,
      );
    });
  });

  describe("loadStandardConfig", () => {
    test("loads standard.yaml from data directory", async () => {
      const standardData = { name: "Test Standard", version: "1.0" };
      mockFs.readFile = async (path) => {
        assert.ok(path.endsWith("standard.yaml"));
        return "name: Test Standard";
      };
      mockParser.parseYaml = () => standardData;

      const loader = new DataLoader(mockFs, mockParser);
      const result = await loader.loadStandardConfig("/data");

      assert.deepStrictEqual(result, standardData);
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
        "standard.yaml": { name: "Test Standard" },
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
      assert.ok(result.standard);
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

  describe("loadAgentData — organizational-context.yaml", () => {
    function setupAgentLoader() {
      const fs = {
        readFile: async () => "",
        readdir: async () => [],
        stat: async () => ({}),
      };
      const parser = { parseYaml: (content) => content };
      const loader = new DataLoader(fs, parser);
      return { fs, parser, loader };
    }

    test("neither root nor repository/ present → organizationalContext is null", async () => {
      const { fs, loader } = setupAgentLoader();
      // Empty directories for disciplines/tracks/behaviours; no settings files
      fs.readdir = async () => [];
      fs.stat = async (path) => {
        if (
          path.endsWith("organizational-context.yaml") ||
          path.endsWith("claude-settings.yaml") ||
          path.endsWith("vscode-settings.yaml")
        ) {
          throw new Error("ENOENT");
        }
        return { isDirectory: () => true };
      };

      const result = await loader.loadAgentData("/data");
      assert.strictEqual(result.organizationalContext, null);
    });

    test("root file present → parsed YAML returned", async () => {
      const { fs, parser, loader } = setupAgentLoader();
      const orgYaml = {
        team: "pharma-platform",
        manager: "athena",
      };
      fs.readdir = async () => [];
      fs.stat = async (path) => {
        // Repository subdirectory paths fail; root paths succeed only for org-context
        if (path.includes("/repository/")) throw new Error("ENOENT");
        if (path.endsWith("organizational-context.yaml")) return {};
        if (
          path.endsWith("claude-settings.yaml") ||
          path.endsWith("vscode-settings.yaml")
        ) {
          throw new Error("ENOENT");
        }
        return {};
      };
      fs.readFile = async (path) => {
        if (
          path.endsWith("organizational-context.yaml") &&
          !path.includes("/repository/")
        ) {
          return "yaml-content";
        }
        return "";
      };
      parser.parseYaml = (content) =>
        content === "yaml-content" ? orgYaml : content;

      const result = await loader.loadAgentData("/data");
      assert.deepStrictEqual(result.organizationalContext, orgYaml);
    });

    test("both root and repository/ present → repository/ wins", async () => {
      const { fs, parser, loader } = setupAgentLoader();
      const rootYaml = { team: "from-root" };
      const repoYaml = { team: "from-repository" };
      fs.readdir = async () => [];
      fs.stat = async (path) => {
        if (path.endsWith("organizational-context.yaml")) return {};
        if (
          path.endsWith("claude-settings.yaml") ||
          path.endsWith("vscode-settings.yaml")
        ) {
          throw new Error("ENOENT");
        }
        return {};
      };
      fs.readFile = async (path) => {
        if (path.includes("/repository/organizational-context.yaml")) {
          return "repo-content";
        }
        if (path.endsWith("organizational-context.yaml")) return "root-content";
        return "";
      };
      parser.parseYaml = (content) => {
        if (content === "repo-content") return repoYaml;
        if (content === "root-content") return rootYaml;
        return content;
      };

      const result = await loader.loadAgentData("/data");
      assert.deepStrictEqual(result.organizationalContext, repoYaml);
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
