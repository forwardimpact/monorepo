import { createReadStream } from "node:fs";
import { createGunzip, createInflateRaw } from "node:zlib";

/**
 * Base extractor class with shared functionality
 * @private
 */
class BaseExtractor {
  #fs;
  #path;

  /**
   * Creates a new extractor with dependency injection
   * @param {object} fs - File system module (fs/promises)
   * @param {object} path - Path module
   */
  constructor(fs, path) {
    if (!fs) throw new Error("fs dependency is required");
    if (!path) throw new Error("path dependency is required");

    this.#fs = fs;
    this.#path = path;
  }

  /**
   * Check if file should be skipped (macOS resource forks, PAX headers)
   * @param {string} name - File name
   * @returns {boolean} True if file should be skipped
   * @private
   */
  _shouldSkipFile(name) {
    return name.includes("/._") || name.startsWith("._");
  }

  /**
   * Create directory with proper mode
   * @param {string} dirPath - Directory path
   * @param {number} [mode] - Directory mode (permissions)
   * @returns {Promise<void>}
   * @private
   */
  async _createDirectory(dirPath, mode) {
    await this.#fs.mkdir(dirPath, { recursive: true, mode });
  }

  /**
   * Write file with proper mode
   * @param {string} filePath - File path
   * @param {Buffer} content - File content
   * @param {number} [mode] - File mode (permissions)
   * @returns {Promise<void>}
   * @private
   */
  async _writeFile(filePath, content, mode) {
    await this.#fs.mkdir(this.#path.dirname(filePath), { recursive: true });
    await this.#fs.writeFile(filePath, content, { mode });
  }

  /**
   * Join paths safely
   * @param {...string} paths - Path segments to join
   * @returns {string} Joined path
   * @private
   */
  _joinPath(...paths) {
    return this.#path.join(...paths);
  }

  /**
   * Read 16-bit little-endian unsigned integer from buffer
   * @param {Buffer} buffer - Source buffer
   * @param {number} offset - Offset position
   * @returns {number} Unsigned 16-bit integer
   * @private
   */
  _readUInt16LE(buffer, offset) {
    return buffer.readUInt16LE(offset);
  }

  /**
   * Read 32-bit little-endian unsigned integer from buffer
   * @param {Buffer} buffer - Source buffer
   * @param {number} offset - Offset position
   * @returns {number} Unsigned 32-bit integer
   * @private
   */
  _readUInt32LE(buffer, offset) {
    return buffer.readUInt32LE(offset);
  }

  /**
   * Read null-terminated string from buffer
   * @param {Buffer} buffer - Source buffer
   * @param {number} start - Start position
   * @param {number} length - Maximum length to read
   * @returns {string} Extracted string
   * @private
   */
  _readString(buffer, start, length) {
    const slice = buffer.slice(start, start + length);
    const nullIndex = slice.indexOf(0);
    return slice
      .slice(0, nullIndex > -1 ? nullIndex : length)
      .toString("utf-8");
  }
}

/**
 * Simple TAR file extractor for .tar.gz files
 * Implements native Node.js TAR format parsing without external dependencies
 */
export class TarExtractor extends BaseExtractor {
  /**
   * Extract a .tar.gz file to specified directory
   * @param {string} tarGzPath - Path to the .tar.gz file
   * @param {string} outputDir - Directory to extract files to
   * @returns {Promise<void>}
   */
  async extract(tarGzPath, outputDir) {
    // Decompress and collect chunks
    const chunks = [];
    const input = createReadStream(tarGzPath).pipe(createGunzip());
    for await (const chunk of input) chunks.push(chunk);

    // Parse TAR format
    const buffer = Buffer.concat(chunks);
    for (let offset = 0; offset < buffer.length; ) {
      const header = buffer.slice(offset, offset + 512);

      // Check for end of archive (zero block)
      if (header.every((byte) => byte === 0)) break;

      // Parse header fields
      const name = this._readString(header, 0, 100);
      const mode = parseInt(this._readString(header, 100, 8), 8);
      const size = parseInt(this._readString(header, 124, 12), 8);
      const typeFlag = header[156];

      offset += 512;

      if (size > 0) {
        const blockSize = Math.ceil(size / 512) * 512;

        // Skip unwanted files (PAX headers, macOS resource forks)
        if (this._shouldSkipFile(name) || typeFlag === 120 || typeFlag === 88) {
          offset += blockSize;
          continue;
        }

        const content = buffer.slice(offset, offset + size);

        if (typeFlag === 53) {
          // Directory
          await this._createDirectory(this._joinPath(outputDir, name), mode);
        } else {
          // Regular file
          await this._writeFile(this._joinPath(outputDir, name), content, mode);
        }

        offset += blockSize;
      }
    }
  }
}

/**
 * Simple ZIP file extractor for .zip files
 * Implements native Node.js ZIP format parsing without external dependencies
 */
