import { NextResponse, type NextRequest } from "next/server";

/**
 * Let Cloudflare's edge cache static pages.
 *
 * Next's prerendered pages send `cache-control: s-maxage=...` without
 * `public`, and Cloudflare only caches responses whose cache-control
 * allows it - so every hit re-runs the Worker (~500ms TTFB far from the
 * origin). Rewriting the header on the way out adds `public` so the HTML
 * is served straight from the nearest edge node.
 *
 * Scoped to the static pages only: the API routes (letters, audio, bake)
 * must never be cached at the edge.
 */

/** Paths that render a prerendered HTML shell. */
const CACHED_PAGES = ["/", "/editor", "/outbox", /^\/letter\/[\w-]+$/];

function isCacheablePage(pathname: string): boolean {
  return CACHED_PAGES.some((p) => (typeof p === "string" ? p === pathname : p.test(pathname)));
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (isCacheablePage(request.nextUrl.pathname)) {
    // s-maxage for the CDN, none for the browser: a stale HTML shell must
    // not survive a deploy (asset hashes change).
    response.headers.set("Cache-Control", "public, s-maxage=3600, max-age=0, must-revalidate");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|assets/).*)"],
};
