#!/usr/bin/env bun

// Build script for Outpost (arm64 macOS).
//
// Usage:
//   bun pkg/build.js                    Compile launcher
//   bun pkg/build.js --app              Above + assemble fit-outpost.app
//   bun pkg/build.js --pkg              Above + .pkg installer
//   bun pkg/build.js --launcher         Compile Swift launcher only
//
// The fit-outpost scheduler binary is produced by the shared
// `just build-binary fit-outpost` and must be present in dist/ before --app/--pkg.

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

const __dirname =
  import.meta.dirname || dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = join(__dirname, "..");
const DIST_DIR = join(PROJECT_DIR, "dist");
const APP_NAME = "fit-outpost";
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
// Assemble fit-outpost.app bundle
// ---------------------------------------------------------------------------

function buildApp() {
  console.log("\nAssembling fit-outpost.app...");

  if (!existsSync(join(DIST_DIR, APP_NAME))) {
    throw new Error(
      `${APP_NAME} binary not found in dist/ — build it with \`just build-binary fit-outpost\` or supply it from the native build before assembling the app.`,
    );
  }

  const LIBMACOS = join(PROJECT_DIR, "..", "..", "libraries", "libmacos");
  const script = join(LIBMACOS, "scripts", "build-app.sh");
  const iconPath = join(
    PROJECT_DIR,
    "..",
    "..",
    "design",
    "fit",
    "assets",
    "icon-outpost.svg",
  );
  run(
    [
      `bash "${script}"`,
      `--bundle-name "fit-outpost"`,
      `--primary-exec "${join(DIST_DIR, LAUNCHER_NAME)}"`,
      `--extra-exec "${join(DIST_DIR, APP_NAME)}"`,
      `--info-plist "${join(PROJECT_DIR, "macos", "Info.plist")}"`,
      `--entitlements "${join(PROJECT_DIR, "macos", "Outpost.entitlements")}"`,
      `--resource "${join(PROJECT_DIR, "config")}"`,
      `--resource "${join(PROJECT_DIR, "templates")}"`,
      `--resource "${iconPath}"`,
      `--version "${VERSION}"`,
      `--out-dir "${DIST_DIR}"`,
    ].join(" "),
    { cwd: PROJECT_DIR },
  );
}

// ---------------------------------------------------------------------------
// Build macOS installer package (.pkg)
// ---------------------------------------------------------------------------

function buildPKG() {
  const pkgName = `${APP_NAME}-${VERSION}.pkg`;

  console.log(`\nBuilding pkg: ${pkgName}...`);

  const buildPkg = join(__dirname, "macos", "build-pkg.sh");
  run(`bash "${buildPkg}" "${DIST_DIR}" "${VERSION}"`, { cwd: PROJECT_DIR });

  console.log(`  -> ${join(DIST_DIR, pkgName)}`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

// No flags → default build (launcher only; the fit-outpost scheduler binary
// comes from the shared `just build-binary fit-outpost`, not this script).
// Explicit flags → run only those steps; --app/--pkg imply the launcher.
const all = args.length === 0;
const want = {
  launcher: all || args.includes("--launcher"),
  app: args.includes("--app") || args.includes("--pkg"),
  pkg: args.includes("--pkg"),
};
if (want.app || want.pkg) want.launcher = true;

console.log(`Outpost Build (v${VERSION})`);
console.log("==========================");
if (want.launcher) compileLauncher();
if (want.app) buildApp();
if (want.pkg) buildPKG();

console.log("\nBuild complete! Output in dist/");
