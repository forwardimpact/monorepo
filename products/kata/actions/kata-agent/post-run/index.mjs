import { appendFileSync } from "fs";
appendFileSync(
  process.env.GITHUB_STATE,
  `command=${process.env.INPUT_COMMAND}\n`,
);
