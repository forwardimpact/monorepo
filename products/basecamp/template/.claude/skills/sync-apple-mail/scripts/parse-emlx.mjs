#!/usr/bin/env node
/**
 * Parse a macOS Mail .emlx or .partial.emlx file and output the plain text body.
 *
 * Usage: node scripts/parse-emlx.mjs <path-to-emlx-file>
 *
 * The .emlx format is: first line = byte count, then RFC822 message, then Apple
 * plist. This script extracts and prints the plain text body.
 *
 * If the email has no text/plain part (HTML-only), falls back to stripping HTML
 * tags and outputting as plain text.
 *
 * Exit codes:
 *   0 — success (body printed to stdout)
 *   1 — file not found or parse error (message on stderr)
 */

import { readFileSync } from "node:fs";

/**
 * Strip HTML tags and convert to plain text.
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  let text = html;
  // Remove style and script blocks
  text = text.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Replace br and p tags with newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = decodeEntities(text);
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/**
 * Decode HTML entities. Handles named entities and numeric references.
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201C",
    rdquo: "\u201D",
    hellip: "…",
    copy: "©",
    reg: "®",
    trade: "™",
    bull: "•",
    middot: "·",
    ensp: "\u2002",
    emsp: "\u2003",
    thinsp: "\u2009",
    zwnj: "\u200C",
    zwj: "\u200D",
  };
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, ref) => {
    if (ref.startsWith("#x") || ref.startsWith("#X")) {
      const code = parseInt(ref.slice(2), 16);
      return code ? String.fromCodePoint(code) : match;
    }
    if (ref.startsWith("#")) {
      const code = parseInt(ref.slice(1), 10);
      return code ? String.fromCodePoint(code) : match;
    }
    return named[ref.toLowerCase()] ?? match;
  });
}

/**
 * Parse MIME headers from a raw buffer.
 * Returns { headers: Map<lowercase-name, value[]>, bodyOffset }.
 * @param {Buffer} raw
 * @returns {{ headers: Map<string, string[]>, bodyOffset: number }}
 */
