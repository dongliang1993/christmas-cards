"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { CARD_ASSETS } from "@/lib/cardAssets";
import { CARD_H, CARD_THICKNESS, CARD_W, SHEET_H, SHEET_THICKNESS, SHEET_W } from "@/lib/cardConstants";
import { createElementLayer, type ElementLayer, type LayerElement } from "@/lib/card/elementMeshes";
import { localToPlacement, placementToLocal } from "@/lib/card/elementLayout";
import { applyPaperStock, paperTintOf } from "@/lib/card/paperStocks";
import type { Face, PaperStock } from "@/lib/letter/model";
import {
  applyBow,
  BOW_AMP,
  captureBendBuffers,
  OPEN_MAX,
  type BendBuffers,
} from "@/lib/cardBend";
import {
  coastOrbit,
  createPointerState,
  isTapGesture,
  orbitFromDrag,
  pointerToCardLocal,
  resolveTap,
  type PointerState,
} from "@/lib/cardInteract";
import { createPostfxStack, type PostfxStack } from "@/lib/cardPostfx";
import { LAYOUT_SPRING, stepHinge, stepSpring, type Spring } from "@/lib/cardMotion";
import { createHandRig, type HandRig } from "@/lib/hand/handRig";
import { createGlowSpriteTexture, GLOW_HDR, GLOW_SIZE } from "@/lib/cardGlow";
import { createLampGate, type LampGate } from "@/lib/lampGate";
import { createCardSnow } from "@/lib/cardSnow";
import {
  baseSurface,
  cardBakes,
  LAYER_BAKE_SCALE,
  layerSurface,
  loadCoverImage,
  loadLayers,
} from "@/lib/cardBakes";
import { ensureSurfaces, prebakeAllCards } from "@/lib/ensureSurfaces";
import { decodeImages, isPreflipped } from "@/lib/gpuImages";
import { createLruCache, type LruCache } from "@/lib/lruCache";
import { LIVE_SPECS, type LiveSpec } from "@/lib/live/liveSpec";
import {
  coverLocalToPx,
  coverPxToLocal,
  createLiveRuntime,
  kickMovers,
  packMoverUniforms,
  resolveLiveTap,
  stepLive,
  type LiveRuntime,
} from "@/lib/live/movers";
import { installMoverShader, type MoverShaderHandle } from "@/lib/live/moverShader";
import { buildPaperNormalTile, type CoverSurface, type SurfaceImage } from "@/lib/cardRelief";
import {
  addStudioEnvironment,
  addStudioLights,
  CARD_SHADOW_OFFSET,
  CARD_SHADOW_PAD_X,
  CARD_SHADOW_PAD_Y,
  createCardShadowTexture,
  createStudioRenderer,
  SOFTBOX_POS,
} from "@/lib/studio";
import { fitStage, shadowFootprint, studioBackgroundColor, zoomedDistance, type StageFit } from "@/lib/cardStage";
import {
  createBackCanvas,
  createBlankSheetCanvas,
  createInsideLeftCanvas,
  createInsideRightBaseCanvas,
  createInsideRightSheetCanvas,
  createSnowfallCanvas,
  extractMotifCanvas,
} from "@/lib/cardTextures";
import type { CardTemplateId } from "@/lib/types";

export interface ChristmasCard3DProps {
  templateId: CardTemplateId;
  message: string;
  signature: string;
  isOpen: boolean;
  isPaused: boolean;
  flyInKey?: number;
  /** false: start at rest, no fly-in (taking over from the envelope, which already showed it arriving). */
  flyIn?: boolean;
  onToggleOpen?: () => void;
  onOpenProgress?: (progress: number) => void;
  onReady?: () => void;
  /** The first frame with the cover on has been drawn: safe to remove whatever stood in for it. */
  onFirstFrame?: () => void;
  /**
   * Stickers and text placed by the sender. When given, the inside pages are
   * bare paper and these are drawn as their own meshes instead of the
   * template's motifs and `message`.
   */
  elements?: LayerElement[];
  /**
   * false: the card ignores its own drag-open / tap gestures (the editor
   * drives it); the pointer lamp still follows the pointer.
   */
  interactive?: boolean;
  /** Editor zoom, 0.6–2 (camera moves closer); 1 is the fitted view. */
  zoom?: number;
  /** Card stock for the inside pages and edges; omitted keeps the template's paper. */
  paper?: PaperStock;
  /** Editor access to picking and on-screen element corners. */
  handleRef?: Ref<CardHandle>;
  /**
   * Gallery: the other cards fanned out around this one as a dealt hand.
   * Three levels: browsing, a drag deals through the hand and a tap on the
   * front card focuses it; focused (`handFocus`), the rest step aside, the
   * card comes closer and a drag turns it to look at the cover, a tap opens
   * it; a tap on empty space or a side card goes back to browsing.
   * `onIndex` reports the card the hand heads for. Read once at mount.
   */
  hand?: {
    templateIds: readonly CardTemplateId[];
    onIndex: (index: number) => void;
    onFocus: (focus: boolean) => void;
  };
  /** With `hand`: the front card is focused (see `hand`). */
  handFocus?: boolean;
}

/** The hand frames the closed card smaller than a lone card, to leave room for the fan. */
const HAND_BACKOFF = 1.3;
/** One card step on screen, in card widths (handLayout STEP_NEAR), for drag tracking. */
const HAND_STEP = 0.84;

/** What lies under a screen point on the open card. */
export interface CardPick {
  face: Face;
  /** 0..1 placement on that face. */
  x: number;
  y: number;
  /** uid of the element under the point, if any. */
  uid: string | null;
}

export interface CardHandle {
  /** clientX/clientY → face position and element, or null off the inside pages. */
  pick(clientX: number, clientY: number): CardPick | null;
  /** An element's corners (tl, tr, br, bl) in px relative to the card's container. */
  project(uid: string): { x: number; y: number }[] | null;
  /** A whole inside page's corners (tl, tr, br, bl), same frame as `project`. */
  projectFace(face: Face): { x: number; y: number }[] | null;
}

