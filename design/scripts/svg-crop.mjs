#!/usr/bin/env node

// Crop an SVG to the bounding box of its drawn shapes.
//
// This script computes the union bounding box of every visible shape
// (<path>, <rect>, <circle>, <ellipse>, <line>, <polyline>,
// <polygon>).  It then rewrites the root <svg> width, height, and
// viewBox to match.  The parser reads path d attributes with command
// awareness (M L H V C S Q T A Z, absolute and relative).  The
// bounding box includes Bezier control points.  This
// over-approximates curves slightly.  The crop stays correct because
// the result is never tighter than the true bbox.
//
// The script treats shapes with fill="none" and no stroke as
// invisible.  It excludes them.  It also excludes shapes whose fill
// is lighter than --fill-cutoff.  Those shapes render as faint
// shading.  When the script drops them, the crop reaches the content
// that matters (the same rule as the PNG alpha-threshold heuristic).
// The script ignores stroke widths and transforms.  For the fit
// assets these are absent or negligible.
//
// The script forces files whose basename starts with "icon-" to a
// 1:1 square canvas.  It expands the smaller dimension of the cropped
// bbox symmetrically.  The icon then stays centred in a square
// viewBox.
//
// Usage:
//   node design/scripts/svg-crop.mjs [--fill-cutoff N] [--padding N] <file ...>
//
// --fill-cutoff  the bbox excludes paths whose fill min(R,G,B)
//                exceeds this value (default 200, excludes #d0d0d0
//                and lighter).  Pass 255 to include every visible
//                path regardless of lightness.
// --padding      user-unit margin to keep around the content
//                (default 0).

import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  options: {
    "fill-cutoff": { type: "string", default: "200" },
    padding: { type: "string", default: "0" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log("Usage: svg-crop [--fill-cutoff N] [--padding N] <file.svg ...>");
  process.exit(values.help ? 0 : 1);
}

const fillCutoff = numIn("--fill-cutoff", values["fill-cutoff"], 0, 255, true);
const padding = numIn("--padding", values.padding, 0, Infinity, false);

function numIn(name, raw, lo, hi, asInt) {
  const n = asInt ? parseInt(raw, 10) : parseFloat(raw);
  if (!Number.isFinite(n) || n < lo || n > hi) {
    console.error(`${name} must be ${lo}-${hi === Infinity ? "∞" : hi}`);
    process.exit(1);
  }
  return n;
}

const NAMED_COLORS = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
};

