import type { D1Like } from "@/lib/letter/repository";
import type { R2Like } from "./uploadStore";

/** Bindings declared in wrangler.jsonc. */
export interface CloudflareBindings {
  DB?: D1Like;
  AUDIO?: R2Like;
}

/**
 * The Worker's bindings when running on Cloudflare (or `wrangler`-backed
 * preview); null under plain `next dev`, where local stores are used.
 */
export async function cloudflareBindings(): Promise<CloudflareBindings | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as CloudflareBindings;
  } catch {
    return null;
  }
}
