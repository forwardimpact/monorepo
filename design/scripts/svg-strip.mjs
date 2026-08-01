#!/usr/bin/env node

// Strip SVG metadata. Collapse all colours to greyscale equivalents.
//
// This script removes comments, processing instructions, DOCTYPE,
// <title>, <desc>, <metadata>, and editor-specific namespaces
// (inkscape, sodipodi, rdf, cc, dc).  It converts every fill="…" and
// stroke="…" colour to a greyscale hex with Rec. 601 luma
// (Y = 0.299R + 0.587G + 0.114B).  It splits rgba()/hsla() alpha out
// into a fill-opacity / stroke-opacity attribute.  The colour itself
// then stays a clean #gg hex.
//
// Usage:
//   node design/scripts/svg-strip.mjs <file ...>

import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { parseArgs } from "node:util";

const NAMED_COLORS = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  olive: [128, 128, 0],
  maroon: [128, 0, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  fuchsia: [255, 0, 255],
};

const { values, positionals } = parseArgs({
  options: { help: { type: "boolean", short: "h" } },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log("Usage: svg-strip <file.svg ...>");
  process.exit(values.help ? 0 : 1);
}

console.log("Stripping to greyscale\n");
for (const file of positionals) processFile(file);

// Parse a CSS hex colour (#rgb, #rgba, #rrggbb, #rrggbbaa) into {rgb, a}.
function parseHexColor(hex) {
  const dub = (s) => s.split("").map((c) => parseInt(c + c, 16));
  if (hex.length === 3) return { rgb: dub(hex), a: 1 };
  if (hex.length === 4) {
    const p = dub(hex);
    return { rgb: p.slice(0, 3), a: p[3] / 255 };
  }
  if (hex.length === 6 || hex.length === 8) {
    const rgb = [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { rgb, a };
  }
  return null;
}

function parseColor(value) {
  const v = value.trim().toLowerCase();
  if (v === "none" || v === "currentcolor" || v === "transparent") return null;

  if (v.startsWith("#")) return parseHexColor(v.slice(1));

  // rgba() syntax pattern. Literal commas and a closing paren anchor the
  // optional alpha clause. It has no nested quantifiers.
  const rgb = v.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (rgb) {
    return {
      rgb: [parseInt(rgb[1], 10), parseInt(rgb[2], 10), parseInt(rgb[3], 10)],
      a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1,
    };
  }

  if (NAMED_COLORS[v]) return { rgb: NAMED_COLORS[v], a: 1 };
  return null;
}

function toGreyHex([r, g, b]) {
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const h = y.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

function rewriteColorAttr(attr, value) {
  const parsed = parseColor(value);
  if (!parsed) return null;
  const grey = toGreyHex(parsed.rgb);
  if (parsed.a >= 1) return `${attr}="${grey}"`;
  if (parsed.a <= 0) return `${attr}="${grey}" ${attr}-opacity="0"`;
  return `${attr}="${grey}" ${attr}-opacity="${parseFloat(parsed.a.toFixed(3))}"`;
}

function stripSvg(svg) {
  return svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, "")
    .replace(/<title\b[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[\s\S]*?<\/desc>/gi, "")
    .replace(/\sxmlns:(inkscape|sodipodi|rdf|cc|dc)="[^"]*"/g, "")
    .replace(/\s(inkscape|sodipodi|rdf|cc|dc):[a-zA-Z-]+="[^"]*"/g, "")
    .replace(
      /(fill|stroke)="([^"]+)"/g,
      (m, attr, value) => rewriteColorAttr(attr, value) ?? m,
    )
    .replace(/^\s*\n/gm, "");
}

function processFile(filePath) {
  const input = readFileSync(filePath, "utf8");
  const output = stripSvg(input);
  const name = basename(filePath);
  console.log(`${name}: ${kb(input)}KB → ${kb(output)}KB`);
  writeFileSync(filePath, output);
}

function kb(s) {
  return (s.length / 1024).toFixed(0);
}