function makeBox() {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function include(box, x, y) {
  if (x < box.minX) box.minX = x;
  if (y < box.minY) box.minY = y;
  if (x > box.maxX) box.maxX = x;
  if (y > box.maxY) box.maxY = y;
}

function isEmpty(box) {
  return box.minX === Infinity;
}

// Tokenises an SVG path "d" attribute into command letters and number tokens.
// The two number-shape sub-groups are independent (mantissa, exponent). They
// cannot backtrack across each other. Eslint's unsafe-regex heuristic flags
// the optional exponent suffix even though it is bounded.
const TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g;
const isLetter = (t) => /^[A-Za-z]$/.test(t);

// Per-command bbox extenders. Each handler reads its operand stride from the
// token cursor (`ctx.num()`). Each handler updates the current point on `ctx`.
// Each handler includes any geometric extrema in `box`. One handler per
// command keeps pathBox below the complexity lint threshold.
const PATH_HANDLERS = {
  M(ctx, box, abs) {
    const x = ctx.rx(ctx.num());
    const y = ctx.ry(ctx.num());
    ctx.cpx = x;
    ctx.cpy = y;
    ctx.spx = x;
    ctx.spy = y;
    ctx.cmd = abs ? "L" : "l";
    include(box, x, y);
  },
  L(ctx, box) {
    const x = ctx.rx(ctx.num());
    const y = ctx.ry(ctx.num());
    ctx.cpx = x;
    ctx.cpy = y;
    include(box, x, y);
  },
  H(ctx, box) {
    ctx.cpx = ctx.rx(ctx.num());
    include(box, ctx.cpx, ctx.cpy);
  },
  V(ctx, box) {
    ctx.cpy = ctx.ry(ctx.num());
    include(box, ctx.cpx, ctx.cpy);
  },
  C(ctx, box) {
    const x1 = ctx.rx(ctx.num()),
      y1 = ctx.ry(ctx.num());
    const x2 = ctx.rx(ctx.num()),
      y2 = ctx.ry(ctx.num());
    const x = ctx.rx(ctx.num()),
      y = ctx.ry(ctx.num());
    include(box, x1, y1);
    include(box, x2, y2);
    include(box, x, y);
    ctx.cpx = x;
    ctx.cpy = y;
  },
  S(ctx, box) {
    const x1 = ctx.rx(ctx.num()),
      y1 = ctx.ry(ctx.num());
    const x = ctx.rx(ctx.num()),
      y = ctx.ry(ctx.num());
    include(box, x1, y1);
    include(box, x, y);
    ctx.cpx = x;
    ctx.cpy = y;
  },
  T(ctx, box) {
    const x = ctx.rx(ctx.num()),
      y = ctx.ry(ctx.num());
    include(box, x, y);
    ctx.cpx = x;
    ctx.cpy = y;
  },
  A(ctx, box) {
    ctx.num();
    ctx.num();
    ctx.num();
    ctx.num();
    ctx.num();
    const x = ctx.rx(ctx.num()),
      y = ctx.ry(ctx.num());
    include(box, x, y);
    ctx.cpx = x;
    ctx.cpy = y;
  },
};
PATH_HANDLERS.Q = PATH_HANDLERS.S;

// Advance the command cursor when the parser reads a letter token.
// Returns true when the caller should `continue` (Z close or null command).
function advanceCommand(ctx, tokens) {
  if (!isLetter(tokens[ctx.i])) return false;
  ctx.cmd = tokens[ctx.i++];
  if (ctx.cmd === "Z" || ctx.cmd === "z") {
    ctx.cpx = ctx.spx;
    ctx.cpy = ctx.spy;
    ctx.cmd = null;
    return true;
  }
  return false;
}

// Dispatch the current command's handler. Include the geometry in the box.
function dispatchPathCommand(ctx, tokens, box) {
  if (ctx.cmd === null) {
    ctx.i++;
    return;
  }
  if (ctx.i >= tokens.length || isLetter(tokens[ctx.i])) return;

  const abs = ctx.cmd === ctx.cmd.toUpperCase();
  const c = ctx.cmd.toUpperCase();
  ctx.rx = (x) => (abs ? x : ctx.cpx + x);
  ctx.ry = (y) => (abs ? y : ctx.cpy + y);

  const handler = PATH_HANDLERS[c];
  if (handler) handler(ctx, box, abs);
  else ctx.i++;
}

function pathBox(d) {
  const tokens = d.match(TOKEN_RE);
  if (!tokens) return null;

  const box = makeBox();
  const ctx = {
    cmd: null,
    cpx: 0,
    cpy: 0,
    spx: 0,
    spy: 0,
    i: 0,
  };
  ctx.num = () => parseFloat(tokens[ctx.i++]);

  while (ctx.i < tokens.length) {
    if (advanceCommand(ctx, tokens)) continue;
    dispatchPathCommand(ctx, tokens, box);
  }

  return isEmpty(box) ? null : box;
}

function getAttr(attrs, name) {
  // `name` is always a hard-coded SVG attribute identifier from this module
  // (e.g. "x", "y", "rx"). It is never user input. So the dynamic RegExp is
  // safe.
  const m = attrs.match(new RegExp(`\\b${name}="([^"]+)"`));
  return m ? parseFloat(m[1]) : null;
}

function rectBox(attrs) {
  const x = getAttr(attrs, "x") ?? 0;
  const y = getAttr(attrs, "y") ?? 0;
  const w = getAttr(attrs, "width");
  const h = getAttr(attrs, "height");
  if (w === null || h === null) return null;
  const box = makeBox();
  include(box, x, y);
  include(box, x + w, y + h);
  return box;
}

function circleBox(attrs) {
  const cx = getAttr(attrs, "cx") ?? 0;
  const cy = getAttr(attrs, "cy") ?? 0;
  const r = getAttr(attrs, "r");
  if (r === null) return null;
  const box = makeBox();
  include(box, cx - r, cy - r);
  include(box, cx + r, cy + r);
  return box;
}

function ellipseBox(attrs) {
  const cx = getAttr(attrs, "cx") ?? 0;
  const cy = getAttr(attrs, "cy") ?? 0;
  const rx = getAttr(attrs, "rx");
  const ry = getAttr(attrs, "ry");
  if (rx === null || ry === null) return null;
  const box = makeBox();
  include(box, cx - rx, cy - ry);
  include(box, cx + rx, cy + ry);
  return box;
}

function lineBox(attrs) {
  const box = makeBox();
  include(box, getAttr(attrs, "x1") ?? 0, getAttr(attrs, "y1") ?? 0);
  include(box, getAttr(attrs, "x2") ?? 0, getAttr(attrs, "y2") ?? 0);
  return box;
}

function pointsBox(attrs) {
  const m = attrs.match(/\bpoints="([^"]+)"/);
  if (!m) return null;
  // Number pattern with a single optional fractional suffix. It is bounded
  // and has no nested quantifiers. But eslint's heuristic flags any optional
  // sub-group.
  const nums = m[1].match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const box = makeBox();
  for (let i = 0; i + 1 < nums.length; i += 2) {
    include(box, parseFloat(nums[i]), parseFloat(nums[i + 1]));
  }
  return isEmpty(box) ? null : box;
}

