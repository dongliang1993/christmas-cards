import * as THREE from "three";
import { CARD_ASSETS } from "../cardAssets";
import { baseSurface, cardBakes, LAYER_BAKE_SCALE, layerSurface, type loadLayers } from "../cardBakes";
import { captureBendBuffers, type BendBuffers } from "../cardBend";
import { CARD_H, CARD_THICKNESS, CARD_W } from "../cardConstants";
import type { CoverSurface, SurfaceImage } from "../cardRelief";
import {
  createBackCanvas,
  createBlankSheetCanvas,
  createInsideLeftCanvas,
  createInsideRightBaseCanvas,
  createInsideRightSheetCanvas,
  extractMotifCanvas,
} from "../cardTextures";
import { decodeImages, isPreflipped } from "../gpuImages";
import type { LampGate } from "../lampGate";
import type { CardTemplateId } from "../types";

/**
 * What a card puts on a card body, built once and cached (see cardBody).
 * Split in two: the face (cover side, what every real card in the hand
 * shows) and the inside (only the card in front can be opened).
 */

export function makeTexture(source: SurfaceImage, anisotropy: number, isColor = true): THREE.Texture {
  // Every SurfaceImage is a valid texture source at runtime (canvas, image,
  // ImageBitmap); three's own typings are narrower than the WebGL reality.
  const tex = new THREE.Texture(source as HTMLCanvasElement);
  // A decoded bitmap carries its flip already (see lib/gpuImages).
  if (isPreflipped(source)) tex.flipY = false;
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** A baked relief's two images. */
export function surfaceImages(s: CoverSurface): SurfaceImage[] {
  return [s.normal, s.surface];
}

type TextureSlot = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "alphaMap";
const TEXTURE_SLOTS: readonly TextureSlot[] = ["map", "normalMap", "roughnessMap", "metalnessMap", "alphaMap"];

/** The textures a material samples (or the texture itself). */
export function materialTextures(o: unknown): THREE.Texture[] {
  if (o instanceof THREE.Texture) return [o];
  if (!(o instanceof THREE.Material)) return [];
  const slots = o as Partial<Record<TextureSlot, THREE.Texture | null>>;
  return TEXTURE_SLOTS.map((k) => slots[k]).filter((t): t is THREE.Texture => t instanceof THREE.Texture);
}

/** A baked relief, uploaded: a normal map and a metalness/roughness map. */
export interface SurfaceTextures {
  normal: THREE.Texture;
  surface: THREE.Texture;
}

export function surfaceTextures(baked: CoverSurface, anisotropy: number): SurfaceTextures {
  return {
    normal: makeTexture(baked.normal, anisotropy, false),
    surface: makeTexture(baked.surface, anisotropy, false),
  };
}

/** Put a relief on a paper material (paint relief + gloss). */
export function putSurface(mat: THREE.MeshStandardMaterial, s: SurfaceTextures): void {
  mat.normalMap = s.normal;
  mat.normalScale.set(1, 1);
  mat.roughnessMap = s.surface;
  mat.metalnessMap = s.surface;
  mat.roughness = 1;
  mat.metalness = 1;
}

/* ── Raised pieces ── */

export interface RuntimeLiftedMesh {
  mesh: THREE.Mesh;
  baseZ: number;
  bob: number;
  twinkle: boolean;
  phase: number;
  impulse: number;
  texture: THREE.Texture;
  material: THREE.MeshStandardMaterial;
  geometry: THREE.PlaneGeometry;
  /**
   * "lifted": a cutout from the cover; its material goes back to the pool.
   * "layer": a paper-cut piece with its own image, relief and backing; disposed.
   */
  kind: "lifted" | "layer";
  /** Anything else the piece owns (relief maps, its backing's material). */
  owned: Array<{ dispose(): void }>;
  /** Its unbent vertices: it bows with the cover each frame, so the cover never cuts through it. */
  bend: BendBuffers;
}

/** Strips across a raised piece, so it can follow the cover's bow. */
const LIFT_SEGMENTS = 16;

/**
 * A raised piece's quad in the cover box's own frame (x -W/2..W/2 from the
 * spine, z from the box centre), centred at card-pivot (cx, cy), `lift` above
 * the cover's face: the frame applyBow bends, so the piece bends with it.
 */
function liftedGeometry(w: number, h: number, cx: number, cy: number, lift: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h, LIFT_SEGMENTS, 1);
  geo.translate(cx - CARD_W / 2, cy, CARD_THICKNESS / 2 + lift);
  return geo;
}

