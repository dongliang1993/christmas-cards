import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prebakedManifestSchema } from "@/lib/prebakedManifest";
import { CARD_TEMPLATES } from "@/lib/templates";
import type { ApiResponse } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Dev-only companion of /dev/bake: writes a card's prebaked surfaces into
 * public/assets/cards/<id>/baked/. Everything is validated against the card
 * whitelist and the manifest's own file names (plain lowercase .webp names),
 * so no path or file outside that directory can be written. Always 403 in
 * production.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ success: false, error: "dev only" } satisfies ApiResponse<never>, { status: 403 });
  }
  try {
    const form = await request.formData();
    const card = String(form.get("card") ?? "");
    if (!CARD_TEMPLATES.some((t) => t.id === card)) {
      return Response.json({ success: false, error: "unknown card" }, { status: 400 });
    }
    const manifest = prebakedManifestSchema.parse(JSON.parse(String(form.get("manifest") ?? "null")));
    if (manifest.card !== card) {
      return Response.json({ success: false, error: "manifest card mismatch" }, { status: 400 });
    }

    const allowed = new Set<string>();
    for (const entry of manifest.entries) {
      if ("src" in entry) allowed.add(entry.src);
      else {
        allowed.add(entry.normal);
        allowed.add(entry.surface);
      }
    }

    const files = new Map<string, File>();
    for (const [name, value] of form.entries()) {
      if (name === "card" || name === "manifest") continue;
      if (!(value instanceof File) || !allowed.has(name)) {
        return Response.json({ success: false, error: `unexpected file: ${name}` }, { status: 400 });
      }
      files.set(name, value);
    }
    const missing = [...allowed].filter((name) => !files.has(name));
    if (missing.length) {
      return Response.json({ success: false, error: `missing files: ${missing.join(", ")}` }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "public", "assets", "cards", card, "baked");
    await mkdir(dir, { recursive: true });
    for (const [name, file] of files) {
      await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
    }
    await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    return Response.json({
      success: true,
      data: { directory: `public/assets/cards/${card}/baked`, files: [...allowed, "manifest.json"] },
    } satisfies ApiResponse<{ directory: string; files: string[] }>);
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
