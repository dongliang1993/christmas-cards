import * as THREE from "three";
import { CARD_ASSETS } from "../cardAssets";
import { applyBow, BOW_AMP, captureBendBuffers, OPEN_MAX, type BendBuffers } from "../cardBend";
import { LAYOUT_SPRING, stepHinge, stepSpring, type Spring } from "../cardMotion";
import { shadowFootprint } from "../cardStage";
import { paperTintOf } from "./paperStocks";
import { CARD_H, CARD_THICKNESS, CARD_W, SHEET_H, SHEET_THICKNESS, SHEET_W } from "../cardConstants";
import { GLOW_HDR, GLOW_SIZE } from "../cardGlow";
import { createCardSnow } from "../cardSnow";
import type { LampGate } from "../lampGate";
import { LIVE_SPECS, type LiveSpec } from "../live/liveSpec";
import { createLiveRuntime, packMoverUniforms, stepLive, type LiveRuntime } from "../live/movers";
import { installMoverShader, type MoverShaderHandle } from "../live/moverShader";
import { CARD_SHADOW_OFFSET, CARD_SHADOW_PAD_X, CARD_SHADOW_PAD_Y } from "../studio";
import type { CardTemplateId } from "../types";
import { putSurface, type CardFace, type CardInside, type RuntimeLiftedMesh } from "./cardKit";

/** Cover artwork size in pixels; living-card positions are in these. */
export const COVER_PX_W = 940;
export const COVER_PX_H = 1316;
/** The candle's light on the paper around it (its sprite's gain is GLOW_HDR). */
const GLOW_LIGHT = 0.55;
/** Segmented panels so the CPU bow can curve them. */
const BEND_SEGMENTS = 24;

/** Shared by every body in a scene. */
export interface BodyContext {
  paperNormalTex: THREE.Texture;
  snowfallTex: THREE.Texture;
  glowTex: THREE.Texture;
  shadowTex: THREE.Texture;
  lampGate: LampGate;
  /**
   * Fills a template card's inside map slots before its inside arrives, so a
   * material never changes which maps it has (that would switch programs).
   */
  placeholders: { map: THREE.Texture; normal: THREE.Texture; surface: THREE.Texture } | null;
}

export interface BodyMaterials {
  edge: THREE.MeshPhysicalMaterial;
  cover: THREE.MeshStandardMaterial;
  insideLeft: THREE.MeshPhysicalMaterial;
  insideRightBase: THREE.MeshPhysicalMaterial;
  insideRightSheet: THREE.MeshPhysicalMaterial;
  back: THREE.MeshStandardMaterial;
}

/** Ambient motion inputs: what every real card does on its own each frame. */
export interface AmbientInput {
  dt: number;
  elapsed: number;
  motion: number;
  paused: boolean;
  /** 0 shut .. 1 open. */
  openProgress: number;
  /** A tapped light's flare, 0..1. */
  glowFlare: number;
  /** Pointer breeze, -1..1 (movers), and its sweep in card units/s (flakes). */
  wind: number;
  sweep: { x: number; y: number };
  /** A fling's kick to the raised pieces, 0..1. */
  impulse: number;
}

/**
 * One real card: the cover, right page and insert sheet as bendable boxes,
 * the snowfall behind the window, the candle (sprite + its own light), the
 * falling flakes, the drop shadow, the raised pieces and the living parts.
 * A card's art arrives as a face and an inside (lib/card/cardKit), cached
 * outside the body so it can move between bodies.
 */
