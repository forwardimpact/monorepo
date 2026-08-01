#!/usr/bin/env node

// Remove small detached black areas from auto-traced SVGs.
//
// PNG-to-SVG converters pack the main outline into a single compound path.
// That path holds hundreds of sub-paths.  Many of them are tiny artifacts
// (< 1–3 px) that trace along the stroke edges.  This script strips those
// sub-paths by bounding-box area.  It keeps legitimate features intact.
//
// Usage:
//   node design/scripts/svg-artifacts.mjs [--level 1-5] <file ...>
//
// Levels:
//   1  minimal    — sub-pixel artifacts only (< 18px²)
//   2  light      — tiny specks (< 55px²)
//   3  moderate   — default; small blobs (< 140px²)
//   4  firm       — larger blobs (< 350px²)
//   5  aggressive — up to 700px²

import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { parseArgs } from "node:util";

const LEVEL_PRESETS = {
  1: { name: "minimal", maxArea: 18 },
  2: { name: "light", maxArea: 55 },
  3: { name: "moderate", maxArea: 140 },
  4: { name: "firm", maxArea: 350 },
  5: { name: "aggressive", maxArea: 700 },
};

const DARK_BRIGHTNESS = 65;

const { values, positionals } = parseArgs({
  options: {
    level: { type: "string", default: "3" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log("Usage: svg-artifacts [--level 1-5] <file.svg ...>\n\nLevels:");
  for (const [k, v] of Object.entries(LEVEL_PRESETS)) {
    console.log(`  ${k}  ${v.name} (< ${v.maxArea}px²)`);
  }
  process.exit(values.help ? 0 : 1);
}

const level = parseInt(values.level, 10);
if (!(level in LEVEL_PRESETS)) {
  console.error("Level must be 1-5");
  process.exit(1);
}
const preset = LEVEL_PRESETS[level];

console.log(`Level ${level} (${preset.name}, < ${preset.maxArea}px²)\n`);
for (const file of positionals) cleanSvg(file);

function hexBrightness(hex) {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return 255;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r + g + b) / 3;
}

function pushPoint(s, x, y, isEndpoint) {
  s.allX.push(x);
  s.allY.push(y);
  if (isEndpoint) s.endpoints.push([x, y]);
}

// Path-command dispatch. Each handler walks `v` in its command's stride. Each
// handler pushes the appropriate sample points onto state. One handler per
// command keeps the cyclomatic complexity of any single function below the
// lint threshold.
const COMMAND_HANDLERS = {
  M: linePoints,
  L: linePoints,
  T: linePoints,
  H: horizontalPoints,
  V: verticalPoints,
  C: cubicPoints,
  S: quadraticPoints,
  Q: quadraticPoints,
  A: arcPoints,
};

function linePoints(state, ax, ay, v) {
  for (let i = 0; i < v.length; i += 2) {
    state.cx = ax(i);
    state.cy = ay(i + 1);
    pushPoint(state, state.cx, state.cy, true);
  }
}

function horizontalPoints(state, _ax, _ay, v, rel) {
  for (let i = 0; i < v.length; i++) {
    state.cx = rel ? state.cx + v[i] : v[i];
    pushPoint(state, state.cx, state.cy, true);
  }
}

function verticalPoints(state, _ax, _ay, v, rel) {
  for (let i = 0; i < v.length; i++) {
    state.cy = rel ? state.cy + v[i] : v[i];
    pushPoint(state, state.cx, state.cy, true);
  }
}

function cubicPoints(state, ax, ay, v) {
  for (let i = 0; i < v.length; i += 6) {
    pushPoint(state, ax(i), ay(i + 1), false);
    pushPoint(state, ax(i + 2), ay(i + 3), false);
    state.cx = ax(i + 4);
    state.cy = ay(i + 5);
    pushPoint(state, state.cx, state.cy, true);
  }
}

function quadraticPoints(state, ax, ay, v) {
  for (let i = 0; i < v.length; i += 4) {
    pushPoint(state, ax(i), ay(i + 1), false);
    state.cx = ax(i + 2);
    state.cy = ay(i + 3);
    pushPoint(state, state.cx, state.cy, true);
  }
}

function arcPoints(state, ax, ay, v) {
  for (let i = 0; i < v.length; i += 7) {
    state.cx = ax(i + 5);
    state.cy = ay(i + 6);
    pushPoint(state, state.cx, state.cy, true);
  }
}

function applyCommand(state, type, v) {
  const rel = type === type.toLowerCase();
  const c = type.toUpperCase();
  const ax = (i) => (rel ? state.cx + v[i] : v[i]);
  const ay = (i) => (rel ? state.cy + v[i] : v[i]);

  const handler = COMMAND_HANDLERS[c];
  if (handler) handler(state, ax, ay, v, rel);
}

function analyzeSubpath(d) {
  const segs = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || [];
  const state = { cx: 0, cy: 0, allX: [], allY: [], endpoints: [] };

  for (const cmd of segs) {
    const values =
      cmd
        .slice(1)
        .match(/-?\d+\.?\d*(?:e[+-]?\d+)?/gi)
        ?.map(Number) || [];
    applyCommand(state, cmd[0], values);
  }

  if (state.allX.length === 0) return null;
  const minX = Math.min(...state.allX);
  const maxX = Math.max(...state.allX);
  const minY = Math.min(...state.allY);
  const maxY = Math.max(...state.allY);

  let signedArea = 0;
  const ep = state.endpoints;
  for (let i = 0; i < ep.length; i++) {
    const j = (i + 1) % ep.length;
    signedArea += ep[i][0] * ep[j][1] - ep[j][0] * ep[i][1];
  }

  return {
    area: (maxX - minX) * (maxY - minY),
    winding: Math.sign(signedArea),
  };
}

function splitSubpaths(d) {
  return d.split(/(?=M)/).filter((s) => s.trim());
}

function stripSubpaths(d, maxArea) {
  const parts = splitSubpaths(d);

  let mainWinding = 0;
  let largestArea = 0;
  for (const part of parts) {
    const info = analyzeSubpath(part);
    if (info && info.area > largestArea) {
      largestArea = info.area;
      mainWinding = info.winding;
    }
  }

  const kept = [];
  let removed = 0;
  for (const part of parts) {
    const info = analyzeSubpath(part);
    if (info && info.area < maxArea && info.winding === mainWinding) {
      removed++;
    } else {
      kept.push(part);
    }
  }
  return { d: kept.join(""), removed };
}

function cleanSvg(filePath) {
  const svg = readFileSync(filePath, "utf8");
  const lines = svg.split("\n");
  const result = [];
  let totalRemoved = 0;
  let modifiedPaths = 0;
  let totalPaths = 0;

  for (const line of lines) {
    const m = line.match(/^(<path\s+d=")([^"]+)("([^>]*))>/);
    if (!m) {
      result.push(line);
      continue;
    }
    totalPaths++;

    const [, prefix, d, suffix, attrs = ""] = m;
    const fill = attrs.match(/fill="([^"]+)"/)?.[1];
    const brightness = fill ? hexBrightness(fill) : 255;

    if (brightness >= DARK_BRIGHTNESS || splitSubpaths(d).length < 2) {
      result.push(line);
      continue;
    }

    const { d: newD, removed } = stripSubpaths(d, preset.maxArea);
    if (removed > 0) {
      modifiedPaths++;
      totalRemoved += removed;
      if (newD) result.push(`${prefix}${newD}${suffix}>`);
    } else {
      result.push(line);
    }
  }

  const output = result.join("\n");
  const name = basename(filePath);
  console.log(
    `${name}: ${totalRemoved} sub-paths stripped from ${modifiedPaths}/${totalPaths} paths, ${kb(svg)}KB → ${kb(output)}KB`,
  );
  writeFileSync(filePath, output);
}

function kb(s) {
  return (s.length / 1024).toFixed(0);
}
