#!/usr/bin/env node

// Cut chip artifacts off dark strokes in auto-traced SVGs.
//
// Chips are small protrusions that hang off what should be smooth outlines.
// This script detects where each chip departs the main stroke and where it
// returns. It then cuts the chip off. It connects those two points directly.
//
// Usage:
//   node design/scripts/svg-smoothen.mjs [--level 1-5] <file ...>
//
// Levels:
//   1  minimal    — tiny chips only (max 1.5px height)
//   2  light      — small chips (max 2.5px height)
//   3  moderate   — default (max 4px height)
//   4  firm       — larger bumps (max 6px height)
//   5  aggressive — big bumps (max 10px height)

import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { parseArgs } from "node:util";

const LEVEL_PRESETS = {
  1: {
    name: "minimal",
    minHeight: 0.3,
    maxHeight: 1.5,
    maxBase: 4,
    maxSpan: 3,
    alignDeg: 30,
    maxBrightness: 40,
  },
  2: {
    name: "light",
    minHeight: 0.3,
    maxHeight: 2.5,
    maxBase: 7,
    maxSpan: 4,
    alignDeg: 40,
    maxBrightness: 55,
  },
  3: {
    name: "moderate",
    minHeight: 0.3,
    maxHeight: 4,
    maxBase: 12,
    maxSpan: 5,
    alignDeg: 50,
    maxBrightness: 70,
  },
  4: {
    name: "firm",
    minHeight: 0.3,
    maxHeight: 6,
    maxBase: 18,
    maxSpan: 6,
    alignDeg: 60,
    maxBrightness: 100,
  },
  5: {
    name: "aggressive",
    minHeight: 0.3,
    maxHeight: 10,
    maxBase: 25,
    maxSpan: 8,
    alignDeg: 75,
    maxBrightness: 140,
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
  console.log("Usage: svg-smoothen [--level 1-5] <file.svg ...>\n\nLevels:");
  for (const [k, v] of Object.entries(LEVEL_PRESETS)) {
    console.log(`  ${k}  ${v.name} (max ${v.maxHeight}px height)`);
  }
  process.exit(values.help ? 0 : 1);
}

const level = parseInt(values.level, 10);
if (!(level in LEVEL_PRESETS)) {
  console.error("Level must be 1-5");
  process.exit(1);
}
const preset = LEVEL_PRESETS[level];
const alignRad = (preset.alignDeg * Math.PI) / 180;

console.log(`Level ${level} (${preset.name}, max ${preset.maxHeight}px)\n`);
for (const file of positionals) cleanSvg(file);

function hexBrightness(hex) {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return 255;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r + g + b) / 3;
}

// Per-command segment-builders. Each handler reads its operand stride from
// `n`. Each handler pushes the appropriate segments onto `state.segments`.
// Each handler updates the current point. One handler per command keeps
// applyCommand below the lint complexity threshold.
const SEGMENT_HANDLERS = {
  M(state, n, ax, ay) {
    for (let i = 0; i < n.length; i += 2) {
      const x = ax(i),
        y = ay(i + 1);
      const segType = i === 0 ? "M" : "L";
      state.segments.push({ type: segType, endX: x, endY: y });
      if (i === 0) {
        state.startX = x;
        state.startY = y;
      }
      state.cx = x;
      state.cy = y;
    }
  },
  L(state, n, ax, ay) {
    for (let i = 0; i < n.length; i += 2) {
      state.cx = ax(i);
      state.cy = ay(i + 1);
      state.segments.push({ type: "L", endX: state.cx, endY: state.cy });
    }
  },
  H(state, n, _ax, _ay, rel) {
    for (const v of n) {
      state.cx = rel ? state.cx + v : v;
      state.segments.push({ type: "L", endX: state.cx, endY: state.cy });
    }
  },
  V(state, n, _ax, _ay, rel) {
    for (const v of n) {
      state.cy = rel ? state.cy + v : v;
      state.segments.push({ type: "L", endX: state.cx, endY: state.cy });
    }
  },
  C(state, n, ax, ay) {
    for (let i = 0; i < n.length; i += 6) {
      const cp1x = ax(i),
        cp1y = ay(i + 1);
      const cp2x = ax(i + 2),
        cp2y = ay(i + 3);
      const ex = ax(i + 4),
        ey = ay(i + 5);
      state.segments.push({
        type: "C",
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        endX: ex,
        endY: ey,
      });
      state.cx = ex;
      state.cy = ey;
    }
  },
  Z(state) {
    state.segments.push({ type: "Z", endX: state.startX, endY: state.startY });
    state.cx = state.startX;
    state.cy = state.startY;
  },
};

function applyCommand(state, type, n) {
  const rel = type === type.toLowerCase();
  const c = type.toUpperCase();
  const ax = (i) => (rel ? state.cx + n[i] : n[i]);
  const ay = (i) => (rel ? state.cy + n[i] : n[i]);

  const handler = SEGMENT_HANDLERS[c];
  if (handler) handler(state, n, ax, ay, rel);
}

function parsePath(d) {
  const raw = d.match(/[MmLlHhVvCcZz][^MmLlHhVvCcZz]*/g) || [];
  const state = { cx: 0, cy: 0, startX: 0, startY: 0, segments: [] };
  for (const cmd of raw) {
    const nums =
      cmd
        .slice(1)
        .match(/-?\d+\.?\d*(?:e[+-]?\d+)?/gi)
        ?.map(Number) || [];
    applyCommand(state, cmd[0], nums);
  }
  return state.segments;
}