export interface CardBody {
  /** Posed as a whole (fly-in, float, the hand's slot). */
  outer: THREE.Group;
  /** Slides to centre as the card opens. */
  center: THREE.Group;
  frontPivot: THREE.Group;
  coverMesh: THREE.Mesh;
  rightMesh: THREE.Mesh;
  sheetMesh: THREE.Mesh;
  geos: { front: THREE.BoxGeometry; right: THREE.BoxGeometry; sheet: THREE.BoxGeometry };
  bends: { cover: BendBuffers; right: BendBuffers; sheet: BendBuffers };
  mats: BodyMaterials;
  glowLight: THREE.PointLight;
  shadowPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  moverShader: MoverShaderHandle;
  templateId: CardTemplateId | null;
  face: CardFace | null;
  inside: CardInside | null;
  live: { spec: LiveSpec; rt: LiveRuntime } | null;
  liftedMeshes: RuntimeLiftedMesh[];
  /** The cover's hinge (rad) and the slide to centre (0 shut .. 1 open), as springs. */
  hinge: Spring;
  layout: Spring;
  /**
   * Step the hinge and the slide toward `open` (0..1): swing the cover, bow
   * the paper, shade the inside, slide to centre, fit the shadow. Returns
   * how open it is (0..1) and the cover's bend.
   */
  stepOpen(dt: number, open: number, motion: number): { open: number; bend: number };
  /** Take the face off (its pieces leave with it). */
  clearFace(): void;
  /** Point the candle, the snow and the living parts at a card. */
  setCard(templateId: CardTemplateId): void;
  /** Put a face on (its pieces move here). Nothing is freed: faces are cached. */
  applyFace(face: CardFace): void;
  applyInside(inside: CardInside | null): void;
  /** Phase offset for the candle's flicker, so cards don't breathe in step. */
  setPhase(phase: number): void;
  ambient(input: AmbientInput): void;
  /** The fan's shade for cards away from the front (1 = full light). */
  shade(light: number): void;
  dispose(): void;
}