/** A paper-cut piece's backing: a shade darker, a hair behind, so a tilt shows the cut edge. */
const LAYER_BACKING_DEPTH = 0.0028;
const LAYER_BACKING_TONE = new THREE.Color(0.74, 0.7, 0.64);

/** Shared by everything that builds kits. */
export interface KitContext {
  maxAnisotropy: number;
  lampGate: LampGate;
  paperNormalTex: THREE.Texture;
  /**
   * Cutout materials kept between cards. Disposing them freed their shader
   * programs, so every switch recompiled two programs mid fly-in (the
   * stutter); reusing them only swaps the texture.
   */
  liftedMatPool: THREE.MeshStandardMaterial[];
}

function newCutoutMaterial(ctx: KitContext): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    transparent: true,
    alphaTest: 0.08,
    roughness: 0.8,
    normalMap: ctx.paperNormalTex,
    normalScale: new THREE.Vector2(0.8, 0.8),
    emissiveIntensity: 0,
  });
  // A raised piece: the pointer lamp always plays on it.
  ctx.lampGate.install(m, 1);
  return m;
}

/** Raised 3D cutouts cropped from the cover art. Materials come from the pool. */
function buildCutouts(ctx: KitContext, templateId: CardTemplateId, coverImg: HTMLImageElement): RuntimeLiftedMesh[] {
  const spec = CARD_ASSETS[templateId];
  return spec.lifted.map((l, idx) => {
    const tex = makeTexture(extractMotifCanvas(coverImg, l.box), ctx.maxAnisotropy);
    const geo = liftedGeometry(
      (l.box[2] / spec.w) * CARD_W,
      (l.box[3] / spec.h) * CARD_H,
      ((l.box[0] + l.box[2] / 2) / spec.w) * CARD_W,
      (0.5 - (l.box[1] + l.box[3] / 2) / spec.h) * CARD_H,
      l.lift,
    );
    const mat = ctx.liftedMatPool.pop() ?? newCutoutMaterial(ctx);
    // Same features every time (a map, a normal map): no recompile.
    mat.map = tex;
    mat.emissive.setHex(l.twinkle ? 0xffe4a0 : 0x000000);
    mat.emissiveIntensity = 0;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return {
      mesh,
      baseZ: l.lift,
      bob: l.bob,
      twinkle: Boolean(l.twinkle),
      phase: idx * 1.7,
      impulse: 0,
      texture: tex,
      material: mat,
      geometry: geo,
      kind: "lifted" as const,
      owned: [],
      bend: captureBendBuffers(geo),
    };
  });
}

/** A paper-cut piece's face: its own relief and gold foil. */
function newPieceMaterial(lampGate: LampGate, map: THREE.Texture, relief: SurfaceTextures): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap: relief.normal,
    metalnessMap: relief.surface,
    roughnessMap: relief.surface,
    metalness: 1,
    roughness: 1,
    // Opaque with a cutout: no transparent sorting against the snow to flip mid-swing.
    alphaTest: 0.5,
  });
  lampGate.install(mat, 1); // a raised paper piece: the lamp plays on it
  return mat;
}

/** A paper-cut piece's cut edge: plain paper behind it. */
function newBackingMaterial(lampGate: LampGate, map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, color: LAYER_BACKING_TONE, roughness: 0.9, alphaTest: 0.5 });
  lampGate.install(mat); // the cut edge is paper
  return mat;
}

