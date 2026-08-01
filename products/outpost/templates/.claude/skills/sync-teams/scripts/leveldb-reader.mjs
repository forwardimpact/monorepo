#!/usr/bin/env node
/**
 * Read LevelDB SSTable (.ldb) and write-ahead log (.log) files.
 *
 * Parses the binary SSTable format directly. It needs no LevelDB library.
 * Handles Snappy-compressed blocks with snappyjs (pure JS, zero native deps).
 *
 * Exports a single generator function: readAllEntries(directory)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import SnappyJS from "snappyjs";

const uncompress =
  SnappyJS.uncompress ?? SnappyJS.default?.uncompress ?? SnappyJS;

const LEVELDB_TABLE_MAGIC = 0xdb4775248b80fb57n;

function readFixed32(buf, offset) {
  return buf.readUInt32LE(offset);
}

function readFixed64(buf, offset) {
  const lo = buf.readUInt32LE(offset);
  const hi = buf.readUInt32LE(offset + 4);
  return BigInt(hi) * 0x100000000n + BigInt(lo);
}

function readVarint(buf, offset) {
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

function decompressBlock(raw, compressionType) {
  if (compressionType === 1) {
    try {
      return Buffer.from(uncompress(raw));
    } catch {
      return raw;
    }
  }
  return raw;
}

function parseBlockEntries(blockData) {
  const entries = [];
  if (blockData.length < 4) return entries;

  const numRestarts = readFixed32(blockData, blockData.length - 4);
  const restartsOffset = blockData.length - 4 - numRestarts * 4;
  if (restartsOffset < 0) return entries;

  let pos = 0;
  let prevKey = Buffer.alloc(0);

  while (pos < restartsOffset) {
    if (pos + 3 > blockData.length) break;

    const shared = readVarint(blockData, pos);
    pos += shared.bytesRead;
    const nonShared = readVarint(blockData, pos);
    pos += nonShared.bytesRead;
    const valueLen = readVarint(blockData, pos);
    pos += valueLen.bytesRead;

    if (pos + nonShared.value + valueLen.value > blockData.length) break;

    const keyDelta = blockData.subarray(pos, pos + nonShared.value);
    pos += nonShared.value;

    const key = Buffer.concat([prevKey.subarray(0, shared.value), keyDelta]);
    prevKey = key;

    const value = Buffer.from(blockData.subarray(pos, pos + valueLen.value));
    pos += valueLen.value;

    entries.push({ key, value });
  }
  return entries;
}

function readBlock(fileData, offset, size) {
  if (offset + size + 5 > fileData.length) return null;
  const raw = fileData.subarray(offset, offset + size);
  const compressionType = fileData[offset + size];
  return decompressBlock(raw, compressionType);
}

function parseFooter(fileData) {
  const footer = fileData.subarray(fileData.length - 48);
  const mi = readVarint(footer, 0);
  readVarint(footer, mi.bytesRead);
  let pos = mi.bytesRead + readVarint(footer, mi.bytesRead).bytesRead;
  const idx = readVarint(footer, pos);
  pos += idx.bytesRead;
  const idx2 = readVarint(footer, pos);
  return { indexOffset: idx.value, indexSize: idx2.value };
}

function* readSstEntries(filePath) {
  let fileData;
  try {
    fileData = readFileSync(filePath);
  } catch {
    return;
  }
  if (fileData.length < 48) return;

  const magic = readFixed64(fileData, fileData.length - 8);
  if (magic !== LEVELDB_TABLE_MAGIC) return;

  let footer;
  try {
    footer = parseFooter(fileData);
  } catch {
    return;
  }

  const indexBlock = readBlock(fileData, footer.indexOffset, footer.indexSize);
  if (!indexBlock) return;

  for (const indexEntry of parseBlockEntries(indexBlock)) {
    const handle = readVarint(indexEntry.value, 0);
    const handleSize = readVarint(indexEntry.value, handle.bytesRead);

    const dataBlock = readBlock(fileData, handle.value, handleSize.value);
    if (!dataBlock) continue;

    yield* parseBlockEntries(dataBlock);
  }
}

// LevelDB write-ahead log format: 32 KB blocks with record headers
const LOG_BLOCK_SIZE = 32768;
const LOG_HEADER_SIZE = 7; // checksum(4) + length(2) + type(1)

/**
 * Parse records from a single WAL block. Yield { payload, type } for each one.
 */
