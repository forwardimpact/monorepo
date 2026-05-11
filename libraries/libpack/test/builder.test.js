import { describe, test, expect } from "bun:test";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { existsSync } from "fs";
import { PackBuilder } from "../src/builder.js";
import { PackStager } from "../src/stager.js";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "libpack-builder-"));
}

function createRecordingEmitter() {
  const calls = [];
  return {
    calls,
    emit: async (...args) => calls.push(["emit", ...args]),
  };
}

function createRecordingDiscEmitter() {
  const calls = [];
  return {
    calls,
    emit: async (skillsSrcDir, outputPath) => {
      calls.push(["emit", skillsSrcDir, outputPath]);
      return [
        { name: "test-skill", description: "A test", files: ["SKILL.md"] },
      ];
    },
    emitAggregate: async (...args) => calls.push(["emitAggregate", ...args]),
  };
}

const COMBINATIONS = [
  {
    name: "se-platform",
    description: "Software Engineering (Platform) — agent team",
    content: {
      agents: [{ filename: "staff-engineer.md", content: "# Staff\n" }],
      skills: [
        {
          dirname: "kata-review",
          files: [
            {
              path: "SKILL.md",
              content: "---\nname: kata-review\n---\n# Review\n",
            },
          ],
        },
      ],
      teamInstructions: "# Team\n",
      claudeSettings: {},
      vscodeSettings: {},
    },
  },
  {
    name: "de-analytics",
    description: "Data Engineering (Analytics) — agent team",
    content: {
      agents: [{ filename: "staff-engineer.md", content: "# Staff\n" }],
      skills: [
        {
          dirname: "kata-plan",
          files: [
            {
              path: "SKILL.md",
              content: "---\nname: kata-plan\n---\n# Plan\n",
            },
          ],
        },
      ],
      teamInstructions: null,
      claudeSettings: {},
      vscodeSettings: {},
    },
  },
];

describe("PackBuilder", () => {
  test("calls emitters in correct order with recording stubs", async () => {
    const outputDir = await makeTempDir();
    const tar = createRecordingEmitter();
    const git = createRecordingEmitter();
    const disc = createRecordingDiscEmitter();

    const builder = new PackBuilder({
      stager: new PackStager(),
      emitters: { tar, git, disc },
    });

    const result = await builder.build({
      combinations: COMBINATIONS,
      outputDir,
      version: "1.0.0",
    });

    // tar: 2 raw + 2 APM = 4 calls
    expect(tar.calls).toHaveLength(4);

    // git: 2 APM = 2 calls
    expect(git.calls).toHaveLength(2);

    // disc: 2 per-pack emit + 1 aggregate = 3 calls
    expect(disc.calls).toHaveLength(3);
    expect(disc.calls[2][0]).toBe("emitAggregate");

    // Staging dir cleaned up
    expect(existsSync(join(outputDir, "_packs"))).toBe(false);

    // Return value
    expect(result.packs).toHaveLength(2);
    expect(result.packs[0].name).toBe("se-platform");
    expect(result.packs[1].name).toBe("de-analytics");
  });
});