export class ZipExtractor extends BaseExtractor {
  /**
   * Extract a .zip file to specified directory
   * @param {string} zipPath - Path to the .zip file
   * @param {string} outputDir - Directory to extract files to
   * @returns {Promise<void>}
   */
  async extract(zipPath, outputDir) {
    // Read entire ZIP file into buffer
    const chunks = [];
    const input = createReadStream(zipPath);
    for await (const chunk of input) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    // Find End of Central Directory Record (EOCD)
    const eocdOffset = this.#findEOCD(buffer);
    if (eocdOffset === -1) {
      throw new Error("Invalid ZIP file: End of Central Directory not found");
    }

    // Parse EOCD to get central directory location
    const centralDirOffset = this._readUInt32LE(buffer, eocdOffset + 16);
    const entryCount = this._readUInt16LE(buffer, eocdOffset + 10);

    // Parse central directory entries
    let offset = centralDirOffset;
    for (let i = 0; i < entryCount; i++) {
      // Verify central directory file header signature (0x02014b50)
      if (this._readUInt32LE(buffer, offset) !== 0x02014b50) {
        throw new Error("Invalid central directory file header");
      }

      // Parse central directory header fields
      const compressionMethod = this._readUInt16LE(buffer, offset + 10);
      const compressedSize = this._readUInt32LE(buffer, offset + 20);
      const fileNameLength = this._readUInt16LE(buffer, offset + 28);
      const extraFieldLength = this._readUInt16LE(buffer, offset + 30);
      const fileCommentLength = this._readUInt16LE(buffer, offset + 32);
      const externalAttrs = this._readUInt32LE(buffer, offset + 38);
      const localHeaderOffset = this._readUInt32LE(buffer, offset + 42);

      // Extract file name
      const fileName = buffer
        .slice(offset + 46, offset + 46 + fileNameLength)
        .toString("utf-8");

      // Skip to next entry
      offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;

      // Skip unwanted files
      if (this._shouldSkipFile(fileName)) continue;

      // Check if it's a directory (trailing slash or directory bit set)
      const isDirectory =
        fileName.endsWith("/") || (externalAttrs & 0x10) === 0x10;

      if (isDirectory) {
        // Extract Unix permissions from external attributes (high 16 bits)
        const mode = (externalAttrs >>> 16) & 0o777;
        await this._createDirectory(
          this._joinPath(outputDir, fileName),
          mode || 0o755,
        );
      } else {
        // Extract file content from local file header
        const content = await this.#extractFileContent(
          buffer,
          localHeaderOffset,
          compressionMethod,
          compressedSize,
        );

        // Extract Unix permissions from external attributes (high 16 bits)
        const mode = (externalAttrs >>> 16) & 0o777;
        await this._writeFile(
          this._joinPath(outputDir, fileName),
          content,
          mode || 0o644,
        );
      }
    }
  }

  /**
   * Find End of Central Directory Record
   * @param {Buffer} buffer - ZIP file buffer
   * @returns {number} Offset of EOCD or -1 if not found
   * @private
   */
  #findEOCD(buffer) {
    // EOCD signature is 0x06054b50
    // Search from end of file backwards (EOCD is at the end)
    const signature = 0x06054b50;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (this._readUInt32LE(buffer, i) === signature) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Extract file content from local file header
   * @param {Buffer} buffer - ZIP file buffer
   * @param {number} offset - Local file header offset
   * @param {number} compressionMethod - Compression method (0=store, 8=deflate)
   * @param {number} compressedSize - Compressed size
   * @returns {Promise<Buffer>} File content
   * @private
   */
  async #extractFileContent(buffer, offset, compressionMethod, compressedSize) {
    // Verify local file header signature (0x04034b50)
    if (this._readUInt32LE(buffer, offset) !== 0x04034b50) {
      throw new Error("Invalid local file header");
    }

    // Get file name and extra field lengths from local header
    const fileNameLength = this._readUInt16LE(buffer, offset + 26);
    const extraFieldLength = this._readUInt16LE(buffer, offset + 28);

    // Calculate data offset (skip header, file name, and extra field)
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    // Extract compressed data
    const compressedData = buffer.slice(
      dataOffset,
      dataOffset + compressedSize,
    );

    // Decompress based on compression method
    if (compressionMethod === 0) {
      // Stored (no compression)
      return compressedData;
    } else if (compressionMethod === 8) {
      // DEFLATE compression
      return await this.#inflateData(compressedData);
    } else {
      throw new Error(`Unsupported compression method: ${compressionMethod}`);
    }
  }

  /**
   * Inflate compressed data using DEFLATE
   * @param {Buffer} compressedData - Compressed data
   * @returns {Promise<Buffer>} Decompressed data
   * @private
   */
  async #inflateData(compressedData) {
    const chunks = [];
    const inflate = createInflateRaw();

    inflate.write(compressedData);
    inflate.end();

    for await (const chunk of inflate) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }
}