/** A piece with its backing just behind it, both casting shadows. */
function pieceMesh(geo: THREE.BufferGeometry, mat: THREE.Material, backingMat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const backing = new THREE.Mesh(geo, backingMat);
  backing.position.z = -LAYER_BACKING_DEPTH;
  backing.castShadow = true;
  mesh.add(backing);
  return mesh;
}

/**
 * A program's first draw is costly on its own (three reads the link log and
 * the uniforms; ~100 ms on macOS), and compileAsync doesn't cover it. Paper-cut
 * pieces are the only materials no card had drawn before, so the first such
 * card stalled as it landed. Draw them once while the page is still loading,
 * from a speck at the card's centre, and keep the materials so their programs
 * stay cached. Returns a dispose for unmount.
 */
export function warmPieceMaterials(parent: THREE.Object3D, lampGate: LampGate, tex: THREE.Texture): () => void {
  const pieceMat = newPieceMaterial(lampGate, tex, { normal: tex, surface: tex });
  const backingMat = newBackingMaterial(lampGate, tex);
  const geo = new THREE.PlaneGeometry(1e-4, 1e-4);
  const speck = pieceMesh(geo, pieceMat, backingMat);
  parent.add(speck);
  // A few frames is plenty for one draw (and one shadow pass).
  let frames = WARM_FRAMES;
  let raf = 0;
  const tick = () => {
    frames -= 1;
    if (frames > 0) raf = requestAnimationFrame(tick);
    else speck.removeFromParent();
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    speck.removeFromParent();
    geo.dispose();
    pieceMat.dispose();
    backingMat.dispose();
  };
}

const WARM_FRAMES = 4;

export type LayeredCover = Awaited<ReturnType<typeof loadLayers>>;

/** Paper-cut pieces: each its own image, relief and gold foil, raised to its own height. */
function buildPaperCutPieces(
  ctx: KitContext,
  templateId: CardTemplateId,
  layered: LayeredCover,
  reliefs: CoverSurface[],
  up: <S>(s: S) => S,
): RuntimeLiftedMesh[] {
  const spec = CARD_ASSETS[templateId];
  return (layered?.items ?? []).map(({ spec: it, img }, idx) => {
    const [bx, by, bw] = it.box;
    const bh = (bw * img.height) / img.width;
    const geo = liftedGeometry(
      (bw / spec.w) * CARD_W,
      (bh / spec.h) * CARD_H,
      ((bx + bw / 2) / spec.w) * CARD_W,
      (0.5 - (by + bh / 2) / spec.h) * CARD_H,
      it.lift,
    );
    const map = makeTexture(up(img), ctx.maxAnisotropy);
    const relief = surfaceTextures(reliefs[idx], ctx.maxAnisotropy);
    const mat = newPieceMaterial(ctx.lampGate, map, relief);
    const backingMat = newBackingMaterial(ctx.lampGate, map);
    const mesh = pieceMesh(geo, mat, backingMat);
    return {
      mesh,
      baseZ: it.lift,
      bob: it.bob ?? 0,
      twinkle: false,
      phase: idx * 1.3,
      impulse: 0,
      texture: map,
      material: mat,
      geometry: geo,
      kind: "layer" as const,
      owned: [relief.normal, relief.surface, backingMat],
      bend: captureBendBuffers(geo),
    };
  });
}

/** Decode every <img> a set of textures will use off the main thread (lib/gpuImages). */
async function decoder(sources: unknown[]): Promise<<S>(s: S) => S> {
  const decoded = await decodeImages(sources);
  return <S,>(s: S): S => (decoded.get(s as object) as S | undefined) ?? s;
}

/* ── Face: the cover side ── */

export interface CardFace {
  templateId: CardTemplateId;
  coverImg: HTMLImageElement;
  coverMap: THREE.Texture;
  coverRelief: SurfaceTextures;
  snowMask: THREE.Texture;
  /** Raised cutouts and paper-cut pieces (meshes: on one body at a time). */
  lifted: RuntimeLiftedMesh[];
}

