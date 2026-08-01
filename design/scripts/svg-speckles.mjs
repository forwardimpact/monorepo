#!/usr/bin/env node

// Remove speckle artifacts (anti-aliasing) from auto-traced SVGs.
//
// Usage:
//   node design/scripts/svg-speckles.mjs [--level 1-5] <file ...>
//
// Levels:
//   1  minimal   — remove fill-opacity paths and sub-5px specks only
//   2  light     — also remove fully isolated dark blobs
//   3  moderate  — default; isolated dark blobs with relaxed thresholds
//   4  firm      — semi-isolated dark blobs included
//   5  aggressive — larger dark blobs, wider mid-gray cleanup

import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { parseArgs } from "node:util";

const LEVEL_PRESETS = {
  1: {
    name: "minimal",
    tinyArea: 5,
    darkMaxArea: 100,
    darkMaxCmds: 4,
    darkMaxNeighbors: 0,
    neighborRadius: 40,
    midGrayMaxArea: 0,
  },
  2: {
    name: "light",
    tinyArea: 10,
    darkMaxArea: 300,
    darkMaxCmds: 5,
    darkMaxNeighbors: 0,
    neighborRadius: 40,
    midGrayMaxArea: 20,
  },
  3: {
    name: "moderate",
    tinyArea: 15,
    darkMaxArea: 500,
    darkMaxCmds: 7,
    darkMaxNeighbors: 0,
    neighborRadius: 40,
    midGrayMaxArea: 30,
  },
  4: {
    name: "firm",
    tinyArea: 20,
    darkMaxArea: 500,
    darkMaxCmds: 7,
    darkMaxNeighbors: 1,
    neighborRadius: 40,
    midGrayMaxArea: 50,
  },
  5: {
    name: "aggressive",
    tinyArea: 30,
    darkMaxArea: 800,
    darkMaxCmds: 9,
    darkMaxNeighbors: 1,
    neighborRadius: 40,
    midGrayMaxArea: 100,
  },
};

