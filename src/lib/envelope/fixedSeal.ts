import type { Seal } from "@/lib/letter/model";

/**
 * The first version has one seal: red wax, snowflake stamp. Letters already
 * sent keep whatever seal they were sealed with.
 */
export const FIXED_SEAL: Readonly<Seal> = Object.freeze({ color: "red", stamp: "snowflake" });
