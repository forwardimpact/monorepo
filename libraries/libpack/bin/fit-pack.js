#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { createCli, formatSuccess } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { SkillPackPublisher } from "../src/index.js";

const definition = {
  name: "fit-pack",
  description: "Stage skill packs into APM's .apm/ source layout",
  commands: [
    {
      name: "sync",
      description:
        "Sync a skill pack into a sibling repo working tree (APM .apm/ layout)",
      options: {
        from: {
          type: "string",
          description:
            "Source dir holding skills/ and agents/ (default: .claude)",
        },
        prefix: {
          type: "string",
          description: "Skill directory prefix to select (e.g. kata)",
        },
        into: {
          type: "string",
          description: "Target sibling repo working tree",
        },
        name: {
          type: "string",
          description: "APM package name (sibling repo short name)",
        },
        "pack-version": {
          type: "string",
          description: "Version stamped into apm.yml and SKILL.md metadata",
        },
        description: {
          type: "string",
          description: "apm.yml description",
        },
        "readme-title": { type: "string", description: "README H1 title" },
        "readme-intro": {
          type: "string",
          description: "README intro paragraph",
        },
        "with-agents": {
          type: "boolean",
          description: "Also sync agent profiles into .apm/agents/",
        },
      },
    },
  ],
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "fit-pack sync --prefix kata --with-agents --into skills-repo --name kata-skills --pack-version 1.2.3",
  ],
  documentation: [
    {
      title: "Distribute Skill Packs",
      url: "https://www.forwardimpact.team/docs/libraries/distribute-skill-packs/index.md",
      description:
        "Stage a skill pack into APM's .apm/ layout so a bare install pulls skills and agents together.",
    },
  ],
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});
const parsed = cli.parse(process.argv.slice(2));
if (!parsed) process.exit(0);

const { values, positionals } = parsed;
const [command] = positionals;

const commands = {
  async sync() {
    for (const required of ["prefix", "into", "name", "pack-version"]) {
      if (!values[required]) {
        cli.usageError(`--${required} is required`);
        process.exit(2);
      }
    }
    const publisher = new SkillPackPublisher({ runtime });
    const { skills, agents } = await publisher.publish({
      sourceDir: values.from || ".claude",
      prefix: values.prefix,
      targetDir: values.into,
      name: values.name,
      version: values["pack-version"],
      description: values.description || "",
      readmeTitle: values["readme-title"] || values.name,
      readmeIntro: values["readme-intro"] || "",
      withAgents: Boolean(values["with-agents"]),
    });
    process.stdout.write(
      formatSuccess(
        `Staged ${skills.length} skill(s) and ${agents.length} agent(s) into ${values.into}`,
      ) + "\n",
    );
  },
};

if (!command) {
  cli.usageError("no command specified");
  process.exit(2);
} else if (commands[command]) {
  await commands[command]();
} else {
  cli.usageError(`unknown command "${command}"`);
  process.exit(2);
}
