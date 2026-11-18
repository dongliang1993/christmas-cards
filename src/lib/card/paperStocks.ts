import * as THREE from "three";
import type { PaperStock } from "@/lib/letter/model";

export interface PaperPreset {
  label: string;
  /** Multiplied over the page texture (which is already a pale paper). */
  tint: string;
  /** Flat colour for the panel swatch. */
  swatch: string;
  /** A small texture laid over the swatch, so the stock reads as paper. */
  grain: string;
  roughness: number;
  iridescence: number;
  /** Strength of the cold-press tooth normal map. */
  tooth: number;
}

/** Speckled tooth, drawn as a data-uri so the swatch needs no asset. */
function grain(dots: string, tint: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'>${dots}<rect width='28' height='28' fill='${tint}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** The three card stocks (spec §4.2, §9). They change the inside pages and edges. */
const SPECKS = "<circle cx='4' cy='6' r='0.7' fill='%23000' opacity='0.18'/><circle cx='15' cy='4' r='0.5' fill='%23fff' opacity='0.5'/><circle cx='22' cy='16' r='0.8' fill='%23000' opacity='0.14'/><circle cx='9' cy='20' r='0.6' fill='%23fff' opacity='0.4'/><circle cx='18' cy='24' r='0.5' fill='%23000' opacity='0.16'/>";

export const PAPER_STOCKS: Record<PaperStock, PaperPreset> = {
  "cold-press": { label: "冷压水彩纸", tint: "#ffffff", swatch: "#f4f0ea", grain: grain(SPECKS, "none"), roughness: 0.86, iridescence: 0, tooth: 0.9 },
  kraft: { label: "牛皮纸", tint: "#b79d82", swatch: "#c4a98a", grain: grain(SPECKS, "none"), roughness: 0.92, iridescence: 0, tooth: 1.25 },
  pearl: { label: "珠光卡纸", tint: "#fbf6f8", swatch: "#f7eef2", grain: grain("<rect x='0' y='12' width='28' height='1' fill='%23fff' opacity='0.7'/>", "none"), roughness: 0.5, iridescence: 0.55, tooth: 0.45 },
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
