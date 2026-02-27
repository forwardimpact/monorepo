import fs from "node:fs/promises";
import path from "node:path";

/**
 * @typedef {object} LogWriterConfig
 * @property {number} [maxFileSize] - Max file size in bytes before rotation (default: 1MB)
 * @property {number} [maxFiles] - Max number of archived files to keep (default: 10)
 * @property {boolean} [timestamp] - Whether to prepend ISO 8601 timestamps (default: true)
 */

/**
 * Reliable log writer with rotation, inspired by s6-log
 */
export class LogWriter {
  #logDir;
  #maxFileSize;
  #maxFiles;
  #timestamp;
  #currentSize;
  #writeQueue;
  #processing;

  /**
   * Creates a new LogWriter
   * @param {string} logDir - Directory for log files
   * @param {LogWriterConfig} [config] - Writer configuration
   */
  constructor(logDir, config = {}) {
    if (!logDir) throw new Error("logDir is required");
    this.#logDir = logDir;
    this.#maxFileSize = config.maxFileSize ?? 1_000_000;
    this.#maxFiles = config.maxFiles ?? 10;
    this.#timestamp = config.timestamp ?? true;
    this.#currentSize = 0;
    this.#writeQueue = [];
    this.#processing = false;
  }

  /**
   * Initializes the logger by ensuring the log directory exists
   * @returns {Promise<void>}
   */
  async init() {
    await fs.mkdir(this.#logDir, { recursive: true });
    await this.#loadCurrentSize();
  }

  /** Loads the current file size if it exists */
  async #loadCurrentSize() {
    try {
      const stats = await fs.stat(this.#currentPath());
      this.#currentSize = stats.size;
    } catch {
      this.#currentSize = 0;
    }
  }

  /**
   * Returns the path to the current log file
   * @returns {string} Path to current log file
   */
  #currentPath() {
    return path.join(this.#logDir, "current");
  }

  /**
   * Writes data to the log
   * @param {string|Buffer} data - Data to write
   * @returns {Promise<void>}
   */
  async write(data) {
    const text = typeof data === "string" ? data : data.toString("utf8");
    const lines = text.split("\n").filter((line) => line.length > 0);

    for (const line of lines) {
      const formatted = this.#timestamp
        ? `${new Date().toISOString()} ${line}\n`
        : `${line}\n`;
      this.#writeQueue.push(formatted);
    }

    await this.#processQueue();
  }

  /**
   * Processes the write queue
   * @returns {Promise<void>}
   */
  async #processQueue() {
    if (this.#processing) return;
    this.#processing = true;

    while (this.#writeQueue.length > 0) {
      const line = this.#writeQueue.shift();
      const bytes = Buffer.byteLength(line, "utf8");

      if (this.#currentSize + bytes > this.#maxFileSize) {
        await this.rotate();
      }

      await fs.appendFile(this.#currentPath(), line);
      this.#currentSize += bytes;
    }

    this.#processing = false;
  }

  /**
   * Forces log rotation
   * @returns {Promise<void>}
   */
  async rotate() {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    const archiveName = `@${timestamp}.s`;
    const archivePath = path.join(this.#logDir, archiveName);

    try {
      await fs.rename(this.#currentPath(), archivePath);
    } catch {
      // Current file may not exist
    }

    this.#currentSize = 0;
    await this.#pruneArchives();
  }

  /** Removes old archives beyond maxFiles limit */
  async #pruneArchives() {
    const entries = await fs.readdir(this.#logDir);
    const archives = entries
      .filter((name) => name.startsWith("@") && name.endsWith(".s"))
      .sort()
      .reverse();

    if (archives.length <= this.#maxFiles) return;

    const toDelete = archives.slice(this.#maxFiles);
    for (const name of toDelete) {
      await fs.unlink(path.join(this.#logDir, name));
    }
  }

  /**
   * Flushes pending writes and closes the logger
   * @returns {Promise<void>}
   */
  async close() {
    while (this.#writeQueue.length > 0 || this.#processing) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
