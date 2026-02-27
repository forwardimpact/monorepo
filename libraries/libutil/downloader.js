/**
 * BundleDownloader utility for retrieving and extracting bundle.tar.gz from remote storage.
 * Used to download generated code bundles in containerized deployments.
 */
export class BundleDownloader {
  #storageFactory;
  #finder;
  #logger;
  #extractor;
  #process;
  #local;
  #remote;
  #initialized;

  /**
   * Creates a new download instance with dependency injection
   * @param {Function} createStorageFn - Storage creation function
   * @param {object} finder - Finder instance for symlink management
   * @param {object} logger - Logger instance
   * @param {object} extractor - TarExtractor instance for archive extraction
   * @param {object} process - Process environment access (for testing)
   */
  constructor(
    createStorageFn,
    finder,
    logger,
    extractor,
    process = global.process,
  ) {
    if (!createStorageFn) throw new Error("createStorageFn is required");
    if (!finder) throw new Error("finder is required");
    if (!logger) throw new Error("logger is required");
    if (!extractor) throw new Error("extractor is required");
    if (!process) throw new Error("process is required");

    this.#storageFactory = createStorageFn;
    this.#finder = finder;
    this.#logger = logger;
    this.#extractor = extractor;
    this.#process = process;
    this.#local = null;
    this.#remote = null;
    this.#initialized = false;
  }

  /**
   * Initialize storage instances for download operations
   * @returns {Promise<void>}
   */
  async initialize() {
    // Initialize storage instances for the "generated" prefix
    this.#local = this.#storageFactory("generated", "local", this.#process);
    this.#remote = this.#storageFactory("generated", "s3", this.#process);

    // Ensure directory and create symlinks for packages
    await this.#local.ensureBucket();
    const generatedPath = this.#local.path();
    await this.#finder.createPackageSymlinks(generatedPath);

    this.#initialized = true;
  }

  /**
   * Download bundle.tar.gz from remote storage and extract to local storage
   * Only downloads if STORAGE_TYPE is "s3"
   * Automatically initializes storage instances if not already initialized
   * @returns {Promise<void>}
   */
  async download() {
    // Auto-initialize if not already initialized
    if (!this.#initialized) await this.initialize();

    const storageType = this.#process.env.STORAGE_TYPE || "local";

    if (storageType === "local") {
      this.#logger.debug(
        "BundleDownloader",
        "Download skipped, using local storage",
      );
      return;
    }

    const key = "bundle.tar.gz";

    // Check if bundle exists in remote storage
    const exists = await this.#remote.exists(key);
    if (!exists) throw new Error(`Bundle not found`);

    const data = await this.#remote.get(key);
    await this.#local.put(key, data);
    await this.#extractBundle(key);
    await this.#local.delete(key);

    this.#logger.debug("BundleDownloader", "Download completed", { key });
  }

  /**
   * Extract bundle.tar.gz to local storage using TarExtractor
   * @param {string} key - Bundle file key in local storage
   * @returns {Promise<void>}
   * @private
   */
  async #extractBundle(key) {
    const path = this.#local.path(key);
    const dir = this.#local.path();
    await this.#extractor.extract(path, dir);
  }
}
