import * as THREE from "three";
import type { PaperStock } from "@/lib/letter/model";

export interface PaperPreset {
  label: string;
  /** Multiplied over the page texture (which is already a pale paper). */
  tint: string;
  roughness: number;
  iridescence: number;
  /** Strength of the cold-press tooth normal map. */
  tooth: number;
}

/** The three card stocks (spec §4.2, §9). They change the inside pages and edges. */
export const PAPER_STOCKS: Record<PaperStock, PaperPreset> = {
  "cold-press": { label: "冷压水彩纸", tint: "#ffffff", roughness: 0.86, iridescence: 0, tooth: 0.9 },
  kraft: { label: "牛皮纸", tint: "#b79d82", roughness: 0.92, iridescence: 0, tooth: 1.25 },
  pearl: { label: "珠光卡纸", tint: "#fbf6f8", roughness: 0.5, iridescence: 0.55, tooth: 0.45 },
};

const TINT_KEY = "paperTint";

/** The stock's tint, kept apart from `color`, which the page shading darkens. */
export function paperTintOf(material: THREE.Material): THREE.Color {
  const tint = material.userData[TINT_KEY];
  return tint instanceof THREE.Color ? tint : new THREE.Color(0xffffff);
}

export function applyPaperStock(materials: THREE.MeshPhysicalMaterial[], stock: PaperStock): void {
  const preset = PAPER_STOCKS[stock];
  const tint = new THREE.Color(preset.tint);
  for (const m of materials) {
    m.userData[TINT_KEY] = tint.clone();
    m.color.copy(tint);
    m.roughness = preset.roughness;
    m.iridescence = preset.iridescence;
    m.iridescenceIOR = 1.35;
    m.normalScale.setScalar(preset.tooth);
    m.needsUpdate = true;
  }
}
