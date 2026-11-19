import { MAX_BEACON_BYTES, UMAMI_ORIGIN, beaconHeaders } from "@/lib/analytics/umamiProxy";

/** Page views and events from the tracker, forwarded to Umami Cloud (see umamiProxy.ts). */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length === 0 || body.length > MAX_BEACON_BYTES) {
    return new Response(null, { status: 400 });
  }
  try {
    const upstream = await fetch(`${UMAMI_ORIGIN}/api/send`, {
      method: "POST",
      headers: beaconHeaders(request.headers),
      body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    // Analytics must never break the page: the tracker ignores failures.
    return new Response(null, { status: 502 });
  }
}
