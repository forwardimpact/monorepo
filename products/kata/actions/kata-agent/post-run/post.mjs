import { execSync } from "child_process";
execSync(process.env.STATE_command, { stdio: "inherit" });