/** What a card's kit is built from. */
export interface KitSources {
  templateId: CardTemplateId;
  coverImg: HTMLImageElement;
  layered: LayeredCover;
}

/** Build a card's face. Resolves null when `isCancelled` turns true while decoding. */
export async function buildFace(
  ctx: KitContext,
  { templateId, coverImg, layered }: KitSources,
  isCancelled: () => boolean,
): Promise<CardFace | null> {
  const bakes = cardBakes(templateId, coverImg);
  const baked = layered ? baseSurface(templateId, layered.base) : bakes.cover;
  const pieceReliefs = (layered?.items ?? []).map(({ spec: it, img }) =>
    layerSurface(it.src, img, it.box[2] * LAYER_BAKE_SCALE),
  );
  const up = await decoder([
    layered ? layered.base : coverImg,
    ...surfaceImages(baked),
    bakes.snowMask,
    ...(layered?.items ?? []).map(({ img }) => img),
    ...pieceReliefs.flatMap(surfaceImages),
  ]);
  if (isCancelled()) return null;
  const upSurface = (s: CoverSurface): CoverSurface => ({ normal: up(s.normal), surface: up(s.surface) });
  const aniso = ctx.maxAnisotropy;
  return {
    templateId,
    coverImg,
    // A paper-cut cover shows its bare base; its pieces are raised separately.
    coverMap: makeTexture(up(layered ? layered.base : coverImg), aniso),
    coverRelief: surfaceTextures(upSurface(baked), aniso),
    // Snow only behind the window glass (bubbbly's snowfall()).
    snowMask: makeTexture(up(bakes.snowMask), aniso, false),
    lifted: [
      ...buildCutouts(ctx, templateId, coverImg),
      ...buildPaperCutPieces(ctx, templateId, layered, pieceReliefs.map(upSurface), up),
    ],
  };
}

function faceTextures(face: CardFace): THREE.Texture[] {
  return [face.coverMap, face.coverRelief.normal, face.coverRelief.surface, face.snowMask];
}

/** Every texture a face samples, for uploading ahead of its first frame. */
export function faceUploads(face: CardFace): THREE.Texture[] {
  return [...faceTextures(face), ...face.lifted.flatMap((lm) => [lm.material, ...lm.owned]).flatMap(materialTextures)];
}

/** Free an evicted face. Cutout materials go back to the pool (no recompile). */
export function disposeFace(face: CardFace, liftedMatPool: THREE.MeshStandardMaterial[]): void {
  for (const tex of faceTextures(face)) tex.dispose();
  for (const lm of face.lifted) {
    lm.mesh.removeFromParent();
    lm.geometry.dispose();
    lm.texture.dispose();
    for (const o of lm.owned) o.dispose();
    if (lm.kind === "lifted") liftedMatPool.push(lm.material);
    else lm.material.dispose();
  }
}

/* ── Inside: the pages and the back ── */

export interface CardInside {
  templateId: CardTemplateId;
  coverImg: HTMLImageElement;
  leftMap: THREE.Texture;
  rightBaseMap: THREE.Texture;
  backMap: THREE.Texture;
  /** The insert sheet carries the message, so it remembers which text it shows. */
  sheet: { map: THREE.Texture; text: string };
  /** Template stickers' relief on the inside pages; bare pages have none. */
  leftRelief: SurfaceTextures | null;
  sheetRelief: SurfaceTextures | null;
}

export interface InsideSources {
  templateId: CardTemplateId;
  coverImg: HTMLImageElement;
  /** Editor/letter pages: no template stickers or text, they come as meshes. */
  bare: boolean;
  message: string;
  signature: string;
}

export function sheetText(message: string, signature: string): string {
  return `${message}\u0000${signature}`;
}

