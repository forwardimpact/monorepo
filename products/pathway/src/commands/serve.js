/**
 * Serve Command
 *
 * Serves a Pathway build directory over HTTP with git smart HTTP routing
 * for APM pack installation (`apm install` uses `git clone --depth=1`).
 *
 * Static files are served directly. Three routes intercept git smart HTTP
 * requests and serve pre-computed responses from the `smart-http/`
 * subdirectory that `fit-pathway build` generates inside each pack repo.
 */

import { join } from "path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { createLogger } from "@forwardimpact/libtelemetry";

/**
 * Run the serve command.
 * @param {Object} params
 * @param {string} params.dir - Build output directory to serve
 * @param {Object} params.options - CLI options (port, host)
 */
export async function runServeCommand({ dir, options, runtime }) {
  const logger = createLogger("pathway", runtime);
  const port = Number(options.port) || 3000;
  const host = options.host || "0.0.0.0";

  const app = new Hono();

  // APM appends .git to repo URLs — strip it so both
  // /packs/apm/foo/ and /packs/apm/foo.git/ resolve to the same repo.
  app.use("/packs/apm/*", async (c, next) => {
    const url = new URL(c.req.url);
    if (url.pathname.includes(".git")) {
      url.pathname = url.pathname.replace(/\.git(?=\/|$)/, "");
      return c.redirect(url.pathname + url.search, 301);
    }
    return next();
  });

  // Smart HTTP ref advertisement — git checks this to detect smart HTTP
  app.get("/packs/apm/:name/info/refs", async (c) => {
    if (c.req.query("service") !== "git-upload-pack") {
      // Dumb HTTP — fall through to static file serving
      const filePath = join(
        dir,
        "packs",
        "apm",
        c.req.param("name"),
        "info",
        "refs",
      );
      try {
        const data = await runtime.fs.readFile(filePath);
        return c.body(data);
      } catch {
        return c.notFound();
      }
    }

    const name = c.req.param("name");
    const filePath = join(dir, "packs", "apm", name, "smart-http", "info-refs");
    try {
      const data = await runtime.fs.readFile(filePath);
      return c.body(data, 200, {
        "Content-Type": "application/x-git-upload-pack-advertisement",
      });
    } catch {
      return c.notFound();
    }
  });

  // Smart HTTP upload-pack — two-phase v1 stateless-rpc protocol.
  // Phase 1 (no "done" in body) gets the shallow list.
  // Phase 2 (has "done") gets NAK + pack data.
  app.post("/packs/apm/:name/git-upload-pack", async (c) => {
    const name = c.req.param("name");
    const body = await c.req.text();
    const file = body.includes("done")
      ? "upload-pack-result"
      : "upload-pack-shallow";
    const filePath = join(dir, "packs", "apm", name, "smart-http", file);
    try {
      const data = await runtime.fs.readFile(filePath);
      return c.body(data, 200, {
        "Content-Type": "application/x-git-upload-pack-result",
      });
    } catch {
      return c.notFound();
    }
  });

  // Everything else — static files
  app.use("/*", serveStatic({ root: dir }));

  serve({ fetch: app.fetch, port, hostname: host }, () => {
    logger.info(`
📡 Pathway site serving at http://${host === "0.0.0.0" ? "localhost" : host}:${port}
📁 Directory: ${dir}
🔧 Git smart HTTP enabled for /packs/apm/*/

Press Ctrl+C to stop.
`);
  });

  return new Promise(() => {});
}