const { values, positionals } = parseArgs({
  options: {
    level: { type: "string", default: "3" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log("Usage: svg-speckles [--level 1-5] <file.svg ...>\n\nLevels:");
  for (const [k, v] of Object.entries(LEVEL_PRESETS))
    console.log(`  ${k}  ${v.name}`);
  process.exit(values.help ? 0 : 1);
}

const level = parseInt(values.level, 10);
if (!(level in LEVEL_PRESETS)) {
  console.error("Level must be 1-5");
  process.exit(1);
}
const preset = LEVEL_PRESETS[level];

console.log(`Level ${level} (${preset.name})\n`);
for (const file of positionals) cleanSvg(file);

// Per-command handlers. Each handler receives (state, v, ax, ay, push).
// ax and ay resolve relative and absolute coordinates. push records a point.
const CMD_HANDLERS = {
  M(state, v, ax, ay, push) {
    for (let i = 0; i < v.length; i += 2) {
      state.cx = ax(i);
      state.cy = ay(i + 1);
      push(state.cx, state.cy);
    }
  },
  H(state, v, _ax, _ay, push) {
    const rel = v._rel;
    for (const n of v) {
      state.cx = rel ? state.cx + n : n;
      push(state.cx, state.cy);
    }
  },
  V(state, v, _ax, _ay, push) {
    const rel = v._rel;
    for (const n of v) {
      state.cy = rel ? state.cy + n : n;
      push(state.cx, state.cy);
    }
  },
  C(state, v, ax, ay, push) {
    for (let i = 0; i < v.length; i += 6) {
      push(ax(i), ay(i + 1));
      push(ax(i + 2), ay(i + 3));
      state.cx = ax(i + 4);
      state.cy = ay(i + 5);
      push(state.cx, state.cy);
    }
  },
};
CMD_HANDLERS.L = CMD_HANDLERS.M;

function applyCommand(state, type, v) {
  const rel = type === type.toLowerCase();
  const c = type.toUpperCase();
  const ax = (i) => (rel ? state.cx + v[i] : v[i]);
  const ay = (i) => (rel ? state.cy + v[i] : v[i]);
  const push = (x, y) => {
    state.allX.push(x);
    state.allY.push(y);
  };

  const handler = CMD_HANDLERS[c];
  if (handler) {
    v._rel = rel;
    handler(state, v, ax, ay, push);
  }
}

function analyzePath(d) {
  const segs = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || [];
  const numCommands = (d.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || []).length;
  const state = { cx: 0, cy: 0, allX: [], allY: [] };

  for (const cmd of segs) {
    const values =
      cmd
        .slice(1)
        .match(/-?\d+\.?\d*/g)
        ?.map(Number) || [];
    applyCommand(state, cmd[0], values);
  }

  if (state.allX.length === 0) return null;
  const minX = Math.min(...state.allX);
  const maxX = Math.max(...state.allX);
  const minY = Math.min(...state.allY);
  const maxY = Math.max(...state.allY);
  return {
    area: (maxX - minX) * (maxY - minY),
    numCommands,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function hexBrightness(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r + g + b) / 3;
}

function parseEntries(svg) {
  const entries = [];
  for (const line of svg.split("\n")) {
    const m = line.match(/^<path\s+d="([^"]+)"([^>]*)>/);
    if (!m) {
      entries.push({ line, isPath: false });
      continue;
    }
    const [, d, attrs] = m;
    const fillMatch = attrs.match(/fill="([^"]+)"/);
    entries.push({
      line,
      isPath: true,
      hasOpacity: /fill-opacity/.test(attrs),
      info: analyzePath(d),
      brightness: fillMatch ? hexBrightness(fillMatch[1]) : 0,
    });
  }
  return entries;
}

function isIsolatedDarkSpeck(entry, darkCenters) {
  if (entry.brightness >= 100) return false;
  const { area, numCommands, cx, cy } = entry.info;
  if (area >= preset.darkMaxArea * 3) return false;

  let neighbors = 0;
  for (const dc of darkCenters) {
    if (dc.cx === cx && dc.cy === cy) continue;
    if (Math.hypot(dc.cx - cx, dc.cy - cy) < preset.neighborRadius) neighbors++;
  }

  return (
    neighbors <= preset.darkMaxNeighbors &&
    area < preset.darkMaxArea &&
    numCommands <= preset.darkMaxCmds
  );
}

function shouldRemove(entry, darkCenters) {
  if (entry.hasOpacity) return true;
  if (!entry.info) return false;
  const { area } = entry.info;
  const { brightness } = entry;
  if (area < preset.tinyArea) return true;
  if (isIsolatedDarkSpeck(entry, darkCenters)) return true;
  if (brightness >= 100 && brightness < 170 && area < preset.midGrayMaxArea)
    return true;
  return false;
}

function cleanSvg(filePath) {
  const svg = readFileSync(filePath, "utf8");
  const entries = parseEntries(svg);
  const darkCenters = entries
    .filter((e) => e.isPath && !e.hasOpacity && e.info && e.brightness < 100)
    .map((e) => ({ cx: e.info.cx, cy: e.info.cy }));

  const kept = [];
  let origPaths = 0;
  for (const e of entries) {
    if (!e.isPath) {
      kept.push(e.line);
      continue;
    }
    origPaths++;
    if (shouldRemove(e, darkCenters)) continue;
    kept.push(e.line);
  }

  const result = kept.join("\n");
  const keptPaths = kept.filter((l) => l.startsWith("<path")).length;
  const name = basename(filePath);
  console.log(
    `${name}: ${origPaths} → ${keptPaths} paths, ${kb(svg)}KB → ${kb(result)}KB`,
  );
  writeFileSync(filePath, result);
}

function kb(s) {
  return (s.length / 1024).toFixed(0);
}