function fmt(n) {
  return parseFloat(n.toFixed(3)).toString();
}

function segmentsToD(segments) {
  const parts = [];
  for (const s of segments) {
    if (s.type === "M") parts.push(`M${fmt(s.endX)} ${fmt(s.endY)}`);
    else if (s.type === "L") parts.push(`L${fmt(s.endX)} ${fmt(s.endY)}`);
    else if (s.type === "C")
      parts.push(
        `C${fmt(s.cp1x)} ${fmt(s.cp1y)} ${fmt(s.cp2x)} ${fmt(s.cp2y)} ${fmt(s.endX)} ${fmt(s.endY)}`,
      );
    else if (s.type === "Z") parts.push("Z");
  }
  return parts.join("");
}

function perpDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(lenSq);
}

function maxPerpDeviation(points, i, j) {
  let maxDev = 0;
  for (let k = i + 1; k < j; k++) {
    const d = perpDist(
      points[k].x,
      points[k].y,
      points[i].x,
      points[i].y,
      points[j].x,
      points[j].y,
    );
    if (d > maxDev) maxDev = d;
  }
  return maxDev;
}

function isAligned(segments, points, i, j, n) {
  if (i === 0 || j + 1 >= n || segments[j + 1].type === "Z") return true;
  const dirBefore = Math.atan2(
    points[i].y - points[i - 1].y,
    points[i].x - points[i - 1].x,
  );
  const dirAfter = Math.atan2(
    points[j + 1].y - points[j].y,
    points[j + 1].x - points[j].x,
  );
  let diff = Math.abs(dirAfter - dirBefore);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff <= alignRad;
}

function findChipAt(segments, points, i, n) {
  for (let span = 2; span <= preset.maxSpan && i + span < n; span++) {
    const j = i + span;
    if (segments[j].type === "Z") continue;
    const base = Math.hypot(
      points[j].x - points[i].x,
      points[j].y - points[i].y,
    );
    if (base > preset.maxBase) continue;
    const dev = maxPerpDeviation(points, i, j);
    if (dev < preset.minHeight || dev > preset.maxHeight) continue;
    if (!isAligned(segments, points, i, j, n)) continue;
    return { from: i, to: j };
  }
  return null;
}

function detectChips(segments) {
  const points = segments.map((s) => ({ x: s.endX, y: s.endY }));
  const n = points.length;
  const chips = [];
  let i = 1;
  while (i < n - 1) {
    const chip = findChipAt(segments, points, i, n);
    if (chip) {
      chips.push(chip);
      i = chip.to;
    } else {
      i++;
    }
  }
  return chips;
}

function cutChips(segments, chips) {
  if (chips.length === 0) return { segments, cut: 0 };
  const result = [];
  let totalCut = 0;
  let chipIdx = 0;
  for (let i = 0; i < segments.length; i++) {
    if (chipIdx < chips.length && i === chips[chipIdx].from + 1) {
      const chip = chips[chipIdx];
      const toSeg = segments[chip.to];
      result.push({ type: "L", endX: toSeg.endX, endY: toSeg.endY });
      totalCut += chip.to - chip.from - 1;
      i = chip.to;
      chipIdx++;
    } else {
      result.push(segments[i]);
    }
  }
  return { segments: result, cut: totalCut };
}

function processPath(d) {
  const segments = parsePath(d);
  if (segments.length < 4) return { d, chips: 0, cut: 0 };

  const subpaths = [];
  let current = [];
  for (const seg of segments) {
    if (seg.type === "M" && current.length > 0) {
      subpaths.push(current);
      current = [];
    }
    current.push(seg);
  }
  if (current.length > 0) subpaths.push(current);

  const processed = [];
  let totalChips = 0;
  let totalCut = 0;
  for (const sp of subpaths) {
    const chips = detectChips(sp);
    totalChips += chips.length;
    const { segments: newSegs, cut } = cutChips(sp, chips);
    totalCut += cut;
    processed.push(...newSegs);
  }

  if (totalChips === 0) return { d, chips: 0, cut: 0 };
  return { d: segmentsToD(processed), chips: totalChips, cut: totalCut };
}

function cleanSvg(filePath) {
  const svg = readFileSync(filePath, "utf8");
  const lines = svg.split("\n");
  const result = [];
  let totalChips = 0;
  let totalCut = 0;
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
    if (brightness > preset.maxBrightness) {
      result.push(line);
      continue;
    }

    const { d: newD, chips, cut } = processPath(d);
    if (chips > 0) {
      modifiedPaths++;
      totalChips += chips;
      totalCut += cut;
      result.push(`${prefix}${newD}${suffix}>`);
    } else {
      result.push(line);
    }
  }

  const output = result.join("\n");
  const name = basename(filePath);
  console.log(
    `${name}: ${totalChips} chips cut from ${modifiedPaths}/${totalPaths} paths, ${totalCut} segments removed, ${kb(svg)}KB → ${kb(output)}KB`,
  );
  writeFileSync(filePath, output);
}

function kb(s) {
  return (s.length / 1024).toFixed(0);
}
