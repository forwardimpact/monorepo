#!/usr/bin/env node
/**
 * Extract text from PowerPoint (.pptx) slides.
 *
 * PPTX files are ZIP archives containing XML. This script extracts all text
 * from each slide and outputs it as structured markdown with slide headings.
 * Handles multiple files and outputs to stdout or a file.
 *
 * Usage:
 *   node scripts/extract-pptx.mjs <path-to-pptx>
 *   node scripts/extract-pptx.mjs <path-to-pptx> -o /tmp/extract.txt
 *   node scripts/extract-pptx.mjs file1.pptx file2.pptx
 *   node scripts/extract-pptx.mjs -h|--help
 *
 * No external dependencies — uses Node.js built-in modules only.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const HELP = `extract-pptx — extract slide text from .pptx files

Usage:
  node scripts/extract-pptx.mjs <file.pptx> [file2.pptx ...]
  node scripts/extract-pptx.mjs <file.pptx> -o <output.txt>
  node scripts/extract-pptx.mjs -h|--help

Options:
  -o <path>   Write output to file instead of stdout
  -h, --help  Show this help

Output: Markdown-formatted text with ## Slide N headings per slide.
Multiple files get # Deck: filename.pptx headings.`;

if (
  process.argv.includes("-h") ||
  process.argv.includes("--help") ||
  process.argv.length < 3
) {
  console.log(HELP);
  process.exit(process.argv.length < 3 ? 1 : 0);
}

// --- Parse arguments ---

const args = process.argv.slice(2);
let outputPath = null;
const files = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" && i + 1 < args.length) {
    outputPath = args[++i];
  } else if (!args[i].startsWith("-")) {
    files.push(args[i]);
  }
}

if (files.length === 0) {
  console.error("Error: no .pptx files provided");
  process.exit(1);
}

// --- ZIP parsing (no dependencies) ---

/**
 * Parse a ZIP file's central directory to extract file entries.
 * @param {Buffer} buf
 * @returns {Array<{name: string, offset: number, compressedSize: number, compressionMethod: number}>}
 */
function parseZipEntries(buf) {
  // Find End of Central Directory record (signature 0x06054b50)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x05 &&
      buf[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Not a valid ZIP file");

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdEntries = buf.readUInt16LE(eocdOffset + 10);

  const entries = [];
  let pos = cdOffset;

  for (let e = 0; e < cdEntries; e++) {
    // Central directory file header signature: 0x02014b50
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;

    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);

    entries.push({
      name,
      offset: localHeaderOffset,
      compressedSize,
      compressionMethod,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

const { inflateRawSync } = await import("node:zlib");

/**
 * Read the uncompressed content of a ZIP entry.
 * @param {Buffer} buf
 * @param {{offset: number, compressedSize: number, compressionMethod: number}} entry
 * @returns {Buffer}
 */
function readEntry(buf, entry) {
  const pos = entry.offset;
  const nameLen = buf.readUInt16LE(pos + 26);
  const extraLen = buf.readUInt16LE(pos + 28);
  const dataStart = pos + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return raw;
  if (entry.compressionMethod === 8) return inflateRawSync(raw);
  throw new Error(
    `Unsupported compression method ${entry.compressionMethod} for ${entry.name}`,
  );
}

/**
 * Extract all text content from slide XML using the DrawingML namespace.
 * Matches <a:t>text</a:t> elements used by PowerPoint.
 * @param {string} xml
 * @returns {string[]}
 */
function extractTextFromXml(xml) {
  const texts = [];
  const re = /<a:t>([^<]*)<\/a:t>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const text = match[1].trim();
    if (text) texts.push(text);
  }
  return texts;
}

/**
 * Extract slide text from a .pptx file.
 * @param {string} filePath
 * @returns {string} Markdown-formatted slide text
 */
function extractPptx(filePath) {
  const buf = readFileSync(filePath);
  const entries = parseZipEntries(buf);

  // Find slide XML files and sort by slide number
  const slideEntries = entries
    .filter(
      (e) => e.name.startsWith("ppt/slides/slide") && e.name.endsWith(".xml"),
    )
    .sort((a, b) => {
      const numA = parseInt(a.name.match(/(\d+)/)?.[1] || "0", 10);
      const numB = parseInt(b.name.match(/(\d+)/)?.[1] || "0", 10);
      return numA - numB;
    });

  const lines = [];

  for (const entry of slideEntries) {
    const xml = readEntry(buf, entry).toString("utf8");
    const texts = extractTextFromXml(xml);

    if (texts.length > 0) {
      const num = entry.name.match(/(\d+)/)?.[1] || "?";
      lines.push(`## Slide ${num}`);
      lines.push(texts.join("\n"));
      lines.push("");
    }
  }

  return lines.join("\n");
}

// --- Main ---

const outputs = [];

for (const file of files) {
  if (files.length > 1) {
    outputs.push(`# Deck: ${basename(file)}\n`);
  }
  outputs.push(extractPptx(file));
}

const result = outputs.join("\n");

if (outputPath) {
  writeFileSync(outputPath, result);
  console.log(`Extracted ${files.length} deck(s) → ${outputPath}`);
} else {
  process.stdout.write(result);
}
