#!/usr/bin/env bun

// Build script for Outpost (arm64 macOS).
//
// Usage:
//   bun pkg/build.js                    Compile the Swift launcher
//   bun pkg/build.js --launcher         Compile the Swift launcher only
//
// The fit-outpost scheduler binary is produced by the shared
// `just build-binary fit-outpost`. The .app bundle and .pkg installer are
// assembled by the release workflow via `just build-app-product outpost` and
// `pkg/macos/build-pkg.sh` against the canonical dist/apps/fit-outpost.app —
// this script only compiles the launcher they consume.

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

const __dirname =
  import.meta.dirname || dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = join(__dirname, "..");
const DIST_DIR = join(PROJECT_DIR, "dist");
const LAUNCHER_NAME = "Outpost";
const LAUNCHER_DIR = join(PROJECT_DIR, "macos", "Outpost");
const VERSION = JSON.parse(
  readFileSync(join(PROJECT_DIR, "package.json"), "utf8"),
).version;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", ...opts });
}

// ---------------------------------------------------------------------------
// Compile Swift app launcher (includes status menu UI)
// ---------------------------------------------------------------------------

function compileLauncher() {
  console.log(`\nCompiling ${LAUNCHER_NAME}...`);
  ensureDir(DIST_DIR);

  const buildDir = join(LAUNCHER_DIR, ".build");
  rmSync(buildDir, { recursive: true, force: true });

  // Determinism profile — produces a byte-identical Mach-O across rebuilds.
  // (a) SWIFT_DETERMINISTIC_HASHING=1 — symbol-table/section order.
  // (b) -file-prefix-map — DWARF absolute-path scrubbing.
  //     -no-clang-module-breadcrumbs — strips clang-module debug
  //     paths Swift modules can pull alongside DWARF.
  //     -gnone — last-resort drop of DWARF debug info entirely;
  //     without it, timestamp-shaped 4-byte writes leak into
  //     Contents/MacOS/Outpost.
  // (c) -Xlinker -no_uuid — suppress LC_UUID which ld64 derives from
  //     content + build-time entropy; pairs with (a)/(b) to leave
  //     the Mach-O byte-identical across rebuilds.
  const swiftCmd = [
    "swift build -c release",
    "-Xswiftc -no-clang-module-breadcrumbs",
    `-Xswiftc -file-prefix-map -Xswiftc "${LAUNCHER_DIR}=."`,
    "-Xswiftc -gnone",
    "-Xlinker -no_uuid",
  ].join(" ");
  run(swiftCmd, {
    cwd: LAUNCHER_DIR,
    env: { ...process.env, SWIFT_DETERMINISTIC_HASHING: "1" },
  });

  const binary = join(buildDir, "release", LAUNCHER_NAME);
  const outputPath = join(DIST_DIR, LAUNCHER_NAME);
  run(`cp "${binary}" "${outputPath}"`);

  rmSync(buildDir, { recursive: true, force: true });

  console.log(`  -> ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// The only build step this script owns is the Swift launcher. With no flags or
// with --launcher it compiles the launcher; there are no other steps.
console.log(`Outpost Build (v${VERSION})`);
console.log("==========================");
compileLauncher();

console.log("\nBuild complete! Output in dist/");