function parseColor(value) {
  const v = value.trim().toLowerCase();
  if (v === "none" || v === "currentcolor" || v === "transparent") return null;

  if (v.startsWith("#")) {
    const hex = v.slice(1);
    if (hex.length === 3) {
      return hex.split("").map((c) => parseInt(c + c, 16));
    }
    if (hex.length === 4) {
      return hex
        .split("")
        .slice(0, 3)
        .map((c) => parseInt(c + c, 16));
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }

  // rgba() syntax pattern. The optional alpha clause is a single bounded
  // group. Literal commas and a closing paren anchor it. No nested
  // quantifiers can backtrack across the rest of the pattern.
  const rgb = v.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/,
  );
  if (rgb)
    return [parseInt(rgb[1], 10), parseInt(rgb[2], 10), parseInt(rgb[3], 10)];

  return NAMED_COLORS[v] ?? null;
}

function isInvisible(attrs) {
  const fill = attrs.match(/\bfill="([^"]+)"/)?.[1];
  const stroke = attrs.match(/\bstroke="([^"]+)"/)?.[1];
  const strokeAbsent = !stroke || stroke === "none";
  if (fill === "none" && strokeAbsent) return true;
  if (!strokeAbsent) return false;
  if (!fill) return false;
  const rgb = parseColor(fill);
  if (!rgb) return false;
  return Math.min(rgb[0], rgb[1], rgb[2]) > fillCutoff;
}

const SHAPE_BOX = {
  path: (a) => {
    const d = a.match(/\bd="([^"]+)"/)?.[1];
    return d ? pathBox(d) : null;
  },
  rect: rectBox,
  circle: circleBox,
  ellipse: ellipseBox,
  line: lineBox,
  polyline: pointsBox,
  polygon: pointsBox,
};

function unionBox(svg) {
  const total = makeBox();
  const re =
    /<(path|rect|circle|ellipse|line|polyline|polygon)\b([^/>]*?)\/?>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const [, tag, attrs] = m;
    if (isInvisible(attrs)) continue;
    const b = SHAPE_BOX[tag](attrs);
    if (!b) continue;
    if (b.minX < total.minX) total.minX = b.minX;
    if (b.minY < total.minY) total.minY = b.minY;
    if (b.maxX > total.maxX) total.maxX = b.maxX;
    if (b.maxY > total.maxY) total.maxY = b.maxY;
  }
  return isEmpty(total) ? null : total;
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

