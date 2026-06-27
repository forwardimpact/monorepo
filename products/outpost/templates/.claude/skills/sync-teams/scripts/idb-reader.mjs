#!/usr/bin/env node
/**
 * Read Chromium IndexedDB records from a LevelDB-backed store.
 *
 * Chromium stores IndexedDB data in LevelDB with a specific key encoding
 * (database ID, object store ID) and V8-serialized values wrapped in a Blink
 * envelope. This module handles the key parsing and value deserialization.
 *
 * Exports: readIndexedDb(dir) → { conversations: Map, messages: Map }
 */

import v8 from "node:v8";
import { readAllEntries } from "./leveldb-reader.mjs";

// Chromium IndexedDB key prefix types (from indexed_db_leveldb_coding.h)
// Key format: [database_id varint] [object_store_id varint] [key_type byte] [...]
// We care about object store data records (key_type = 1) and database metadata

function readIdbVarint(buf, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos];
    result |= (byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) break;
  }
  return { value: result, bytesRead: pos - offset };
}

// Highest V8 serialization wire-format version Node's bundled v8.deserialize
// accepts. Newer Teams/WebView2 builds write version 16, which Node rejects
// outright even though the payload itself is wire-compatible. We patch the
// version byte down to this value before deserializing. Bump if Node's V8
// starts emitting/accepting a higher version natively.
const V8_MAX_SUPPORTED_VERSION = 15;

// Plausible V8 top-level value tags that immediately follow the
// [0xFF <version>] header. Used to locate the real V8 payload start inside the
// Blink envelope without relying on a fixed byte offset (newer envelopes carry
// a 0xFE trailer that shifts the payload further in). We only ever ACT on a
// candidate by attempting a deserialize, which validates it — so a stray match
// just gets skipped.
const V8_TOP_LEVEL_TAGS = new Set([
  0x6f, // 'o' begin JS object
  0x22, // '"' one-byte string
  0x63, // 'c' two-byte string
  0x44, // 'D' utf8 string
  0x49, // 'I' int32
  0x55, // 'U' uint32
  0x4e, // 'N' number (double)
  0x6c, // 'l' bigint
  0x7b, // '{' begin map
  0x41, // 'A' begin dense array
  0x61, // 'a' begin sparse array
  0x5f, // '_' undefined
  0x54, // 'T' true
  0x46, // 'F' false
  0x30, // '0' null
]);

// Only the Blink envelope precedes the V8 payload, and it is always small.
// Scanning a generous prefix keeps non-message records (which never decode)
// cheap while comfortably covering every real envelope/trailer layout.
const V8_START_SCAN_LIMIT = 256;

/**
 * Deserialize the V8 payload starting at `off`. Tries the bytes as-is first,
 * then — for records whose version byte is newer than Node supports — retries
 * with the version patched down. The wire format is backward-compatible, so a
 * supported version reads the newer payload correctly.
 */
function deserializeAt(rawValue, off) {
  try {
    return v8.deserialize(rawValue.subarray(off));
  } catch {
    // fall through to version patching
  }

  const version = rawValue[off + 1];
  if (version > V8_MAX_SUPPORTED_VERSION) {
    const patched = Buffer.from(rawValue.subarray(off));
    for (let v = V8_MAX_SUPPORTED_VERSION; v >= 13; v--) {
      patched[1] = v;
      try {
        return v8.deserialize(patched);
      } catch {
        // try the next-lower version
      }
    }
  }
  return null;
}

/**
 * Try to deserialize a Chromium IndexedDB value.
 *
 * Values have a Blink envelope (and, in newer WebView2 builds, a 0xFE trailer)
 * before the V8 payload. Locate the payload by scanning for a [0xFF <version>
 * <top-level tag>] header, then decode it — patching the version byte down for
 * records written with a V8 wire version newer than Node accepts.
 */
function tryDeserialize(rawValue) {
  if (!rawValue || rawValue.length < 4) return null;

  const limit = Math.min(rawValue.length - 2, V8_START_SCAN_LIMIT);
  for (let i = 0; i <= limit; i++) {
    if (rawValue[i] !== 0xff) continue;
    if (!V8_TOP_LEVEL_TAGS.has(rawValue[i + 2])) continue;
    const obj = deserializeAt(rawValue, i);
    if (obj !== null) return obj;
  }
  return null;
}

/**
 * Parse a Chromium IndexedDB key prefix to extract database and object store IDs.
 * Returns null if the key doesn't look like an IndexedDB data record.
 */
function _parseKeyPrefix(key) {
  if (key.length < 3) return null;
  const db = readIdbVarint(key, 0);
  if (db.bytesRead + 1 > key.length) return null;
  const os = readIdbVarint(key, db.bytesRead);
  return {
    databaseId: db.value,
    objectStoreId: os.value,
    remaining: key.subarray(db.bytesRead + os.bytesRead),
  };
}

/**
 * Read all IndexedDB records from a Chromium LevelDB directory and return
 * conversations and messages.
 *
 * @param {string} dir - path to the .indexeddb.leveldb directory
 * @returns {{ conversations: object[], messages: object[] }}
 */
export function readIndexedDb(dir) {
  // Use Maps so later entries (from newer .ldb files) overwrite older ones.
  // LevelDB reads files in ascending order — newer compactions have higher
  // numbers, so the last write for a given key is the most current.
  const convMap = new Map();
  const msgMap = new Map();

  for (const entry of readAllEntries(dir)) {
    const obj = tryDeserialize(entry.value);
    if (!obj || typeof obj !== "object") continue;

    if (isConversation(obj)) {
      const id = obj.id;
      if (id) convMap.set(id, obj);
      continue;
    }

    if (obj.messageMap && obj.conversationId) {
      const rcId = `${obj.conversationId}:${obj.replyChainId ?? ""}`;
      msgMap.set(rcId, obj);
    }
  }

  return {
    conversations: [...convMap.values()],
    messages: [...msgMap.values()],
  };
}

function isConversation(obj) {
  return (
    obj.id &&
    typeof obj.id === "string" &&
    (obj.type === "Chat" || obj.type === "Thread") &&
    (obj.members !== undefined ||
      obj.threadProperties !== undefined ||
      obj.lastMessageTimeUtc !== undefined)
  );
}