interface RuntimeLiftedMesh {
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

/** How far the pointer slides the studio softbox (SOFTBOX_POS in lib/studio). */
const SOFTBOX_SWAY = 1.4;
/** Pointer lamp peak intensity: the glint on wet paint. */
const LAMP_INTENSITY = 1.5;

/** Motion budget scaling for prefers-reduced-motion (#10). */
function motionScale(): number {
  if (typeof window === "undefined") return 1;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.35 : 1;
}

/** Shadow plane is the card footprint padded by this much on each axis. */
/** Cover artwork size in pixels; living-card positions are in these. */
const COVER_PX_W = 940;
const COVER_PX_H = 1316;
/** Pointer speed (px/s) that blows a full breeze through the card. */
const WIND_FULL_PX_S = 1400;
/**
 * The pointer's sweep velocity that blows the snow (the reference's K): it
 * builds fast while the pointer speeds up and lets go slowly, so a quick
 * sweep leaves the flakes drifting on. Clamped, in screen px/s.
 */
const SWEEP_MAX_PX_S = 2400;
const SWEEP_RISE = 10;
const SWEEP_FALL = 2.2;
/** A sample fades this fast once the pointer stops moving. */
const SWEEP_SAMPLE_FADE = 8;
/** Seconds after landing before the card says hello. */
const GREET_DELAY = 0.25;
function createParticleSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, "rgba(255, 255, 255, 1)");
    grad.addColorStop(0.42, "rgba(255, 255, 255, 0.9)");
    grad.addColorStop(0.8, "rgba(255, 255, 255, 0.25)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTexture(
  source: SurfaceImage,
  anisotropy: number,
  isColor = true,
): THREE.Texture {
  // Every SurfaceImage is a valid texture source at runtime (canvas, image,
  // ImageBitmap); three's own typings are narrower than the WebGL reality.
  const tex = new THREE.Texture(source as HTMLCanvasElement);
  // A decoded bitmap carries its flip already (see lib/gpuImages).
  if (isPreflipped(source)) tex.flipY = false;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** A baked relief's two images. */
function surfaceImages(s: CoverSurface): SurfaceImage[] {
  return [s.normal, s.surface];
}

type TextureSlot = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "alphaMap";
const TEXTURE_SLOTS: readonly TextureSlot[] = ["map", "normalMap", "roughnessMap", "metalnessMap", "alphaMap"];

/** The textures a material samples (or the texture itself). */
function materialTextures(o: unknown): THREE.Texture[] {
  if (o instanceof THREE.Texture) return [o];
  if (!(o instanceof THREE.Material)) return [];
  const slots = o as Partial<Record<TextureSlot, THREE.Texture | null>>;
  return TEXTURE_SLOTS.map((k) => slots[k]).filter((t): t is THREE.Texture => t instanceof THREE.Texture);
}

/** A baked relief, uploaded: a normal map and a metalness/roughness map. */
interface SurfaceTextures {
  normal: THREE.Texture;
  surface: THREE.Texture;
}

function surfaceTextures(baked: CoverSurface, anisotropy: number): SurfaceTextures {
  return {
    normal: makeTexture(baked.normal, anisotropy, false),
    surface: makeTexture(baked.surface, anisotropy, false),
  };
}

/** Put a relief on a paper material (paint relief + gloss). */
function putSurface(mat: THREE.MeshStandardMaterial, s: SurfaceTextures): void {
  mat.normalMap = s.normal;
  mat.normalScale.set(1, 1);
  mat.roughnessMap = s.surface;
  mat.metalnessMap = s.surface;
  mat.roughness = 1;
  mat.metalness = 1;
}

/** How many cards keep their textures on the GPU (the one shown plus the last two). */
const KIT_CACHE_SIZE = 3;

/**
 * Everything one card puts on the shared card meshes. Kept per card (LRU), so
 * switching back to a card only reassigns what is already on the GPU, as the
 * reference does by keeping every card built and toggling visibility.
 */
interface CardKit {
  templateId: CardTemplateId;
  coverImg: HTMLImageElement;
  coverMap: THREE.Texture;
  coverRelief: SurfaceTextures;
  snowMask: THREE.Texture;
  leftMap: THREE.Texture;
  rightBaseMap: THREE.Texture;
  backMap: THREE.Texture;
  /** The insert sheet carries the message, so it remembers which text it shows. */
  sheet: { map: THREE.Texture; text: string };
  /** Template stickers' relief on the inside pages; bare pages have none. */
  leftRelief: SurfaceTextures | null;
  sheetRelief: SurfaceTextures | null;
  lifted: RuntimeLiftedMesh[];
}

function sheetText(message: string, signature: string): string {
  return `${message}\u0000${signature}`;
}

/** The kit's own textures (the raised pieces' live on their materials). */
function kitTextures(kit: CardKit): THREE.Texture[] {
  return [
    kit.coverMap,
    kit.coverRelief.normal,
    kit.coverRelief.surface,
    kit.snowMask,
    kit.leftMap,
    kit.rightBaseMap,
    kit.backMap,
    kit.sheet.map,
    ...[kit.leftRelief, kit.sheetRelief].flatMap((s) => (s ? [s.normal, s.surface] : [])),
  ];
}

/** Free an evicted card. Cutout materials go back to the pool (no recompile). */
function disposeKit(kit: CardKit, liftedMatPool: THREE.MeshStandardMaterial[]): void {
  for (const tex of kitTextures(kit)) tex.dispose();
  for (const lm of kit.lifted) {
    lm.mesh.removeFromParent();
    lm.geometry.dispose();
    lm.texture.dispose();
    for (const o of lm.owned) o.dispose();
    if (lm.kind === "lifted") liftedMatPool.push(lm.material);
    else lm.material.dispose();
  }
}

type LayeredCover = Awaited<ReturnType<typeof loadLayers>>;

/** What a card's kit is built from. */
interface KitSources {
  templateId: CardTemplateId;
  coverImg: HTMLImageElement;
  layered: LayeredCover;
  /** Editor/letter pages: no template stickers or text, they come as meshes. */
  bare: boolean;
  message: string;
  signature: string;
}

function cardKitKey(templateId: CardTemplateId, bare: boolean): string {
  return `${templateId}|${bare ? "bare" : "template"}`;
}

/**
 * Build one card's kit: textures, raised pieces and their materials. Every
 * <img> is decoded off the main thread first (see lib/gpuImages). Resolves
 * null when `isCancelled` turns true while decoding. Puts nothing on the meshes.
 */
async function buildKit(h: SceneHandles, src: KitSources, isCancelled: () => boolean): Promise<CardKit | null> {
  const { templateId, coverImg, layered, bare } = src;
  const spec = CARD_ASSETS[templateId];
  const bakes = cardBakes(templateId, coverImg);
  const baked = layered ? baseSurface(templateId, layered.base) : bakes.cover;
  const pieceReliefs = (layered?.items ?? []).map(({ spec: it, img }) =>
    layerSurface(it.src, img, it.box[2] * LAYER_BAKE_SCALE),
  );
  const decoded = await decodeImages([
    layered ? layered.base : coverImg,
    ...surfaceImages(baked),
    bakes.snowMask,
    ...surfaceImages(bakes.leftStickers),
    ...surfaceImages(bakes.sheetStickers),
    ...(layered?.items ?? []).map(({ img }) => img),
    ...pieceReliefs.flatMap(surfaceImages),
  ]);
  if (isCancelled()) return null;
  const up = <S,>(s: S): S => (decoded.get(s as object) as S | undefined) ?? s;
  const upSurface = (s: CoverSurface): CoverSurface => ({ normal: up(s.normal), surface: up(s.surface) });
  const aniso = h.maxAnisotropy;

  return {
    templateId,
    coverImg,
    // A paper-cut cover shows its bare base; its pieces are raised separately.
    coverMap: makeTexture(up(layered ? layered.base : coverImg), aniso),
    coverRelief: surfaceTextures(upSurface(baked), aniso),
    // Snow only behind the window glass (bubbbly's snowfall()).
    snowMask: makeTexture(up(bakes.snowMask), aniso, false),
    leftMap: makeTexture(
      bare ? createInsideLeftCanvas(templateId, null, []) : createInsideLeftCanvas(templateId, coverImg, spec.motifs.left),
      aniso,
    ),
    rightBaseMap: makeTexture(createInsideRightBaseCanvas(templateId), aniso),
    backMap: makeTexture(createBackCanvas(templateId, coverImg, spec.motifs.back), aniso),
    sheet: bare
      ? { map: makeTexture(createBlankSheetCanvas(templateId), aniso), text: "" }
      : {
          map: makeTexture(
            createInsideRightSheetCanvas(templateId, src.message, src.signature, coverImg, spec.motifs.insert),
            aniso,
          ),
          text: sheetText(src.message, src.signature),
        },
    // Template stickers get the same paint relief + gloss as the cover, so the
    // pointer lamp glints on them once the card is open. Text stays flat ink.
    leftRelief: bare ? null : surfaceTextures(upSurface(bakes.leftStickers), aniso),
    sheetRelief: bare ? null : surfaceTextures(upSurface(bakes.sheetStickers), aniso),
    lifted: [
      ...buildCutouts(h, templateId, coverImg),
      ...buildPaperCutPieces(h, templateId, layered, pieceReliefs.map(upSurface), up),
    ],
  };
}

/** Raised 3D cutouts cropped from the cover art. Materials come from the pool. */
function buildCutouts(h: SceneHandles, templateId: CardTemplateId, coverImg: HTMLImageElement): RuntimeLiftedMesh[] {
  const spec = CARD_ASSETS[templateId];
  return spec.lifted.map((l, idx) => {
    const tex = makeTexture(extractMotifCanvas(coverImg, l.box), h.maxAnisotropy);
    const geo = liftedGeometry(
      (l.box[2] / spec.w) * CARD_W,
      (l.box[3] / spec.h) * CARD_H,
      ((l.box[0] + l.box[2] / 2) / spec.w) * CARD_W,
      (0.5 - (l.box[1] + l.box[3] / 2) / spec.h) * CARD_H,
      l.lift,
    );
    const mat = h.liftedMatPool.pop() ?? newCutoutMaterial(h);
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

function newCutoutMaterial(h: SceneHandles): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    transparent: true,
    alphaTest: 0.08,
    roughness: 0.8,
    normalMap: h.paperNormalTex,
    normalScale: new THREE.Vector2(0.8, 0.8),
    emissiveIntensity: 0,
  });
  // A raised piece: the pointer lamp always plays on it.
  h.lampGate.install(m, 1);
  return m;
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
function warmPieceMaterials(parent: THREE.Object3D, lampGate: LampGate, tex: THREE.Texture): () => void {
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

/** Paper-cut pieces: each its own image, relief and gold foil, raised to its own height. */
function buildPaperCutPieces(
  h: SceneHandles,
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
    const map = makeTexture(up(img), h.maxAnisotropy);
    const relief = surfaceTextures(reliefs[idx], h.maxAnisotropy);
    const mat = newPieceMaterial(h.lampGate, map, relief);
    const backingMat = newBackingMaterial(h.lampGate, map);
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

/** Every texture a kit samples, for uploading ahead of its first frame. */
function kitUploads(kit: CardKit): THREE.Texture[] {
  return [...kitTextures(kit), ...kit.lifted.flatMap((lm) => [lm.material, ...lm.owned]).flatMap(materialTextures)];
}

/** Put a kit on the card meshes. Nothing is created or freed: the old kit stays cached. */
function applyKit(h: SceneHandles, kit: CardKit): void {
  const cover = h.coverBaseMat;
  cover.map = kit.coverMap;
  putSurface(cover, kit.coverRelief);
  h.foilTex = kit.coverRelief.surface;
  h.snowfallMat.alphaMap = kit.snowMask;
  h.insideLeftMat.map = kit.leftMap;
  h.insideRightBaseMat.map = kit.rightBaseMap;
  h.backMat.map = kit.backMap;
  h.insideRightSheetMat.map = kit.sheet.map;
  if (kit.leftRelief) putSurface(h.insideLeftMat, kit.leftRelief);
  if (kit.sheetRelief) putSurface(h.insideRightSheetMat, kit.sheetRelief);
  for (const mat of [cover, h.snowfallMat, h.insideLeftMat, h.insideRightBaseMat, h.backMat, h.insideRightSheetMat]) {
    mat.needsUpdate = true;
  }
  for (const lm of h.liftedMeshes) lm.mesh.removeFromParent();
  h.liftedMeshes = kit.lifted;
  for (const lm of kit.lifted) h.liftedGroup.add(lm.mesh);
  h.activeKit = kit;
}

/** Redraw the insert sheet when the message differs from what the kit shows. */
function refreshSheet(h: SceneHandles, kit: CardKit, message: string, signature: string): void {
  const text = sheetText(message, signature);
  if (kit.sheet.text === text) return;
  const old = kit.sheet.map;
  const spec = CARD_ASSETS[kit.templateId];
  kit.sheet = {
    map: makeTexture(
      createInsideRightSheetCanvas(kit.templateId, message, signature, kit.coverImg, spec.motifs.insert),
      h.maxAnisotropy,
    ),
    text,
  };
  if (h.activeKit === kit) {
    h.insideRightSheetMat.map = kit.sheet.map;
    h.insideRightSheetMat.needsUpdate = true;
  }
  old.dispose();
}

/** What the scene effect hands the card-switch effect. */
interface SceneHandles {
  /** Compile the scene's shaders off the main thread where the GPU driver allows. */
  prewarm: () => Promise<void>;
  /**
   * Upload textures to the GPU now. The real card is culled until it lands,
   * so otherwise every new texture uploads on that one frame (the hitch).
   */
  upload: (textures: readonly THREE.Texture[], isCancelled: () => boolean) => Promise<void>;
  /** Keeps the pointer lamp off bare paper (see lib/lampGate). */
  lampGate: LampGate;
  coverBaseMat: THREE.MeshStandardMaterial;
  insideLeftMat: THREE.MeshStandardMaterial;
  insideRightBaseMat: THREE.MeshStandardMaterial;
  insideRightSheetMat: THREE.MeshStandardMaterial;
  backMat: THREE.MeshStandardMaterial;
  /** What raised pieces hang from: the cover itself, so they share its bow. */
  liftedGroup: THREE.Object3D;
  liftedMeshes: RuntimeLiftedMesh[];
  /**
   * Cutout materials kept between cards. Disposing them freed their shader
   * programs, so every switch recompiled two programs mid fly-in (the
   * stutter); reusing them only swaps the texture.
   */
  liftedMatPool: THREE.MeshStandardMaterial[];
  /** Recently shown cards, still on the GPU (see CardKit). Keyed by cardKitKey. */
  kits: LruCache<string, CardKit>;
  /** The kit on the meshes now. */
  activeKit: CardKit | null;
  glowSprite: THREE.Sprite;
  glowLight: THREE.PointLight;
  paperNormalTex: THREE.Texture;
  snowfallTex: THREE.Texture;
  snowfallMat: THREE.MeshBasicMaterial;
  snowfallMesh: THREE.Mesh;
  coverMesh: THREE.Mesh;
  coverBend: BendBuffers;
  liftedBend: BendBuffers;
  frontPivot: THREE.Group;
  maxAnisotropy: number;
  foilTex: THREE.Texture | null;
  moverShader: MoverShaderHandle;
}

export function ChristmasCard3D({
  templateId,
  message,
  signature,
  isOpen,
  isPaused,
  flyInKey = 0,
  flyIn = true,
  onToggleOpen,
  onOpenProgress,
  onReady,
  onFirstFrame,
  elements,
  interactive = true,
  paper,
  zoom = 1,
  handleRef,
  hand,
  handFocus = false,
}: ChristmasCard3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const coverImageRef = useRef<HTMLImageElement | null>(null);

  const stateRef = useRef({
    isOpen,
    prevOpen: isOpen,
    isPaused,
    dragRotX: 0,
    dragRotY: 0,
    targetDragRotX: 0,
    targetDragRotY: 0,
    // Fling velocity (px/s) the view orbit coasts on after a drag is released.
    orbitVX: 0,
    orbitVY: 0,
    hoverX: 0,
    hoverY: 0,
    flyProgress: flyIn ? 0 : 1,
    // The fly-in waits for the card's artwork to be baked and applied, so no
    // bake ever lands mid-flight (it used to: that was the stutter).
    assetsReady: false,
    burstTimer: 0,
    snowBounds: { xMin: 0.45, xMax: 2.15, yMin: -0.9, yMax: 1.2 },
    glowFlicker: true,
    // #7 continuous open progress 0..1 (drag-controllable)
    openProgress: isOpen ? 1 : 0,
    targetOpenProgress: isOpen ? 1 : 0,
    // Cover hinge angle (rad) and the card's slide to centre (0 shut .. 1 open), as springs.
    hinge: { x: isOpen ? OPEN_MAX : 0, v: 0 } as Spring,
    layout: { x: isOpen ? 1 : 0, v: 0 } as Spring,
    // Hand focus (0 browsing .. 1 the rest stepped aside, the card brought closer).
    focus: { x: handFocus || isOpen ? 1 : 0, v: 0 } as Spring,
    releasedImpulse: 0,
    // Living card: the pointer's breeze (-1..1), a light's flare (0..1), and
    // whether the card still has to say hello once it lands.
    wind: 0,
    // Pointer sweep across the card, px/s: last sample, and the smoothed wind it feeds.
    sweepSample: { x: 0, y: 0 },
    sweep: { x: 0, y: 0 },
    glowFlare: 0,
    // Without a fly-in the card is already there: say hello straight away.
    greetIn: flyIn ? -1 : GREET_DELAY,
  });
  const liveRef = useRef<{ spec: LiveSpec; rt: LiveRuntime } | null>(null);

  const callbacksRef = useRef({ onToggleOpen, onOpenProgress, onReady, onFirstFrame });
  const coverOnRef = useRef(false);
  const elementLayerRef = useRef<ElementLayer | null>(null);
  // Decided once per mount: a card is either an editor/letter card or a template card.
  const bareRef = useRef(elements !== undefined);
  const handRef = useRef(hand);
  handRef.current = hand;
  const rigRef = useRef<HandRig | null>(null);
  const templateIdRef = useRef(templateId);
  templateIdRef.current = templateId;
  const textRef = useRef({ message, signature });
  textRef.current = { message, signature };

  // The dock (or anything outside) picked a card: deal the hand round to it.
  useEffect(() => {
    const ids = handRef.current?.templateIds;
    if (rigRef.current && ids) rigRef.current.goTo(Math.max(0, ids.indexOf(templateId)));
  }, [templateId]);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const viewRef = useRef({ zoom });
  viewRef.current = { zoom };
  const pickApiRef = useRef<CardHandle | null>(null);
  const paperMatsRef = useRef<THREE.MeshPhysicalMaterial[]>([]);
  useImperativeHandle(handleRef, () => ({
    pick: (cx, cy) => pickApiRef.current?.pick(cx, cy) ?? null,
    project: (uid) => pickApiRef.current?.project(uid) ?? null,
    projectFace: (face) => pickApiRef.current?.projectFace(face) ?? null,
  }), []);
  callbacksRef.current = { onToggleOpen, onOpenProgress, onReady, onFirstFrame };

  /** Turn the view back square to the lens (after open/close or a new card). */
  const resetOrbit = () => {
    stateRef.current.targetDragRotX = 0;
    stateRef.current.targetDragRotY = 0;
    stateRef.current.orbitVX = 0;
    stateRef.current.orbitVY = 0;
  };

  useEffect(() => {
    stateRef.current.targetOpenProgress = isOpen ? 1 : 0;
    resetOrbit();
  }, [isOpen]);

  const focusRef = useRef(handFocus);
  focusRef.current = handFocus;
  // Back to browsing: the card stands square in the hand again.
  useEffect(() => {
    if (!handFocus) resetOrbit();
  }, [handFocus]);

  useEffect(() => {
    stateRef.current.isPaused = isPaused;
  }, [isPaused]);

  const flyInMounted = useRef(false);
  useEffect(() => {
    // On mount the initial state already says whether to fly in; later keys always do.
    if (!flyInMounted.current) {
      flyInMounted.current = true;
      if (!flyIn) return;
    }
    stateRef.current.flyProgress = 0;
    stateRef.current.greetIn = -1;
    resetOrbit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyInKey]);

  const sceneHandlesRef = useRef<SceneHandles | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const motion = motionScale();

    const scene = new THREE.Scene();
    // Opaque studio sweep: the bloom chain drops canvas alpha, so the
    // backdrop is rendered, tuned to land exactly on the page colour.
    scene.background = studioBackgroundColor();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const CAMERA_FOV = 30;
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 100);
    camera.position.set(0, 0.12, 8.2);

    const renderer = createStudioRenderer();
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
    const studioEnv = addStudioEnvironment(renderer, scene);
    /**
     * Precompile shaders off the critical frame. The frame itself renders
     * into the postfx chain's offscreen target, where three.js builds shaders
     * without tone mapping; compiling against the screen would build the
     * wrong variants, so compile against an offscreen target too.
     */
    const warmTarget = new THREE.WebGLRenderTarget(1, 1);
    const prewarm = (): Promise<void> => {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(warmTarget);
      const done = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(previous);
      return done.then(() => undefined);
    };

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // The shared studio: the key light's target and the softbox ride the pointer.
    const handOpts = handRef.current;
    const { key: keyLight, keyTarget, softbox } = addStudioLights(scene, { shadowMapSize: handOpts ? 2048 : 1024 });
    if (handOpts) {
      // The fan is wider than one card: widen the key light's shadow frustum.
      Object.assign(keyLight.shadow.camera, { left: -9, right: 9, top: 6, bottom: -6 });
      keyLight.shadow.camera.updateProjectionMatrix();
    }

    // Cold-press tooth at the same pitch as the cover (~85 bumps across).
    const paperNormalTex = makeTexture(
      buildPaperNormalTile(512, 24),
      maxAnisotropy,
      false,
    );
    paperNormalTex.wrapS = THREE.RepeatWrapping;
    paperNormalTex.wrapT = THREE.RepeatWrapping;
    paperNormalTex.repeat.set(3.5, 3.5 * (CARD_H / CARD_W));

    // The pointer lamp lights the things on the card, not the bare paper.
    const lampGate = createLampGate();

    // #5 Snowfall parallax layer above the cover artwork; the hand's stand-ins
    // share this texture (the card drives its scroll), so create it before the rig.
    const snowfallTex = makeTexture(createSnowfallCanvas(), maxAnisotropy);
    snowfallTex.wrapS = THREE.RepeatWrapping;
    snowfallTex.wrapT = THREE.RepeatWrapping;
    // Shared candle-glow sprite, for the real card and every stand-in.
    const glowTex = createGlowSpriteTexture();

    const rig = handOpts
      ? createHandRig({
          templateIds: handOpts.templateIds,
          initialIndex: Math.max(0, handOpts.templateIds.indexOf(templateIdRef.current)),
          renderer,
          paperNormal: paperNormalTex,
          snowfall: snowfallTex,
          glowTexture: glowTex,
          motion,
          onIndex: (i) => handRef.current?.onIndex(i),
          decorate: (m) => lampGate.install(m),
          onMaterials: () => {
            prewarm().catch(() => undefined);
          },
        })
      : null;
    if (rig) scene.add(rig.group);
    rigRef.current = rig;
    /** The real card stands in front (vs. its stand-in, while the hand moves). */
    let realShown = !rig;

    const outerGroup = new THREE.Group();
    scene.add(outerGroup);

    const cardCenterGroup = new THREE.Group();
    outerGroup.add(cardCenterGroup);

    const paperEdgeMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6ddd1,
      roughness: 0.9,
      metalness: 0.0,
      normalMap: paperNormalTex,
      normalScale: new THREE.Vector2(0.8, 0.8),
    });

    const coverBaseMat = new THREE.MeshStandardMaterial({
      roughness: 0.84,
      metalness: 0.02,
      normalMap: paperNormalTex,
      normalScale: new THREE.Vector2(1, 1),
    });
    // #4 Foil defaults so swapping maps in the loader works cleanly.
    coverBaseMat.metalness = 0.55;
    coverBaseMat.roughness = 0.6;
    // Living card: patches of the painting turn about their pivots.
    const moverShader = installMoverShader(coverBaseMat, COVER_PX_W, COVER_PX_H);

    const insideLeftMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.86,
      metalness: 0.01,
      normalMap: paperNormalTex,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
    // #3 Inside shade base color; animated by open angle in the render loop.
    insideLeftMat.color = new THREE.Color(0xffffff);

    const insideRightBaseMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.86,
      metalness: 0.01,
      normalMap: paperNormalTex,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });

    const insideRightSheetMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.82,
      metalness: 0.01,
      normalMap: paperNormalTex,
      normalScale: new THREE.Vector2(0.7, 0.7),
    });

    const backMat = new THREE.MeshStandardMaterial({
      roughness: 0.88,
      metalness: 0.01,
      normalMap: paperNormalTex,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
    for (const m of [paperEdgeMat, coverBaseMat, insideLeftMat, insideRightBaseMat, insideRightSheetMat, backMat]) {
      lampGate.install(m);
    }

    // #1 Segmented panels so the CPU bow can curve them.
    const BEND_SEGMENTS = 24;
    const rightGeo = new THREE.BoxGeometry(
      CARD_W,
      CARD_H,
      CARD_THICKNESS,
      BEND_SEGMENTS,
      1,
      1,
    );
    const rightMesh = new THREE.Mesh(rightGeo, [
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      insideRightBaseMat,
      backMat,
    ]);
    rightMesh.position.set(CARD_W / 2, 0, 0);
    rightMesh.castShadow = true;
    rightMesh.receiveShadow = true;
    cardCenterGroup.add(rightMesh);
    const rightBend = captureBendBuffers(rightGeo);

    const sheetGeo = new THREE.BoxGeometry(SHEET_W, SHEET_H, SHEET_THICKNESS, BEND_SEGMENTS, 1, 1);
    const sheetMesh = new THREE.Mesh(sheetGeo, [
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      insideRightSheetMat,
      paperEdgeMat,
    ]);
    sheetMesh.position.set(CARD_W / 2, 0, CARD_THICKNESS * 0.5 + 0.005);
    sheetMesh.castShadow = true;
    sheetMesh.receiveShadow = true;
    cardCenterGroup.add(sheetMesh);
    const sheetBend = captureBendBuffers(sheetGeo);

    const frontPivot = new THREE.Group();
    frontPivot.position.set(0, 0, CARD_THICKNESS * 0.5 + 0.026);
    cardCenterGroup.add(frontPivot);

    const frontGeo = new THREE.BoxGeometry(
      CARD_W,
      CARD_H,
      CARD_THICKNESS,
      BEND_SEGMENTS,
      1,
      1,
    );
    const coverMesh = new THREE.Mesh(frontGeo, [
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      coverBaseMat,
      insideLeftMat,
    ]);
    coverMesh.position.set(CARD_W / 2, 0, CARD_THICKNESS * 0.5);
    coverMesh.castShadow = true;
    coverMesh.receiveShadow = true;
    frontPivot.add(coverMesh);
    const coverBend = captureBendBuffers(frontGeo);

    // Group for lifted relief cutouts from the cover artwork
    // Raised pieces hang from the cover (geometry in its frame) and bow with it.
    const liftedGroup: THREE.Object3D = coverMesh;

    // #5 Snowfall parallax layer above the cover artwork.
    const snowfallMat = new THREE.MeshBasicMaterial({
      map: snowfallTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const snowfallMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      snowfallMat,
    );
    snowfallMesh.position.set(CARD_W / 2, 0, CARD_THICKNESS + 0.003);
    frontPivot.add(snowfallMesh);

    // Animated warm glow sprite + PointLight
    const glowSpriteMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffb854,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowSprite = new THREE.Sprite(glowSpriteMat);
    glowSprite.position.set(CARD_W / 2 - 0.35, -0.62, CARD_THICKNESS + 0.04);
    frontPivot.add(glowSprite);

    // Short reach: the candle warms its corner of the sill, not the whole card.
    const glowLight = new THREE.PointLight(0xffb854, 0.75, 1.3);
    glowLight.position.set(CARD_W / 2 - 0.35, -0.62, CARD_THICKNESS + 0.35);
    frontPivot.add(glowLight);

    // #2b Pointer lamp: the light that follows the pointer across the card,
    // so the impasto relief & paper grain catch a moving sheen (bubbbly uLamp).
    // Physically decayed and held off the face; lights stickers inside too.
    const hoverLamp = new THREE.PointLight(0xfffaf4, 0, 4.2, 2);
    hoverLamp.position.set(CARD_W / 2, 0, 1.15);
    cardCenterGroup.add(hoverLamp);

    // Snowfall strictly inside the cover artwork's snowArea: real flakes, blown by the pointer.
    const particleTex = createParticleSprite();
    const snow = createCardSnow({ count: 40, size: 0.15, z: CARD_THICKNESS + 0.04 });
    frontPivot.add(snow.points);

    paperMatsRef.current = [paperEdgeMat, insideLeftMat, insideRightBaseMat, insideRightSheetMat];

    elementLayerRef.current = createElementLayer(
      {
        "inside-left": { parent: coverMesh, bendWidth: CARD_W },
        "inside-right": { parent: sheetMesh, bendWidth: CARD_W },
      },
      maxAnisotropy,
    );

    const liftedMatPool: THREE.MeshStandardMaterial[] = [];
    const unwarmPieces = warmPieceMaterials(scene, lampGate, paperNormalTex);
    const uploaded = new WeakSet<THREE.Texture>();
    sceneHandlesRef.current = {
      prewarm,
      // One texture per frame: each costs a few ms (storage, copy, mipmaps),
      // so spread over the deal they never add up to a dropped frame.
      upload: async (textures, isCancelled) => {
        for (const tex of new Set(textures)) {
          if (uploaded.has(tex)) continue;
          await new Promise((r) => requestAnimationFrame(r));
          // The rest upload when this card is next built or shown.
          if (isCancelled()) return;
          renderer.initTexture(tex);
          uploaded.add(tex);
        }
      },
      lampGate,
      coverBaseMat,
      insideLeftMat,
      insideRightBaseMat,
      insideRightSheetMat,
      backMat,
      liftedGroup,
      liftedMeshes: [],
      liftedMatPool,
      kits: createLruCache<string, CardKit>(KIT_CACHE_SIZE, (_key, kit) => disposeKit(kit, liftedMatPool)),
      activeKit: null,
      glowSprite,
      glowLight,
      paperNormalTex,
      snowfallTex,
      snowfallMat,
      snowfallMesh,
      coverMesh,
      coverBend,
      liftedBend: sheetBend,
      frontPivot,
      maxAnisotropy,
      foilTex: null,
      moverShader,
    };
    // Keep rightBend / sheetBend reachable for the animation loop.
    const bendRefs = { right: rightBend, sheet: sheetBend, cover: coverBend };
    void bendRefs;

    const shadowTex = createCardShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W * CARD_SHADOW_PAD_X, CARD_H * CARD_SHADOW_PAD_Y),
      shadowMat,
    );
    // Just behind the card, as if it stood a finger's width off the sweep.
    shadowPlane.position.set(CARD_SHADOW_OFFSET.x, CARD_SHADOW_OFFSET.y, CARD_SHADOW_OFFSET.z);
    outerGroup.add(shadowPlane);

    // Card-open golden sparkle burst
    const burstCount = Math.max(24, Math.round(140 * motion));
    const burstPositions = new Float32Array(burstCount * 3);
    const burstVelocities = new Float32Array(burstCount * 3);
    const burstGeo = new THREE.BufferGeometry();
    burstGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(burstPositions, 3),
    );

    const burstMat = new THREE.PointsMaterial({
      size: 0.18,
      color: 0xd99b26,
      map: particleTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    const burstParticles = new THREE.Points(burstGeo, burstMat);
    scene.add(burstParticles);

    /** Sparkles: the big opening burst, or a small one from a tapped spot. */
    const triggerBurst = (origin?: THREE.Vector3) => {
      stateRef.current.burstTimer = origin ? 1.1 : 1.6;
      const posAttr = burstGeo.getAttribute("position") as THREE.BufferAttribute;
      const spread = origin ? 0.06 : 1;
      for (let i = 0; i < burstCount; i += 1) {
        posAttr.setXYZ(
          i,
          (origin?.x ?? 0) + (Math.random() - 0.5) * 0.5 * spread,
          (origin?.y ?? 0) + (Math.random() - 0.5) * 2.5 * spread,
          (origin?.z ?? 0.35) + Math.random() * 0.3 * spread,
        );
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.8 + Math.random() * 2.2) * (origin ? 0.4 : 1);
        burstVelocities[i * 3] = Math.cos(angle) * speed;
        burstVelocities[i * 3 + 1] = Math.sin(angle) * speed * 0.75 + 0.4;
        burstVelocities[i * 3 + 2] = (Math.random() - 0.15) * 1.6;
      }
      posAttr.needsUpdate = true;
    };

    // Pointer: a click opens the card; press-and-drag anywhere turns the view.
    const ptr: PointerState = createPointerState();
    let orbitBase = { x: 0, y: 0 };
    let ptrVy = 0;
    let ptrLastY = 0;
    let windLastX = 0;
    let windLastY = 0;
    let windLastT = 0;

    /** A tap on the closed cover: a light flares, a part reacts, or the card opens. */
    const handleCoverTap = (local: { x: number; y: number } | null): boolean => {
      const live = liveRef.current;
      if (!local || !live || stateRef.current.openProgress > 0.1) return false;
      const px = coverLocalToPx(local, COVER_PX_W, COVER_PX_H);
      const hit = resolveLiveTap(live.spec, px.x, px.y);
      if (hit.kind === "open") return false;
      const burstAt = (at: readonly [number, number]) => {
        const l = coverPxToLocal(at, COVER_PX_W, COVER_PX_H);
        triggerBurst(coverMesh.localToWorld(new THREE.Vector3(l.x, l.y, CARD_THICKNESS + 0.05)));
      };
      if (hit.kind === "glow" && live.spec.glowTap) {
        stateRef.current.glowFlare = 1;
        kickMovers(live.rt, live.spec.glowKick ?? []);
        burstAt([live.spec.glowTap[0], live.spec.glowTap[1]]);
        return true;
      }
      if (hit.kind === "tap") {
        kickMovers(live.rt, hit.tap.kick ?? []);
        if (hit.tap.sparkle) burstAt(hit.tap.sparkle);
        if (hit.tap.lift) {
          for (const lm of sceneHandlesRef.current?.liftedMeshes ?? []) lm.impulse = 1;
        }
      }
      return true;
    };
    // Where the pointer touches the card, in cardCenterGroup space; the
    // pointer lamp hovers right above it (bubbbly uLamp).
    const lampRay = new THREE.Raycaster();
    const lampNdc = new THREE.Vector2();
    const lampTarget = new THREE.Vector3(CARD_W / 2, 0, 0);
    const lampSurfaces: THREE.Object3D[] = [coverMesh, sheetMesh, rightMesh];

    const pickRay = new THREE.Raycaster();
    const pickNdc = new THREE.Vector2();
    const toNdc = (cx: number, cy: number) => {
      const rect = container.getBoundingClientRect();
      pickNdc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      return pickNdc;
    };
    const faceOf = (panel: THREE.Object3D, normalZ: number): Face | null => {
      if (panel === sheetMesh && normalZ > 0) return "inside-right";
      if (panel === coverMesh && normalZ < 0) return "inside-left";
      return null;
    };
    pickApiRef.current = {
      pick(cx, cy) {
        pickRay.setFromCamera(toNdc(cx, cy), camera);
        const layer = elementLayerRef.current?.meshes() ?? [];
        const hits = pickRay.intersectObjects([...layer, coverMesh, sheetMesh], false);
        for (const hit of hits) {
          const isElement = typeof hit.object.userData.uid === "string";
          const panel = isElement ? hit.object.parent : hit.object;
          if (!panel) continue;
          const normalZ = isElement ? (panel === coverMesh ? -1 : 1) : (hit.face?.normal.z ?? 0);
          const face = faceOf(panel, normalZ);
          if (!face) continue;
          const local = panel.worldToLocal(hit.point.clone());
          const at = localToPlacement(face, local.x, local.y);
          return { face, x: at.x, y: at.y, uid: isElement ? (hit.object.userData.uid as string) : null };
        }
        return null;
      },
      projectFace(face) {
        const panel = face === "inside-left" ? coverMesh : sheetMesh;
        const rect = container.getBoundingClientRect();
        return [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([u, v]) => {
          const p = placementToLocal(face, u, v);
          const w = panel.localToWorld(new THREE.Vector3(p.x, p.y, p.z)).project(camera);
          return { x: ((w.x + 1) / 2) * rect.width, y: ((1 - w.y) / 2) * rect.height };
        });
      },
      project(uid) {
        const mesh = elementLayerRef.current?.meshes().find((m) => m.userData.uid === uid);
        if (!mesh) return null;
        const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
        // PlaneGeometry(…, SEGMENTS, 1): top row 0..S, bottom row S+1..2S+1.
        const last = pos.count / 2 - 1;
        const rect = container.getBoundingClientRect();
        return [0, last, pos.count - 1, last + 1].map((i) => {
          const v = new THREE.Vector3().fromBufferAttribute(pos, i);
          mesh.localToWorld(v).project(camera);
          return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height };
        });
      },
    };

    // Browsing the hand, a drag deals through it instead of turning the card.
    let handDeal = false;
    const stepPx = () => {
      const h = container.clientHeight || window.innerHeight;
      const tan = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
      return (CARD_W * HAND_STEP * h) / (2 * tan * camera.position.z);
    };
    /** Rounded offset from the front of the hand stand-in under the pointer, or null. */
    const pickHand = (e: PointerEvent): number | null => {
      if (!rig) return null;
      pickRay.setFromCamera(toNdc(e.clientX, e.clientY), camera);
      return rig.pick(pickRay);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!interactiveRef.current) return;
      handDeal = Boolean(rig) && !focusRef.current && stateRef.current.targetOpenProgress < 0.5;
      ptr.down = true;
      ptr.over = true;
      ptr.mode = "tilt";
      ptr.x0 = e.clientX;
      ptr.y0 = e.clientY;
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      ptr.t0 = performance.now();
      ptr.vx = 0;
      ptr.lastX = e.clientX;
      ptr.lastT = ptr.t0;
      ptr.totalMoved = 0;
      ptrVy = 0;
      ptrLastY = e.clientY;
      // Catch the card where it is, even mid-coast.
      const s0 = stateRef.current;
      s0.orbitVX = 0;
      s0.orbitVY = 0;
      orbitBase = { x: s0.targetDragRotX, y: s0.targetDragRotY };
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
      renderer.domElement.dataset.grabbing = "";
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      stateRef.current.hoverX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      stateRef.current.hoverY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;

      if (!ptr.down) {
        lampNdc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        lampRay.setFromCamera(lampNdc, camera);
        // Cover (front or inside-left face), insert sheet, right panel.
        const hit = lampRay.intersectObjects(lampSurfaces, false)[0];
        ptr.over = Boolean(hit);
        if (hit) lampTarget.copy(cardCenterGroup.worldToLocal(hit.point.clone()));
        // The pointer blows a breeze through the card as it sweeps across it.
        const now = performance.now();
        if (hit && interactiveRef.current && windLastT > 0) {
          const dts = Math.max(8, now - windLastT) / 1000;
          const pxPerS = (e.clientX - windLastX) / dts;
          const gust = THREE.MathUtils.clamp(pxPerS / WIND_FULL_PX_S, -1, 1);
          if (Math.abs(gust) > Math.abs(stateRef.current.wind)) stateRef.current.wind = gust;
          stateRef.current.sweepSample = {
            x: THREE.MathUtils.clamp(pxPerS, -SWEEP_MAX_PX_S, SWEEP_MAX_PX_S),
            y: THREE.MathUtils.clamp((e.clientY - windLastY) / dts, -SWEEP_MAX_PX_S, SWEEP_MAX_PX_S),
          };
        }
        windLastX = e.clientX;
        windLastY = e.clientY;
        windLastT = now;
        return;
      }

      const now = performance.now();
      const dms = Math.max(1, now - ptr.lastT);
      ptr.vx = THREE.MathUtils.lerp(
        ptr.vx,
        ((e.clientX - ptr.lastX) / dms) * 1000,
        0.4,
      );
      ptrVy = THREE.MathUtils.lerp(ptrVy, ((e.clientY - ptrLastY) / dms) * 1000, 0.4);
      ptr.lastX = e.clientX;
      ptrLastY = e.clientY;
      ptr.lastT = now;
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      ptr.totalMoved += Math.abs(e.movementX) + Math.abs(e.movementY);

      if (handDeal) {
        if (rig && Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0) > 6) {
          rig.drag(e.clientX - ptr.x0, ptr.vx, stepPx());
        }
        return;
      }
      const rot = orbitFromDrag(orbitBase, e.clientX - ptr.x0, e.clientY - ptr.y0);
      stateRef.current.targetDragRotX = rot.x;
      stateRef.current.targetDragRotY = rot.y;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!ptr.down) return;
      ptr.down = false;
      delete renderer.domElement.dataset.grabbing;

      const moved = Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0);
      const isTap = isTapGesture(moved, performance.now() - ptr.t0);

      if (rig && !isTap && handDeal) {
        const idle = performance.now() - ptr.lastT > 120;
        rig.release(idle ? 0 : ptr.vx, stepPx());
        ptr.mode = "none";
        return;
      }
      if (rig && isTap) {
        const side = pickHand(e);
        const focused = focusRef.current || stateRef.current.targetOpenProgress > 0.5;
        const onFocus = handRef.current?.onFocus;
        ptr.mode = "none";
        if (side !== null && side !== 0) {
          // A side card (or, focused, one peeking at the edge): bring it forward.
          if (focused) onFocus?.(false);
          rig.goBy(side);
          return;
        }
        if (!realShown) {
          // The front card is still landing (its stand-in is in front): a tap
          // focuses it all the same; the real card takes over as it lands.
          if (side === 0 && !focused) onFocus?.(true);
          return;
        }
        pickRay.setFromCamera(toNdc(e.clientX, e.clientY), camera);
        const onCard = pickRay.intersectObjects(lampSurfaces, false).length > 0;
        if (!focused) {
          // Browsing: a tap on the front card focuses it (the cover, not yet the inside).
          if (onCard) onFocus?.(true);
          return;
        }
        if (!onCard) {
          // Focused, a tap on empty space goes back to the hand.
          onFocus?.(false);
          return;
        }
        // Focused, on the card: fall through to the card's own tap (react, open, close).
      }

      if (isTap) {
        // A click undoes the few pixels of turn it may have made, then acts.
        stateRef.current.targetDragRotX = orbitBase.x;
        stateRef.current.targetDragRotY = orbitBase.y;
        const local = pointerToCardLocal(e, container, camera, coverMesh);
        if (stateRef.current.targetOpenProgress > 0.5) {
          // Open card: a click anywhere on it (either page) closes it.
          pickRay.setFromCamera(toNdc(e.clientX, e.clientY), camera);
          if (pickRay.intersectObjects(lampSurfaces, false).length > 0) {
            callbacksRef.current.onToggleOpen?.();
          }
        } else if (handleCoverTap(local)) {
          // A part of the picture reacted instead of the card opening.
        } else if (resolveTap(local, CARD_W) === "toggle") {
          callbacksRef.current.onToggleOpen?.();
        }
      } else {
        // The view stays where it was turned to, coasting a little on the fling.
        const idle = performance.now() - ptr.lastT > 80;
        stateRef.current.orbitVX = idle ? 0 : ptr.vx;
        stateRef.current.orbitVY = idle ? 0 : ptrVy;
        // #8 inertia: pointer velocity feeds the lifted parts' bob.
        stateRef.current.releasedImpulse = Math.min(1, Math.abs(ptr.vx) / 2400);
      }
      ptr.mode = "none";
    };

    const onPointerLeave = () => {
      if (!ptr.down) ptr.over = false;
    };

    // Browsing the hand, ← / → deal one card; Esc steps back a level.
    const onKey = (e: KeyboardEvent) => {
      if (!rig) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const opened = stateRef.current.targetOpenProgress > 0.5;
      if (e.key === "Escape") {
        if (opened) callbacksRef.current.onToggleOpen?.();
        else if (focusRef.current) handRef.current?.onFocus(false);
        return;
      }
      if (opened || focusRef.current) return;
      if (e.key === "ArrowRight") rig.goBy(1);
      else if (e.key === "ArrowLeft") rig.goBy(-1);
    };

    const domEl = renderer.domElement;
    window.addEventListener("keydown", onKey);
    domEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    domEl.addEventListener("pointerleave", onPointerLeave);

    // The gallery has a floating dock to clear; the editor's canvas does not, so centre it.
    const dockReserve = bareRef.current ? 0 : undefined;
    let stage: StageFit = fitStage(CARD_W, CARD_H, CAMERA_FOV, width / height, dockReserve);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      stage = fitStage(CARD_W, CARD_H, CAMERA_FOV, w / h, dockReserve);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      postfx?.setSize(w, h);
    };

    // #6 Postfx stack: bloom + film grain, after renderer exists.
    const postfx: PostfxStack = createPostfxStack(renderer, scene, camera);
    handleResize();
    // Browsing frames the closed card back to leave room for the fan; focus brings it in.
    const closedZ = () =>
      stage.closedZ * (rig ? THREE.MathUtils.lerp(HAND_BACKOFF, 1, stateRef.current.focus.x) : 1);
    camera.position.z = stateRef.current.isOpen ? stage.openZ : closedZ();
    // The container, not the window: editor panels change its size without a window resize.
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    let animId = 0;
    let elapsed = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const s = stateRef.current;

      if (s.isOpen && !s.prevOpen && s.targetOpenProgress < 0.5) {
        s.targetOpenProgress = 1;
      }
      s.prevOpen = s.isOpen;

      // Fire the sparkle burst once the swing actually opens past half-way.
      if (s.openProgress < 0.5 && s.targetOpenProgress > 0.5) {
        triggerBurst();
      }

      if (s.flyProgress < 1 && s.assetsReady) {
        s.flyProgress = Math.min(1, s.flyProgress + dt * 0.78 * (motion < 1 ? 1.6 : 1));
        if (s.flyProgress >= 1) s.greetIn = GREET_DELAY;
      }

      // Living card: the breeze dies away; parts sway, react and settle.
      s.wind *= Math.exp(-dt * 2.4);
      s.glowFlare = Math.max(0, s.glowFlare - dt * 1.4);
      const live = liveRef.current;
      if (live && !s.isPaused && s.openProgress < 0.95) {
        if (s.greetIn > 0) {
          s.greetIn -= dt;
          if (s.greetIn <= 0) kickMovers(live.rt, live.spec.greet, 0.8);
        }
        stepLive(live.rt, dt * motion, s.wind);
        sceneHandlesRef.current?.moverShader.writePose(live.rt);
      }
      const ease = 1 - Math.pow(1 - s.flyProgress, 3);

      if (!s.isPaused) {
        elapsed += dt;

        // Pointer sweep -> wind, as the reference: quick to build, slow to let go.
        const sample = s.sweepSample;
        const fade = Math.exp(-dt * SWEEP_SAMPLE_FADE);
        s.sweepSample = { x: sample.x * fade, y: sample.y * fade };
        const follow = (k: number, v: number) =>
          k + (v - k) * (1 - Math.exp(-dt * (Math.abs(v) > Math.abs(k) ? SWEEP_RISE : SWEEP_FALL)));
        s.sweep = { x: follow(s.sweep.x, sample.x), y: follow(s.sweep.y, sample.y) };
        // Screen px -> card units at the card's distance (screen y runs down, card y up).
        const viewH = container.clientHeight || window.innerHeight;
        const pxPerUnit = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * camera.position.z);
        const wind = { x: s.sweep.x / pxPerUnit, y: -s.sweep.y / pxPerUnit };
        snow.update(dt, elapsed, s.snowBounds, wind, motion);

        // #5 snowfall parallax scroll
        snowfallTex.offset.y -= dt * 0.012 * motion;
        // The far snow drifts with the pointer's sweep too, more gently.
        snowfallTex.offset.x -= ((wind.x * 0.12) / CARD_W) * dt;
      }

      // #1 Hinge + slide springs (see lib/cardMotion) -> angle + bow bend.
      s.hinge = stepHinge(s.hinge, s.targetOpenProgress * OPEN_MAX, dt);
      s.layout = stepSpring(s.layout, s.targetOpenProgress > 0.5 ? 1 : 0, LAYOUT_SPRING, dt);
      s.openProgress = THREE.MathUtils.clamp(s.hinge.x / OPEN_MAX, 0, 1);
      callbacksRef.current.onOpenProgress?.(s.openProgress);

      const openAngle = s.hinge.x;
      frontPivot.rotation.y = -openAngle;

      // Bow the cover: peak curvature near mid-turn, straight when shut/open.
      const bowMix = Math.sin(Math.min(Math.PI, openAngle / OPEN_MAX) * Math.PI);
      const bend = BOW_AMP * bowMix * motion;
      applyBow(frontGeo, CARD_W, bend, coverBend);
      for (const lm of sceneHandlesRef.current?.liftedMeshes ?? []) applyBow(lm.geometry, CARD_W, bend, lm.bend);
      applyBow(rightGeo, CARD_W, bend * 0.35, rightBend);
      applyBow(sheetGeo, CARD_W, bend * 0.35, sheetBend);
      elementLayerRef.current?.applyBend({ "inside-left": bend, "inside-right": bend * 0.35 });

      const handles = sceneHandlesRef.current;
      if (handles) {
        // #3 Inside shade: cover shades the inside as it swings.
        const shade = 1 - 0.45 * Math.sin(Math.min(Math.PI, openAngle / OPEN_MAX) * Math.PI);
        handles.insideLeftMat.color.copy(paperTintOf(handles.insideLeftMat)).multiplyScalar(shade);
        handles.insideRightBaseMat.color
          .copy(paperTintOf(handles.insideRightBaseMat))
          .multiplyScalar(1 - 0.28 * (1 - shade));

        // #2 Key light follows pointer a little (studio softbox nudge).
        keyTarget.position.x = THREE.MathUtils.lerp(
          keyTarget.position.x,
          s.hoverX * 0.9,
          1 - Math.exp(-dt * 4),
        );
        keyTarget.position.y = THREE.MathUtils.lerp(
          keyTarget.position.y,
          -s.hoverY * 0.6,
          1 - Math.exp(-dt * 4),
        );

        // #2b Pointer lamp rides the hover position in card space, and
        // eases off once the pointer leaves the card.
        hoverLamp.position.x = THREE.MathUtils.lerp(
          hoverLamp.position.x,
          lampTarget.x,
          1 - Math.exp(-dt * 10),
        );
        hoverLamp.position.y = THREE.MathUtils.lerp(
          hoverLamp.position.y,
          lampTarget.y,
          1 - Math.exp(-dt * 10),
        );
        const lampWanted =
          ptr.over ? LAMP_INTENSITY : 0;

        // Softbox drifts with the pointer so the sheen flows across the relief.
        softbox.position.x = THREE.MathUtils.lerp(
          softbox.position.x,
          SOFTBOX_POS.x + s.hoverX * SOFTBOX_SWAY,
          1 - Math.exp(-dt * 4),
        );
        softbox.position.y = THREE.MathUtils.lerp(
          softbox.position.y,
          SOFTBOX_POS.y - s.hoverY * SOFTBOX_SWAY,
          1 - Math.exp(-dt * 4),
        );
        softbox.lookAt(0, 0, 0);
        hoverLamp.intensity = THREE.MathUtils.lerp(
          hoverLamp.intensity,
          lampWanted,
          1 - Math.exp(-dt * 8),
        );

        // Lifted relief meshes bobbing & twinkling, with release impulse (#8).
        let impulse = s.releasedImpulse;
        s.releasedImpulse = Math.max(0, s.releasedImpulse - dt * 1.8);
        for (const lm of handles.liftedMeshes) {
          impulse = Math.max(impulse, 0);
          lm.impulse = Math.max(lm.impulse, impulse * 0.6);
          // Its lift lives in the geometry; this is only the bob on top.
          lm.mesh.position.z =
            Math.sin(elapsed * 2.1 * motion + lm.phase) * lm.bob +
            Math.sin(elapsed * 18 * motion + lm.phase) * lm.impulse * 0.012;
          if (lm.twinkle) {
            lm.material.emissiveIntensity =
              0.25 +
              0.35 * Math.sin(elapsed * 3.4 * motion + lm.phase) +
              lm.impulse * 1.4;
          }
        }
      }

      const flicker = s.glowFlicker
        ? 1 + Math.sin(elapsed * 5.2) * 0.09 + Math.sin(elapsed * 11.7) * 0.05
        : 1 + Math.sin(elapsed * 1.8) * 0.08;
      const openFade = 1 - Math.min(1, s.openProgress * 1.4);
      const flare = 1 + 1.6 * s.glowFlare * s.glowFlare;
      glowLight.intensity = 0.85 * flicker * flare * (0.15 + 0.85 * openFade);
      glowSprite.visible = s.openProgress < 0.7;
      glowSpriteMat.opacity = Math.min(1, 0.65 * flicker * flare * (0.2 + 0.8 * openFade));
      snow.points.visible = s.openProgress < 0.7;
      snowfallMat.opacity = 0.9 * openFade;
      snowfallMesh.visible = s.openProgress < 0.9;

      if (s.burstTimer > 0) {
        s.burstTimer = Math.max(0, s.burstTimer - dt);
        const bAttr = burstGeo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < burstCount; i += 1) {
          const bx = bAttr.getX(i) + burstVelocities[i * 3] * dt;
          const by = bAttr.getY(i) + burstVelocities[i * 3 + 1] * dt;
          const bz = bAttr.getZ(i) + burstVelocities[i * 3 + 2] * dt;
          burstVelocities[i * 3 + 1] -= 0.75 * dt;
          bAttr.setXYZ(i, bx, by, bz);
        }
        bAttr.needsUpdate = true;
        burstMat.opacity = Math.min(0.95, s.burstTimer / 1.1);
      } else {
        burstMat.opacity = 0;
      }

      // The card glides to centre while the cover swings, both ways.
      cardCenterGroup.position.x = (-CARD_W / 2) * (1 - s.layout.x);

      // Resting pose: almost square to the lens, like a card on a copy stand.
      const floatY = Math.sin(elapsed * 1.1 * motion) * 0.018 * motion;
      const floatRotZ = Math.sin(elapsed * 0.8) * 0.004 * motion;
      const baseRotX = 0.015;
      const baseRotY = s.openProgress > 0.5 ? 0 : -0.04;
      const baseRotZ = -0.006;

      if (!ptr.down && (s.orbitVX !== 0 || s.orbitVY !== 0)) {
        const c = coastOrbit({ x: s.targetDragRotX, y: s.targetDragRotY }, { vx: s.orbitVX, vy: s.orbitVY }, dt);
        s.targetDragRotX = c.rot.x;
        s.targetDragRotY = c.rot.y;
        const done = Math.hypot(c.vel.vx, c.vel.vy) < 5;
        s.orbitVX = done ? 0 : c.vel.vx;
        s.orbitVY = done ? 0 : c.vel.vy;
      }

      s.dragRotX = THREE.MathUtils.lerp(
        s.dragRotX,
        s.targetDragRotX + (interactiveRef.current ? s.hoverY * 0.06 : 0),
        1 - Math.exp(-dt * 8),
      );
      s.dragRotY = THREE.MathUtils.lerp(
        s.dragRotY,
        s.targetDragRotY + (interactiveRef.current ? s.hoverX * 0.08 : 0),
        1 - Math.exp(-dt * 8),
      );

      const targetCamZ = zoomedDistance(
        closedZ() + (stage.openZ - closedZ()) * s.openProgress,
        viewRef.current.zoom,
      );
      camera.position.z = THREE.MathUtils.lerp(
        camera.position.z,
        targetCamZ,
        1 - Math.exp(-dt * 5.5),
      );
      camera.position.y = stage.camYPerZ * camera.position.z;

      if (rig) {
        // The rest of the hand steps aside as the card slides open.
        s.focus = stepSpring(s.focus, focusRef.current || s.targetOpenProgress > 0.5 ? 1 : 0, LAYOUT_SPRING, dt);
        const room = Math.max(s.focus.x, s.layout.x);
        rig.update(dt, room);
        if (s.assetsReady) rig.dealIn();
        const ids = handRef.current?.templateIds ?? [];
        const front = rig.settled() && s.assetsReady && ids[rig.targetIndex()] === templateIdRef.current;
        if (front && !realShown) s.greetIn = 0.15; // the card comes alive as it lands
        realShown = front;
        rig.showFront(!realShown);
        // The hand shares the card's pointer tilt, so the stand-in lines up with it.
        rig.group.rotation.set(s.dragRotX * (1 - room), s.dragRotY * (1 - room), 0);
      }

      outerGroup.position.z = THREE.MathUtils.lerp(-14, 0, ease);
      outerGroup.position.y = THREE.MathUtils.lerp(2.2, floatY, ease);
      const scaleVal = THREE.MathUtils.lerp(0.24, 1.0, ease);
      outerGroup.scale.setScalar(scaleVal);

      outerGroup.rotation.x =
        THREE.MathUtils.lerp(-0.32, baseRotX, ease) + s.dragRotX;
      outerGroup.rotation.y =
        THREE.MathUtils.lerp(0.75, baseRotY, ease) + s.dragRotY;
      outerGroup.rotation.z =
        THREE.MathUtils.lerp(0.24, baseRotZ + floatRotZ, ease);
      if (!realShown) {
        // Stand aside beyond the far plane rather than hide: hiding would drop
        // the card's point lights from the scene, and a changed light count
        // recompiles every lit shader mid-deal.
        outerGroup.position.z = -1000;
      }

      shadowMat.opacity = ease;
      // Follow what actually casts the shadow: a cover mid-swing throws none
      // to the left of the spine. The soft padding keeps its width.
      const foot = shadowFootprint(openAngle, CARD_W);
      const footW = foot.right - foot.left;
      shadowPlane.position.x = cardCenterGroup.position.x + (foot.left + foot.right) / 2 + CARD_SHADOW_OFFSET.x;
      shadowPlane.scale.set((footW + CARD_W * (CARD_SHADOW_PAD_X - 1)) / (CARD_W * CARD_SHADOW_PAD_X), 1.0, 1.0);

      lampGate.update(hoverLamp, camera);
      postfx.render(dt);
      if (coverOnRef.current && !firstFrameFired) {
        firstFrameFired = true;
        callbacksRef.current.onFirstFrame?.();
      }
    };

    let firstFrameFired = false;
    animId = requestAnimationFrame(animate);
    callbacksRef.current.onReady?.();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("keydown", onKey);
      domEl.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      domEl.removeEventListener("pointerleave", onPointerLeave);
      resizeObserver.disconnect();
      postfx.dispose();
      rig?.dispose();
      rigRef.current = null;
      warmTarget.dispose();
      if (sceneHandlesRef.current) {
        // Every card's textures and pieces live in its kit (cutouts return to the pool).
        sceneHandlesRef.current.kits.clear();
        unwarmPieces();
        for (const mat of sceneHandlesRef.current.liftedMatPool) mat.dispose();
      }
      rightGeo.dispose();
      sheetGeo.dispose();
      frontGeo.dispose();
      shadowPlane.geometry.dispose();
      snow.dispose();
      burstGeo.dispose();
      shadowTex.dispose();
      particleTex.dispose();
      glowTex.dispose();
      paperNormalTex.dispose();
      shadowMat.dispose();
      glowSpriteMat.dispose();
      burstMat.dispose();
      paperEdgeMat.dispose();
      coverBaseMat.dispose();
      insideLeftMat.dispose();
      insideRightBaseMat.dispose();
      insideRightSheetMat.dispose();
      backMat.dispose();
      renderer.dispose();
      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
      elementLayerRef.current?.dispose();
      elementLayerRef.current = null;
      pickApiRef.current = null;
      sceneHandlesRef.current = null;
      studioEnv.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load cover.png -> derive oil-impasto normalMap, motifs, lifted cutouts & glow
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;

    let cancelled = false;
    const spec = CARD_ASSETS[templateId];
    stateRef.current.assetsReady = false;

    // Map pixel glow coordinates to card local space (X in [0..CARD_W], Y in [-CARD_H/2..CARD_H/2])
    const gx = (spec.glow.at[0] / spec.w) * CARD_W;
    const gy = (0.5 - spec.glow.at[1] / spec.h) * CARD_H;
    h.glowSprite.position.set(gx, gy, CARD_THICKNESS + 0.04);
    // A small HDR core: only the flame itself crosses the bloom threshold,
    // so the light stays on the candle instead of hazing the whole card.
    const glowSize = spec.glow.scale * GLOW_SIZE;
    h.glowSprite.scale.set(glowSize, glowSize, 1);
    h.glowSprite.material.color.setHex(spec.glow.color).multiplyScalar(GLOW_HDR);
    h.glowLight.position.set(gx, gy, CARD_THICKNESS + 0.35);
    h.glowLight.color.setHex(spec.glow.color);
    stateRef.current.glowFlicker = spec.glow.flicker;

    const liveSpec = LIVE_SPECS[templateId];
    liveRef.current = { spec: liveSpec, rt: createLiveRuntime(liveSpec) };
    h.moverShader.setMovers(packMoverUniforms(liveSpec));

    // Map snowArea to card local space
    const [sx, sy, sw, sh] = spec.snowArea;
    stateRef.current.snowBounds = {
      xMin: (sx / spec.w) * CARD_W,
      xMax: ((sx + sw) / spec.w) * CARD_W,
      yMax: (0.5 - sy / spec.h) * CARD_H,
      yMin: (0.5 - (sy + sh) / spec.h) * CARD_H,
    };

    const bare = bareRef.current;
    const key = cardKitKey(templateId, bare);
    const isCancelled = () => cancelled;

    /** This card's kit: from the cache, or built, cached and uploaded now. */
    const kitReady = async (): Promise<CardKit | null> => {
      const cached = h.kits.get(key);
      if (cached) {
        // Usually all on the GPU already; a switch cancelled mid-upload left the rest.
        await h.upload(kitUploads(cached), isCancelled);
        return cancelled ? null : cached;
      }
      const [coverImg, layered] = await Promise.all([
        loadCoverImage(spec.coverSrc),
        loadLayers(templateId),
        ensureSurfaces(templateId),
      ]);
      if (cancelled) return null;
      const { message: msg, signature: sig } = textRef.current;
      const built = await buildKit(h, { templateId, coverImg, layered, bare, message: msg, signature: sig }, isCancelled);
      if (!built) return null;
      // Cache it straight away, even if a newer switch cancels us, so nothing leaks.
      const raced = h.kits.get(key);
      if (raced) disposeKit(built, h.liftedMatPool);
      else h.kits.set(key, built);
      const kit = raced ?? built;
      // Upload while the stand-in is still on show, not on the frame the card lands.
      await h.upload(kitUploads(kit), isCancelled);
      return cancelled ? null : kit;
    };

    kitReady()
      .then(async (kit) => {
        if (cancelled || !kit) return;
        applyKit(h, kit);
        if (!bare) refreshSheet(h, kit, textRef.current.message, textRef.current.signature);
        coverImageRef.current = kit.coverImg;
        coverOnRef.current = true;
        // Compile the new material setup before the card flies, not on its first frame.
        await h.prewarm().catch(() => undefined);
        if (cancelled) return;
        stateRef.current.assetsReady = true;
        prebakeAllCards(templateId);
      })
      .catch(() => {
        // The cover failed to load: let the card in with what it has rather than hang.
        stateRef.current.assetsReady = true;
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Redraw the insert sheet when the message or signature changes. On a card
  // switch the switch itself does this, once the new card's kit is on.
  useEffect(() => {
    const h = sceneHandlesRef.current;
    const kit = h?.activeKit;
    if (!h || !kit || bareRef.current || kit.templateId !== templateId) return;
    refreshSheet(h, kit, message, signature);
  }, [templateId, message, signature]);

  useEffect(() => {
    elementLayerRef.current?.sync(elements ?? []);
  }, [elements]);

  useEffect(() => {
    if (paper) applyPaperStock(paperMatsRef.current, paper);
  }, [paper]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full cursor-grab active:cursor-grabbing select-none touch-none"
      aria-label="3D Christmas Card Canvas"
    />
  );
}