function createMaterials(ctx: BodyContext): BodyMaterials {
  const paper = ctx.paperNormalTex;
  const edge = new THREE.MeshPhysicalMaterial({
    color: 0xe6ddd1,
    roughness: 0.9,
    metalness: 0.0,
    normalMap: paper,
    normalScale: new THREE.Vector2(0.8, 0.8),
  });
  const cover = new THREE.MeshStandardMaterial({
    roughness: 0.84,
    metalness: 0.02,
    normalMap: paper,
    normalScale: new THREE.Vector2(1, 1),
  });
  // Foil defaults so swapping maps in the loader works cleanly.
  cover.metalness = 0.55;
  cover.roughness = 0.6;
  const insideLeft = new THREE.MeshPhysicalMaterial({
    roughness: 0.86,
    metalness: 0.01,
    normalMap: paper,
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
  // Inside shade base colour; animated by the open angle in the frame loop.
  insideLeft.color = new THREE.Color(0xffffff);
  const insideRightBase = new THREE.MeshPhysicalMaterial({
    roughness: 0.86,
    metalness: 0.01,
    normalMap: paper,
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
  const insideRightSheet = new THREE.MeshPhysicalMaterial({
    roughness: 0.82,
    metalness: 0.01,
    normalMap: paper,
    normalScale: new THREE.Vector2(0.7, 0.7),
  });
  const back = new THREE.MeshStandardMaterial({
    roughness: 0.88,
    metalness: 0.01,
    normalMap: paper,
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
  // The cover is gated after its mover shader (see createCardBody): that one
  // replaces onBeforeCompile outright, while the gate chains onto what is there.
  for (const m of [edge, insideLeft, insideRightBase, insideRightSheet, back]) ctx.lampGate.install(m);
  return { edge, cover, insideLeft, insideRightBase, insideRightSheet, back };
}

/** Fill the inside's map slots with placeholders (template cards), so its programs never change. */
function placeholderInside(mats: BodyMaterials, ph: NonNullable<BodyContext["placeholders"]>): void {
  for (const m of [mats.insideLeft, mats.insideRightBase, mats.back, mats.insideRightSheet]) m.map = ph.map;
  putSurface(mats.insideLeft, ph);
  putSurface(mats.insideRightSheet, ph);
}

export function createCardBody(ctx: BodyContext, startOpen = false): CardBody {
  const outer = new THREE.Group();
  const center = new THREE.Group();
  outer.add(center);
  const mats = createMaterials(ctx);
  const moverShader = installMoverShader(mats.cover, COVER_PX_W, COVER_PX_H);
  // After the movers: the gate chains onto them (the other order drops the gate).
  ctx.lampGate.install(mats.cover);
  const { edge } = mats;

  const rightGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_THICKNESS, BEND_SEGMENTS, 1, 1);
  const rightMesh = new THREE.Mesh(rightGeo, [edge, edge, edge, edge, mats.insideRightBase, mats.back]);
  rightMesh.position.set(CARD_W / 2, 0, 0);
  rightMesh.castShadow = true;
  rightMesh.receiveShadow = true;
  center.add(rightMesh);

  const sheetGeo = new THREE.BoxGeometry(SHEET_W, SHEET_H, SHEET_THICKNESS, BEND_SEGMENTS, 1, 1);
  const sheetMesh = new THREE.Mesh(sheetGeo, [edge, edge, edge, edge, mats.insideRightSheet, edge]);
  sheetMesh.position.set(CARD_W / 2, 0, CARD_THICKNESS * 0.5 + 0.005);
  sheetMesh.castShadow = true;
  sheetMesh.receiveShadow = true;
  center.add(sheetMesh);

  const frontPivot = new THREE.Group();
  frontPivot.position.set(0, 0, CARD_THICKNESS * 0.5 + 0.026);
  center.add(frontPivot);

  const frontGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_THICKNESS, BEND_SEGMENTS, 1, 1);
  const coverMesh = new THREE.Mesh(frontGeo, [edge, edge, edge, edge, mats.cover, mats.insideLeft]);
  coverMesh.position.set(CARD_W / 2, 0, CARD_THICKNESS * 0.5);
  coverMesh.castShadow = true;
  coverMesh.receiveShadow = true;
  frontPivot.add(coverMesh);

  // Snowfall parallax layer above the cover artwork.
  const snowfallMat = new THREE.MeshBasicMaterial({
    map: ctx.snowfallTex,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const snowfallMesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), snowfallMat);
  snowfallMesh.position.set(CARD_W / 2, 0, CARD_THICKNESS + 0.003);
  frontPivot.add(snowfallMesh);

  // The candle: a warm sprite + a short-reach light that warms its corner.
  const glowSpriteMat = new THREE.SpriteMaterial({
    map: ctx.glowTex,
    color: 0xffb854,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowSprite = new THREE.Sprite(glowSpriteMat);
  glowSprite.position.set(CARD_W / 2 - 0.35, -0.62, CARD_THICKNESS + 0.04);
  frontPivot.add(glowSprite);
  const glowLight = new THREE.PointLight(0xffb854, 0.75, 1.3);
  glowLight.position.set(CARD_W / 2 - 0.35, -0.62, CARD_THICKNESS + 0.35);
  frontPivot.add(glowLight);

  // Real flakes strictly inside the artwork's snow area, blown by the pointer.
  const snow = createCardSnow({ count: 40, size: 0.15, z: CARD_THICKNESS + 0.04 });
  frontPivot.add(snow.points);
  let snowBounds = { xMin: 0.45, xMax: 2.15, yMin: -0.9, yMax: 1.2 };
  let glowFlicker = true;
  let phase = 0;

  const shadowMat = new THREE.MeshBasicMaterial({ map: ctx.shadowTex, transparent: true, depthWrite: false, opacity: 0.85 });
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W * CARD_SHADOW_PAD_X, CARD_H * CARD_SHADOW_PAD_Y),
    shadowMat,
  );
  // Just behind the card, as if it stood a finger's width off the sweep.
  shadowPlane.position.set(CARD_SHADOW_OFFSET.x, CARD_SHADOW_OFFSET.y, CARD_SHADOW_OFFSET.z);
  outer.add(shadowPlane);

  if (ctx.placeholders) placeholderInside(mats, ctx.placeholders);

  const edgeBase = edge.color.clone();
  // NaN: the first stepOpen always lays the card out.
  let lastBend = Number.NaN;
  let lastAngle = Number.NaN;
  const body: CardBody = {
    outer,
    center,
    frontPivot,
    coverMesh,
    rightMesh,
    sheetMesh,
    geos: { front: frontGeo, right: rightGeo, sheet: sheetGeo },
    bends: { cover: captureBendBuffers(frontGeo), right: captureBendBuffers(rightGeo), sheet: captureBendBuffers(sheetGeo) },
    mats,
    glowLight,
    shadowPlane,
    moverShader,
    templateId: null,
    face: null,
    inside: null,
    live: null,
    liftedMeshes: [],
    hinge: { x: startOpen ? OPEN_MAX : 0, v: 0 },
    layout: { x: startOpen ? 1 : 0, v: 0 },
    stepOpen(dt, open, motion) {
      const wasStill = body.hinge.v === 0 && body.layout.v === 0;
      body.hinge = stepHinge(body.hinge, open * OPEN_MAX, dt);
      body.layout = stepSpring(body.layout, open > 0.5 ? 1 : 0, LAYOUT_SPRING, dt);
      const angle = body.hinge.x;
      const progress = THREE.MathUtils.clamp(angle / OPEN_MAX, 0, 1);
      // Bow the cover: peak curvature near mid-turn, straight when shut/open.
      const bowMix = Math.sin(Math.min(Math.PI, angle / OPEN_MAX) * Math.PI);
      const bend = BOW_AMP * bowMix * motion;
      // A shut card at rest needs none of this every frame.
      if (wasStill && bend === 0 && lastBend === 0 && angle === lastAngle) return { open: progress, bend };
      lastBend = bend;
      lastAngle = angle;
      frontPivot.rotation.y = -angle;
      applyBow(frontGeo, CARD_W, bend, body.bends.cover);
      for (const lm of body.liftedMeshes) applyBow(lm.geometry, CARD_W, bend, lm.bend);
      applyBow(rightGeo, CARD_W, bend * 0.35, body.bends.right);
      applyBow(sheetGeo, CARD_W, bend * 0.35, body.bends.sheet);
      // The cover shades the inside as it swings.
      const shade = 1 - 0.45 * bowMix;
      mats.insideLeft.color.copy(paperTintOf(mats.insideLeft)).multiplyScalar(shade);
      mats.insideRightBase.color.copy(paperTintOf(mats.insideRightBase)).multiplyScalar(1 - 0.28 * (1 - shade));
      // The card glides to centre while the cover swings, both ways.
      center.position.x = (-CARD_W / 2) * (1 - body.layout.x);
      // Follow what actually casts the shadow: a cover mid-swing throws none
      // to the left of the spine. The soft padding keeps its width.
      const foot = shadowFootprint(angle, CARD_W);
      const footW = foot.right - foot.left;
      shadowPlane.position.x = center.position.x + (foot.left + foot.right) / 2 + CARD_SHADOW_OFFSET.x;
      shadowPlane.scale.set((footW + CARD_W * (CARD_SHADOW_PAD_X - 1)) / (CARD_W * CARD_SHADOW_PAD_X), 1, 1);
      return { open: progress, bend };
    },
    clearFace() {
      for (const lm of body.liftedMeshes) lm.mesh.removeFromParent();
      body.liftedMeshes = [];
      body.face = null;
    },
    setCard(templateId) {
      body.templateId = templateId;
      const spec = CARD_ASSETS[templateId];
      // Pixel glow coordinates -> card local space (x 0..CARD_W from the spine).
      const gx = (spec.glow.at[0] / spec.w) * CARD_W;
      const gy = (0.5 - spec.glow.at[1] / spec.h) * CARD_H;
      glowSprite.position.set(gx, gy, CARD_THICKNESS + 0.04);
      // A small HDR core: only the flame crosses the bloom threshold.
      const glowSize = spec.glow.scale * GLOW_SIZE;
      glowSprite.scale.set(glowSize, glowSize, 1);
      glowSpriteMat.color.setHex(spec.glow.color).multiplyScalar(GLOW_HDR);
      glowLight.position.set(gx, gy, CARD_THICKNESS + 0.35);
      glowLight.color.setHex(spec.glow.color);
      glowFlicker = spec.glow.flicker;
      const liveSpec = LIVE_SPECS[templateId];
      body.live = { spec: liveSpec, rt: createLiveRuntime(liveSpec) };
      moverShader.setMovers(packMoverUniforms(liveSpec));
      const [sx, sy, sw, sh] = spec.snowArea;
      snowBounds = {
        xMin: (sx / spec.w) * CARD_W,
        xMax: ((sx + sw) / spec.w) * CARD_W,
        yMax: (0.5 - sy / spec.h) * CARD_H,
        yMin: (0.5 - (sy + sh) / spec.h) * CARD_H,
      };
    },
    applyFace(face) {
      mats.cover.map = face.coverMap;
      putSurface(mats.cover, face.coverRelief);
      snowfallMat.alphaMap = face.snowMask;
      mats.cover.needsUpdate = true;
      snowfallMat.needsUpdate = true;
      for (const lm of body.liftedMeshes) lm.mesh.removeFromParent();
      body.liftedMeshes = face.lifted;
      for (const lm of face.lifted) coverMesh.add(lm.mesh);
      body.face = face;
    },
    applyInside(inside) {
      body.inside = inside;
      const ph = ctx.placeholders;
      if (!inside) {
        if (ph) placeholderInside(mats, ph);
      } else {
        mats.insideLeft.map = inside.leftMap;
        mats.insideRightBase.map = inside.rightBaseMap;
        mats.back.map = inside.backMap;
        mats.insideRightSheet.map = inside.sheet.map;
        if (inside.leftRelief) putSurface(mats.insideLeft, inside.leftRelief);
        if (inside.sheetRelief) putSurface(mats.insideRightSheet, inside.sheetRelief);
      }
      for (const m of [mats.insideLeft, mats.insideRightBase, mats.back, mats.insideRightSheet]) m.needsUpdate = true;
    },
    setPhase(p) {
      phase = p;
    },
    ambient(a) {
      const live = body.live;
      if (live && !a.paused && a.openProgress < 0.95) {
        stepLive(live.rt, a.dt * a.motion, a.wind);
        moverShader.writePose(live.rt);
      }
      if (!a.paused) snow.update(a.dt, a.elapsed, snowBounds, a.sweep, a.motion);
      for (const lm of body.liftedMeshes) {
        lm.impulse = Math.max(lm.impulse, a.impulse * 0.6);
        // Its lift lives in the geometry; this is only the bob on top.
        lm.mesh.position.z =
          Math.sin(a.elapsed * 2.1 * a.motion + lm.phase) * lm.bob +
          Math.sin(a.elapsed * 18 * a.motion + lm.phase) * lm.impulse * 0.012;
        if (lm.twinkle) {
          lm.material.emissiveIntensity =
            0.25 + 0.35 * Math.sin(a.elapsed * 3.4 * a.motion + lm.phase) + lm.impulse * 1.4;
        }
      }
      const t = a.elapsed;
      const flicker = glowFlicker
        ? 1 + Math.sin(t * 5.2 + phase) * 0.09 + Math.sin(t * 11.7 + phase) * 0.05
        : 1 + Math.sin(t * 1.8 + phase) * 0.08;
      const openFade = 1 - Math.min(1, a.openProgress * 1.4);
      const flare = 1 + 1.6 * a.glowFlare * a.glowFlare;
      glowLight.intensity = GLOW_LIGHT * flicker * flare * (0.15 + 0.85 * openFade);
      glowSprite.visible = a.openProgress < 0.7;
      glowSpriteMat.opacity = Math.min(1, 0.65 * flicker * flare * (0.2 + 0.8 * openFade));
      snow.points.visible = a.openProgress < 0.7;
      snowfallMat.opacity = 0.9 * openFade;
      snowfallMesh.visible = a.openProgress < 0.9;
    },
    shade(light) {
      mats.cover.color.setScalar(light);
      edge.color.copy(edgeBase).multiplyScalar(light);
    },
    dispose() {
      for (const lm of body.liftedMeshes) lm.mesh.removeFromParent();
      frontGeo.dispose();
      rightGeo.dispose();
      sheetGeo.dispose();
      snowfallMesh.geometry.dispose();
      snowfallMat.dispose();
      glowSpriteMat.dispose();
      snow.dispose();
      shadowPlane.geometry.dispose();
      shadowMat.dispose();
      for (const m of Object.values(mats)) m.dispose();
      outer.removeFromParent();
    },
  };
  return body;
}
