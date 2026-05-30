import { createLogger } from "@forwardimpact/libtelemetry";

const logger = createLogger("libdoc");

/**
 * Documentation server for serving built documentation and watching for changes
 */
export class PagesServer {
  #fs;
  #Hono;
  #serve;
  #builder;
  #watcher;
  #proc;

  /**
   * Creates a new PagesServer instance
   * @param {object} fs - File system module
   * @param {Function} HonoConstructor - Hono constructor (optional, required for serve())
   * @param {Function} serveFn - Hono serve function from @hono/node-server (optional, required for serve())
   * @param {import("./builder.js").PagesBuilder} builder - PagesBuilder instance
   * @param {{ runtime?: import("@forwardimpact/libutil/runtime").Runtime }} [opts] - Optional injected runtime bag
   */
  constructor(fs, HonoConstructor, serveFn, builder, opts) {
    if (!fs) throw new Error("fs is required");
    if (!builder) throw new Error("builder is required");

    this.#fs = fs;
    this.#Hono = HonoConstructor;
    this.#serve = serveFn;
    this.#builder = builder;
    this.#watcher = null;
    // Fall back to the ambient process when no runtime is injected (BC shim).
    this.#proc = opts?.runtime?.proc ?? process;
  }

  /**
   * Start watching for changes and rebuild
   * @param {string} pagesDir - Documentation directory to watch
   * @param {string} distDir - Distribution directory for output
   * @returns {void}
   */
  watch(pagesDir, distDir) {
    logger.info(`Watching for changes in ${pagesDir}...`);

    this.#watcher = this.#fs.watch(
      pagesDir,
      { recursive: true },
      (eventType, filename) => {
        if (
          filename &&
          (filename.endsWith(".md") ||
            filename.endsWith(".mustache") ||
            filename.startsWith("assets/"))
        ) {
          logger.info(`\nRebuilding due to change in ${filename}...`);
          this.#builder.build(pagesDir, distDir).catch((error) => {
            console.error("Build error:", error);
          });
        }
      },
    );

    // Keep process alive. Signal registration is inherently global — the
    // `runtime.proc` surface deliberately omits `.on` (like librpc's server) —
    // so SIGINT is wired on the ambient `process`; only the exit routes through
    // the injected `proc` so tests can observe it.
    process.on("SIGINT", () => {
      this.stopWatch();
      this.#proc.exit(0);
    });
  }

  /**
   * Stop watching for changes
   * @returns {void}
   */
  stopWatch() {
    if (this.#watcher) {
      this.#watcher.close();
      this.#watcher = null;
    }
  }

  /**
   * Serve static files from distribution directory
   * @param {string} distDir - Distribution directory to serve
   * @param {object} options - Server options
   * @param {number} options.port - Port to listen on
   * @param {string} options.hostname - Hostname to bind to
   * @returns {object} Server instance
   */
  serve(distDir, options = {}) {
    if (!this.#Hono) {
      throw new Error(
        "HonoConstructor is required for serve() - pass it to constructor",
      );
    }
    if (!this.#serve) {
      throw new Error(
        "serveFn is required for serve() - pass it to constructor",
      );
    }

    const { port = 3000, hostname = "0.0.0.0" } = options;

    const app = new this.#Hono();

    // Serve static files
    app.get("*", async (c) => {
      let filePath = c.req.path;

      // Default to index.html for root
      if (filePath === "/") {
        filePath = "/index.html";
      }

      // Remove leading slash and resolve path
      let fullPath = distDir + filePath;

      // Check if path is a directory and append index.html
      if (this.#fs.existsSync(fullPath)) {
        const stats = this.#fs.statSync(fullPath);
        if (stats.isDirectory()) {
          // Ensure we don't double up slashes
          fullPath = fullPath.replace(/\/$/, "") + "/index.html";
          filePath = filePath.replace(/\/$/, "") + "/index.html";
        }
      }

      // Check if file exists
      if (!this.#fs.existsSync(fullPath)) {
        return c.text("Not Found", 404);
      }

      // Read and serve file
      const content = this.#fs.readFileSync(fullPath);

      // Set content type based on extension
      const ext = filePath.split(".").pop();
      const contentTypes = {
        html: "text/html; charset=utf-8",
        css: "text/css; charset=utf-8",
        js: "application/javascript; charset=utf-8",
        json: "application/json; charset=utf-8",
        md: "text/markdown; charset=utf-8",
        xml: "application/xml; charset=utf-8",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
        ico: "image/x-icon",
      };

      const contentType = contentTypes[ext] || "text/plain; charset=utf-8";
      return c.body(content, 200, {
        "Content-Type": contentType,
      });
    });

    logger.info(`Serving documentation at http://${hostname}:${port}`);

    return this.#serve({ fetch: app.fetch, port, hostname });
  }
}