function* parseLogBlock(fileData, blockStart, blockEnd) {
  let offset = blockStart;
  while (offset + LOG_HEADER_SIZE <= blockEnd) {
    const length = fileData.readUInt16LE(offset + 4);
    const type = fileData[offset + 6];
    if (type === 0 || length === 0) break;

    const payload = fileData.subarray(
      offset + LOG_HEADER_SIZE,
      offset + LOG_HEADER_SIZE + length,
    );
    yield { payload, type };
    offset += LOG_HEADER_SIZE + length;
  }
}

/**
 * Accumulate record fragments across blocks.
 * Type 1 = full, 2 = first, 3 = middle, 4 = last.
 * Returns the updated pending buffer (or null).
 */
function handleFragment(type, payload, pendingRecord, emit) {
  if (type === 1) {
    emit(payload);
    return null;
  }
  if (type === 2) return [payload];
  if (type === 3) {
    if (pendingRecord) pendingRecord.push(payload);
    return pendingRecord;
  }
  if (type === 4 && pendingRecord) {
    pendingRecord.push(payload);
    emit(Buffer.concat(pendingRecord));
    return null;
  }
  return pendingRecord;
}

function* readLogEntries(filePath) {
  let fileData;
  try {
    fileData = readFileSync(filePath);
  } catch {
    return;
  }

  let pos = 0;
  let pendingRecord = null;
  const completed = [];

  while (pos < fileData.length) {
    const blockEnd = Math.min(pos + LOG_BLOCK_SIZE, fileData.length);

    for (const { payload, type } of parseLogBlock(fileData, pos, blockEnd)) {
      pendingRecord = handleFragment(type, payload, pendingRecord, (buf) =>
        completed.push(buf),
      );
    }

    for (const buf of completed) {
      yield* parseWriteBatchEntries(buf);
    }
    completed.length = 0;

    pos = blockEnd;
  }
}

function* parseWriteBatchEntries(batchData) {
  if (batchData.length < 12) return;

  // WriteBatch header: sequence(8) + count(4)
  const count = readFixed32(batchData, 8);
  let pos = 12;

  for (let i = 0; i < count && pos < batchData.length; i++) {
    const tag = batchData[pos];
    pos++;

    if (tag === 1) {
      // Put
      const keyLen = readVarint(batchData, pos);
      pos += keyLen.bytesRead;
      if (pos + keyLen.value > batchData.length) break;
      const key = Buffer.from(batchData.subarray(pos, pos + keyLen.value));
      pos += keyLen.value;

      const valLen = readVarint(batchData, pos);
      pos += valLen.bytesRead;
      if (pos + valLen.value > batchData.length) break;
      const value = Buffer.from(batchData.subarray(pos, pos + valLen.value));
      pos += valLen.value;

      yield { key, value };
    } else if (tag === 0) {
      // Delete. Skip the key.
      const keyLen = readVarint(batchData, pos);
      pos += keyLen.bytesRead;
      pos += keyLen.value;
    } else {
      break;
    }
  }
}

/**
 * Read all key-value entries from a LevelDB directory.
 * Yields { key: Buffer, value: Buffer } for each entry.
 * Reads .ldb files (SSTables) and .log files (write-ahead log).
 *
 * @param {string} dir - path to the LevelDB directory
 * @yields {{ key: Buffer, value: Buffer }}
 */
export function* readAllEntries(dir) {
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return;
  }

  const ldbFiles = files
    .filter((f) => f.endsWith(".ldb"))
    .sort((a, b) => parseInt(a) - parseInt(b));

  for (const file of ldbFiles) {
    yield* readSstEntries(join(dir, file));
  }

  const logFiles = files
    .filter((f) => f.endsWith(".log"))
    .sort((a, b) => parseInt(a) - parseInt(b));

  for (const file of logFiles) {
    yield* readLogEntries(join(dir, file));
  }
}
