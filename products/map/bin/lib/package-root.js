/**
 * Resolve the Map package root from import.meta.url.
 *
 * Returns the directory containing `package.json` and `supabase/` —
 * i.e. the installed `@forwardimpact/map` directory, whether it lives
 * in a consumer's `node_modules/` or in `products/map/` during monorepo
 * development.
 */

import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getPackageRoot() {
  // bin/lib/package-root.js → ../../ is the package root
  return resolve(__dirname, "..", "..");
}

export function getSupabaseDir() {
  return resolve(getPackageRoot(), "supabase");
}