function setOrInsert(tag, name, value) {
  // `name` is one of {"width", "height", "viewBox"}. That is a closed literal
  // set. It is not user input. The dynamic RegExp is safe.
  if (new RegExp(`\\b${name}=`).test(tag)) {
    return tag.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${value}"`);
  }
  /* eslint-enable security/detect-non-literal-regexp */
  return tag.replace(/<svg\b/, `<svg ${name}="${value}"`);
}

function rewriteSvgRoot(svg, box) {
  const x = box.minX - padding;
  const y = box.minY - padding;
  const w = box.maxX - box.minX + padding * 2;
  const h = box.maxY - box.minY + padding * 2;

  const out = svg.replace(/<svg\b[^>]*>/, (tag) => {
    let next = tag;
    next = setOrInsert(next, "width", fmt(w));
    next = setOrInsert(next, "height", fmt(h));
    next = setOrInsert(
      next,
      "viewBox",
      `${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)}`,
    );
    return next;
  });
  return { out, w, h };
}

function readDims(svg) {
  const tag = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const w = tag.match(/\bwidth="([^"]+)"/)?.[1];
  const h = tag.match(/\bheight="([^"]+)"/)?.[1];
  const vb = tag.match(/\bviewBox="([^"]+)"/)?.[1];
  let viewBox = null;
  if (vb) {
    const nums = vb
      .trim()
      .split(/[\s,]+/)
      .map(parseFloat);
    if (nums.length === 4 && nums.every(Number.isFinite)) {
      viewBox = {
        minX: nums[0],
        minY: nums[1],
        maxX: nums[0] + nums[2],
        maxY: nums[1] + nums[3],
      };
    }
  }
  return { w, h, viewBox };
}

function clamp(box, bounds) {
  if (!bounds) return box;
  return {
    minX: Math.max(box.minX, bounds.minX),
    minY: Math.max(box.minY, bounds.minY),
    maxX: Math.min(box.maxX, bounds.maxX),
    maxY: Math.min(box.maxY, bounds.maxY),
  };
}

function isNoopBox(box, bounds) {
  if (!bounds) return false;
  return (
    box.minX === bounds.minX &&
    box.minY === bounds.minY &&
    box.maxX === bounds.maxX &&
    box.maxY === bounds.maxY
  );
}

function squareBox(box) {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w === h) return box;
  if (w > h) {
    const grow = (w - h) / 2;
    return {
      minX: box.minX,
      minY: box.minY - grow,
      maxX: box.maxX,
      maxY: box.maxY + grow,
    };
  }
  const grow = (h - w) / 2;
  return {
    minX: box.minX - grow,
    minY: box.minY,
    maxX: box.maxX + grow,
    maxY: box.maxY,
  };
}

function processFile(filePath) {
  const input = readFileSync(filePath, "utf8");
  const before = readDims(input);
  const raw = unionBox(input);
  const name = basename(filePath);

  if (!raw) {
    console.log(`${name}: no drawable shapes found, skipped`);
    return;
  }

  let box = clamp(raw, before.viewBox);
  if (name.startsWith("icon-")) box = squareBox(box);

  if (padding === 0 && isNoopBox(box, before.viewBox)) {
    console.log(`${name}: ${before.w}×${before.h}, already tight`);
    return;
  }

  const { out, w, h } = rewriteSvgRoot(input, box);
  console.log(
    `${name}: ${before.w}×${before.h} → ${fmt(w)}×${fmt(h)}, ${kb(input)}KB → ${kb(out)}KB`,
  );
  writeFileSync(filePath, out);
}

function kb(s) {
  return (s.length / 1024).toFixed(0);
}

console.log(`Fill cutoff ${fillCutoff}, padding ${padding}\n`);
for (const file of positionals) processFile(file);
