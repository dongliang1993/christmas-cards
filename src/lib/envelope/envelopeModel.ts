import type * as THREE from "three";
import type { EnvelopeColor, SealColor } from "@/lib/letter/model";

/**
 * Envelope and wax colours. The envelope itself is built in paperEnvelope.ts
 * and the wax in waxSeal.ts (envelope spec §6).
 */
export const ENVELOPE_PAPER: Record<EnvelopeColor, { paper: string; ink: string }> = {
  ivory: { paper: "#f1e9dc", ink: "#3a2f28" },
  kraft: { paper: "#c6a682", ink: "#3b2a1c" },
  sage: { paper: "#b7c4ad", ink: "#2c3a2a" },
  midnight: { paper: "#2d3a52", ink: "#efe6d4" },
};

/** Letters already sent may carry any of these; new ones are red (fixedSeal.ts). */
export const WAX: Record<SealColor, { color: string; metalness: number }> = {
  red: { color: "#8f1d1d", metalness: 0.05 },
  green: { color: "#2c5639", metalness: 0.05 },
  gold: { color: "#b8892e", metalness: 0.75 },
  navy: { color: "#22324f", metalness: 0.05 },
};

export interface SealParts {
  group: THREE.Group;
  halves: [THREE.Mesh, THREE.Mesh];
  material: THREE.MeshPhysicalMaterial[];
  /** Splitting planes in world space; re-aim when the seal moves. */
  planes: [THREE.Plane, THREE.Plane];
  dispose(): void;
}
