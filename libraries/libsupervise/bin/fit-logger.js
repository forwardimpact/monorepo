#!/usr/bin/env node
import { parseArgs } from "node:util";
import readline from "node:readline";

import { LogWriter } from "../logger.js";

const { values } = parseArgs({
  options: {
    dir: {
      type: "string",
      short: "d",
    },
    maxFileSize: {
      type: "string",
      short: "s",
    },
    maxFiles: {
      type: "string",
      short: "n",
    },
  },
});

if (!values.dir) {
  console.error(
    "Usage: fit-logger --dir <logdir> [--maxFileSize <bytes>] [--maxFiles <count>]",
  );
  process.exit(1);
}

const writer = new LogWriter(values.dir, {
  maxFileSize: values.maxFileSize
    ? parseInt(values.maxFileSize, 10)
    : undefined,
  maxFiles: values.maxFiles ? parseInt(values.maxFiles, 10) : undefined,
});

await writer.init();

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", async (line) => {
  await writer.write(line);
});

rl.on("close", async () => {
  await writer.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  rl.close();
});

process.on("SIGINT", async () => {
  rl.close();
});
