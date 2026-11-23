/**
 * Same-origin proxy for Umami Cloud.
 *
 * The tracker script and its beacons go through /stats on our own domain:
 * cloud.umami.is may be slow or blocked for visitors in mainland China, and
 * ad blockers drop requests to known analytics hosts.
 *
 * Umami counts unique visitors by hashing the client IP with the user agent,
 * so the proxy must hand both on. Umami Cloud reads the real visitor IP from
 * `x-umami-client-ip` (its header for exactly this case); without it every
 * visitor would look like our Worker.
 *
 * Analytics are optional: with no NEXT_PUBLIC_UMAMI_WEBSITE_ID the tracker is
 * never injected (src/app/layout.tsx) and the /stats routes go unused.
 */

export const UMAMI_ORIGIN = "https://cloud.umami.is";

/** Your Umami website id (public: it ships in the page). Empty disables tracking. */
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? "";

/** Where the tracker lives on our domain; it posts to `${STATS_PATH}/api/send`. */
export const STATS_PATH = "/stats";

/** Only this domain is counted: local dev and previews stay out. */
export const TRACKED_DOMAIN = process.env.NEXT_PUBLIC_TRACKED_DOMAIN ?? "";

/** A beacon is a few hundred bytes; anything far larger is not one. */
export const MAX_BEACON_BYTES = 16 * 1024;

/** Headers for the beacon forwarded to Umami, carrying the visitor's identity. */
export function beaconHeaders(incoming: Headers): Headers {
  const out = new Headers({ "content-type": "application/json" });
  const ua = incoming.get("user-agent");
  if (ua) out.set("user-agent", ua);
  const lang = incoming.get("accept-language");
  if (lang) out.set("accept-language", lang);
  const ip = incoming.get("cf-connecting-ip") ?? incoming.get("x-real-ip") ?? firstForwarded(incoming);
  if (ip) out.set("x-umami-client-ip", ip);
  return out;
}

function firstForwarded(h: Headers): string | null {
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : null;
}