function parseHeaders(raw) {
  const headers = new Map();
  let i = 0;
  let currentName = "";
  let currentValue = "";

  while (i < raw.length) {
    // Find end of line
    let eol = raw.indexOf(0x0a, i); // \n
    if (eol === -1) eol = raw.length;
    const lineEnd = eol > i && raw[eol - 1] === 0x0d ? eol - 1 : eol; // strip \r
    const line = raw.subarray(i, lineEnd).toString("utf-8");
    i = eol + 1;

    // Empty line = end of headers
    if (line === "") {
      if (currentName) {
        const arr = headers.get(currentName) ?? [];
        arr.push(currentValue);
        headers.set(currentName, arr);
      }
      return { headers, bodyOffset: i };
    }

    // Continuation line (starts with whitespace)
    if (line[0] === " " || line[0] === "\t") {
      currentValue += " " + line.trimStart();
      continue;
    }

    // New header — save previous
    if (currentName) {
      const arr = headers.get(currentName) ?? [];
      arr.push(currentValue);
      headers.set(currentName, arr);
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    currentName = line.slice(0, colonIdx).toLowerCase().trim();
    currentValue = line.slice(colonIdx + 1).trim();
  }

  if (currentName) {
    const arr = headers.get(currentName) ?? [];
    arr.push(currentValue);
    headers.set(currentName, arr);
  }
  return { headers, bodyOffset: raw.length };
}

/**
 * Parse Content-Type header value.
 * @param {string} value - e.g. 'text/plain; charset="utf-8"; boundary="abc"'
 * @returns {{ type: string, params: Record<string, string> }}
 */
function parseContentType(value) {
  const parts = value.split(";");
  const type = (parts[0] ?? "").trim().toLowerCase();
  const params = {};
  for (let k = 1; k < parts.length; k++) {
    const eq = parts[k].indexOf("=");
    if (eq === -1) continue;
    const name = parts[k].slice(0, eq).trim().toLowerCase();
    let val = parts[k].slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    params[name] = val;
  }
  return { type, params };
}

/**
 * Decode a MIME body payload according to Content-Transfer-Encoding.
 * @param {Buffer} data
 * @param {string} encoding
 * @returns {Buffer}
 */
function decodePayload(data, encoding) {
  const enc = (encoding ?? "").toLowerCase().trim();
  if (enc === "base64") {
    return Buffer.from(data.toString("ascii").replace(/\s/g, ""), "base64");
  }
  if (enc === "quoted-printable") {
    const str = data.toString("ascii");
    const bytes = [];
    for (let j = 0; j < str.length; j++) {
      if (str[j] === "=" && j + 2 < str.length) {
        if (str[j + 1] === "\r" || str[j + 1] === "\n") {
          // Soft line break
          j++; // skip \r or \n
          if (str[j] === "\r" && j + 1 < str.length && str[j + 1] === "\n") j++;
          continue;
        }
        const hex = str.slice(j + 1, j + 3);
        const code = parseInt(hex, 16);
        if (!isNaN(code)) {
          bytes.push(code);
          j += 2;
          continue;
        }
      }
      bytes.push(str.charCodeAt(j));
    }
    return Buffer.from(bytes);
  }
  return data;
}

/**
 * Decode text from a buffer using the given charset.
 * @param {Buffer} data
 * @param {string} [charset]
 * @returns {string}
 */
function decodeText(data, charset) {
  const cs = (charset ?? "utf-8").toLowerCase().replace(/^(x-|iso_)/i, "iso-");
  try {
    const decoder = new TextDecoder(cs, { fatal: false });
    return decoder.decode(data);
  } catch {
    return data.toString("utf-8");
  }
}

/**
 * Parse a MIME part from raw bytes. Returns { contentType, charset, body }.
 * @param {Buffer} raw
 * @returns {{ contentType: string, charset: string, body: Buffer, headers: Map<string, string[]> }}
 */
function parsePart(raw) {
  const { headers, bodyOffset } = parseHeaders(raw);
  const ctHeader = (headers.get("content-type") ?? ["text/plain"])[0];
  const { type, params } = parseContentType(ctHeader);
  const encoding = (headers.get("content-transfer-encoding") ?? ["7bit"])[0];
  const bodyRaw = raw.subarray(bodyOffset);
  const body = decodePayload(bodyRaw, encoding);
  return {
    contentType: type,
    charset: params.charset,
    body,
    headers,
    boundary: params.boundary,
  };
}

/**
 * Walk all MIME parts of a message (like Python's email.walk()).
 * @param {Buffer} raw
 * @returns {Array<{ contentType: string, charset: string, body: Buffer }>}
 */
function walkParts(raw) {
  const part = parsePart(raw);
  if (!part.contentType.startsWith("multipart/")) {
    return [part];
  }

  const boundary = part.boundary;
  if (!boundary) return [part];

  const delim = Buffer.from(`--${boundary}`);
  const bodyStart = raw.indexOf(delim);
  if (bodyStart === -1) return [part];

  const parts = [];
  let pos = bodyStart;

  while (pos < raw.length) {
    const start = raw.indexOf(delim, pos);
    if (start === -1) break;
    let afterDelim = start + delim.length;
    // Check for terminal --
    if (
      afterDelim + 1 < raw.length &&
      raw[afterDelim] === 0x2d &&
      raw[afterDelim + 1] === 0x2d
    ) {
      break;
    }
    // Skip to start of part content (after CRLF or LF)
    while (
      afterDelim < raw.length &&
      (raw[afterDelim] === 0x0d || raw[afterDelim] === 0x0a)
    ) {
      afterDelim++;
    }
    // Find next boundary
    const nextBoundary = raw.indexOf(delim, afterDelim);
    const partEnd = nextBoundary === -1 ? raw.length : nextBoundary;

    // Trim trailing CRLF before boundary
    let trimEnd = partEnd;
    if (trimEnd > 0 && raw[trimEnd - 1] === 0x0a) trimEnd--;
    if (trimEnd > 0 && raw[trimEnd - 1] === 0x0d) trimEnd--;

    const subRaw = raw.subarray(afterDelim, trimEnd);
    // Recurse for nested multipart
    parts.push(...walkParts(subRaw));
    pos = nextBoundary === -1 ? raw.length : nextBoundary;
  }

  return parts;
}

/**
 * Extract plain text body from raw RFC822 bytes, with HTML fallback.
 * @param {Buffer} raw
 * @returns {string | null}
 */
export function extractBody(raw) {
  const parts = walkParts(raw);
  let textBody = null;
  let htmlBody = null;

  for (const part of parts) {
    if (part.contentType === "text/plain" && textBody === null) {
      textBody = decodeText(part.body, part.charset);
    } else if (part.contentType === "text/html" && htmlBody === null) {
      htmlBody = decodeText(part.body, part.charset);
    }
  }

  if (textBody) return textBody;
  if (htmlBody) return htmlToText(htmlBody);
  return null;
}

/**
 * Parse an .emlx file and return the body text.
 * @param {string} filePath
 * @returns {string | null}
 */
export function parseEmlx(filePath) {
  const data = readFileSync(filePath);
  // First line is the byte count
  const newline = data.indexOf(0x0a);
  const byteCount = parseInt(data.subarray(0, newline).toString("ascii"), 10);
  const raw = data.subarray(newline + 1, newline + 1 + byteCount);
  return extractBody(raw);
}

/**
 * Parse an .emlx file and print From, Date, body to stdout.
 * @param {string} filePath
 */
function parseAndPrint(filePath) {
  const data = readFileSync(filePath);
  const newline = data.indexOf(0x0a);
  const byteCount = parseInt(data.subarray(0, newline).toString("ascii"), 10);
  const raw = data.subarray(newline + 1, newline + 1 + byteCount);
  const { headers } = parseHeaders(raw);

  const from = (headers.get("from") ?? ["Unknown"])[0];
  const date = (headers.get("date") ?? [""])[0];
  console.log(`From: ${from}`);
  console.log(`Date: ${date}`);
  console.log("---");

  const body = extractBody(raw);
  if (body) console.log(body);
}

// --- CLI ---
if (
  process.argv[1] &&
  (process.argv[1].endsWith("parse-emlx.mjs") ||
    process.argv[1].endsWith("parse-emlx"))
) {
  if (process.argv.length !== 3) {
    console.error("Usage: node scripts/parse-emlx.mjs <path>");
    process.exit(1);
  }
  try {
    parseAndPrint(process.argv[2]);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
