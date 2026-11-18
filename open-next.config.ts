import { defineCloudflareConfig } from "@opennextjs/cloudflare";
// Deep imports (not re-exported from the package root). Relative paths:
// the OpenNext config bundler (esbuild) does not resolve the package-name
// subpath under pnpm.
import r2IncrementalCache from "./node_modules/@opennextjs/cloudflare/dist/api/overrides/incremental-cache/r2-incremental-cache.js";
import { withRegionalCache } from "./node_modules/@opennextjs/cloudflare/dist/api/overrides/incremental-cache/regional-cache.js";

/**
 * Cache the prerendered pages.
 *
 * Without this the "incremental cache" is the dummy no-op: every request
 * re-runs the Worker's full render (x-nextjs-cache: MISS, ~500ms TTFB far
 * from the origin). With R2 as the store and the regional cache (the
 * Workers Cache API) in front, a data center serves its second request for
 * a page straight from the edge cache.
 *
 * Requires the NEXT_INC_CACHE_R2_BUCKET binding (wrangler.jsonc r2_buckets:
 * christmas-letters-cache).
 */
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: "long-lived",
  }),
});
