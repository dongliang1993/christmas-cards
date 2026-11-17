import type { StampId } from "@/lib/letter/model";

/**
 * Stamp designs as SVG path data in a 100×100 box, centred on (50, 50).
 * Drawn into a height map and debossed into the wax (spec §4.5, §9).
 */
const PATHS: Record<Exclude<StampId, "initials">, string> = {
  snowflake:
    "M50 10 L50 90 M15.4 30 L84.6 70 M15.4 70 L84.6 30 M50 22 L42 14 M50 22 L58 14 M50 78 L42 86 M50 78 L58 86 M25 36 L14 38 M25 36 L22 25 M75 64 L86 62 M75 64 L78 75 M25 64 L22 75 M25 64 L14 62 M75 36 L78 25 M75 36 L86 38",
  star: "M50 8 L60 38 L92 38 L66 57 L76 88 L50 69 L24 88 L34 57 L8 38 L40 38 Z",
  holly:
    "M50 52 C38 40 22 42 14 30 C26 30 30 22 30 14 C40 24 48 34 50 52 Z M50 52 C62 40 78 42 86 30 C74 30 70 22 70 14 C60 24 52 34 50 52 Z M44 62 A8 8 0 1 0 44.1 62 M58 64 A8 8 0 1 0 58.1 64 M51 76 A8 8 0 1 0 51.1 76",
  reindeer:
    "M50 86 C40 86 36 74 38 62 C30 58 30 50 36 48 C38 40 44 36 50 36 C56 36 62 40 64 48 C70 50 70 58 62 62 C64 74 60 86 50 86 Z M40 38 L32 18 M32 18 L22 14 M32 18 L30 8 M36 28 L26 28 M60 38 L68 18 M68 18 L78 14 M68 18 L70 8 M64 28 L74 28",
  gift: "M18 40 H82 V86 H18 Z M14 30 H86 V42 H14 Z M50 30 V86 M50 30 C44 18 30 16 32 26 C34 32 44 30 50 30 C56 30 66 32 68 26 C70 16 56 18 50 30",
};

export function stampPath(id: Exclude<StampId, "initials">): string {
  return PATHS[id];
}

/** Paths that are lines (snowflake, antlers) are stroked; shapes are filled. */
export function stampIsStroked(id: Exclude<StampId, "initials">): boolean {
  return id === "snowflake";
}
