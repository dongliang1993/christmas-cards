import { UMAMI_ORIGIN } from "@/lib/analytics/umamiProxy";

/** The Umami tracker, served from our own domain (see umamiProxy.ts). */
export async function GET(): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(`${UMAMI_ORIGIN}/script.js`);
  } catch {
    return new Response("// analytics unavailable", { status: 502, headers: { "content-type": "application/javascript" } });
  }
  if (!upstream.ok) {
    return new Response("// analytics unavailable", { status: 502, headers: { "content-type": "application/javascript" } });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // A day at the edge and in the browser, like Umami's own CDN.
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