/**
 * Build a card's inside. Each page is a canvas drawn on the main thread
 * (tens of ms); `pace` runs between them, so a caller can give each its own
 * frame. Resolves null when `isCancelled` turns true along the way.
 */
export async function buildInside(
  ctx: KitContext,
  src: InsideSources,
  isCancelled: () => boolean,
  pace: () => Promise<void> = async () => undefined,
): Promise<CardInside | null> {
  const { templateId, coverImg, bare } = src;
  const spec = CARD_ASSETS[templateId];
  const bakes = cardBakes(templateId, coverImg);
  const up = await decoder(bare ? [] : [...surfaceImages(bakes.leftStickers), ...surfaceImages(bakes.sheetStickers)]);
  const upSurface = (s: CoverSurface): CoverSurface => ({ normal: up(s.normal), surface: up(s.surface) });
  const aniso = ctx.maxAnisotropy;
  const made: THREE.Texture[] = [];
  /** One page per step; a cancelled build frees what it already made. */
  const step = async <T,>(make: () => T, textures: (t: T) => THREE.Texture[]): Promise<T | null> => {
    await pace();
    if (isCancelled()) {
      for (const t of made) t.dispose();
      return null;
    }
    const value = make();
    made.push(...textures(value));
    return value;
  };
  const one = (t: THREE.Texture) => [t];
  const leftMap = await step(
    () =>
      makeTexture(
        bare ? createInsideLeftCanvas(templateId, null, []) : createInsideLeftCanvas(templateId, coverImg, spec.motifs.left),
        aniso,
      ),
    one,
  );
  if (!leftMap) return null;
  const rightBaseMap = await step(() => makeTexture(createInsideRightBaseCanvas(templateId), aniso), one);
  if (!rightBaseMap) return null;
  const backMap = await step(() => makeTexture(createBackCanvas(templateId, coverImg, spec.motifs.back), aniso), one);
  if (!backMap) return null;
  const sheet = await step(
    () =>
      bare
        ? { map: makeTexture(createBlankSheetCanvas(templateId), aniso), text: "" }
        : {
            map: makeTexture(
              createInsideRightSheetCanvas(templateId, src.message, src.signature, coverImg, spec.motifs.insert),
              aniso,
            ),
            text: sheetText(src.message, src.signature),
          },
    (v) => [v.map],
  );
  if (!sheet) return null;
  return {
    templateId,
    coverImg,
    leftMap,
    rightBaseMap,
    backMap,
    sheet,
    // Template stickers get the same paint relief + gloss as the cover, so the
    // pointer lamp glints on them once the card is open. Text stays flat ink.
    leftRelief: bare ? null : surfaceTextures(upSurface(bakes.leftStickers), aniso),
    sheetRelief: bare ? null : surfaceTextures(upSurface(bakes.sheetStickers), aniso),
  };
}

/** Every texture an inside samples. */
export function insideUploads(inside: CardInside): THREE.Texture[] {
  return [
    inside.leftMap,
    inside.rightBaseMap,
    inside.backMap,
    inside.sheet.map,
    ...[inside.leftRelief, inside.sheetRelief].flatMap((s) => (s ? [s.normal, s.surface] : [])),
  ];
}

export function disposeInside(inside: CardInside): void {
  for (const tex of insideUploads(inside)) tex.dispose();
}

/** Redraw an inside's insert sheet with new text; returns the texture it replaced, or null. */
export function redrawSheet(
  inside: CardInside,
  message: string,
  signature: string,
  anisotropy: number,
): THREE.Texture | null {
  const text = sheetText(message, signature);
  if (inside.sheet.text === text) return null;
  const old = inside.sheet.map;
  const spec = CARD_ASSETS[inside.templateId];
  inside.sheet = {
    map: makeTexture(
      createInsideRightSheetCanvas(inside.templateId, message, signature, inside.coverImg, spec.motifs.insert),
      anisotropy,
    ),
    text,
  };
  return old;
}
