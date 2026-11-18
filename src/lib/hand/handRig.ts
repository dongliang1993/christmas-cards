import * as THREE from "three";
import { CARD_ASSETS, type CardAssetSpec } from "../cardAssets";
import { snowMaskKey } from "../bakeKeys";
import { loadCoverImage, whenCoverBaked } from "../cardBakes";
import { CARD_H, CARD_THICKNESS, CARD_W } from "../cardConstants";
import { GLOW_HDR } from "../cardGlow";
import { decodeImages, isPreflipped } from "../gpuImages";
import { stepSpring, type Spring } from "../cardMotion";
import type { SurfaceImage } from "../cardRelief";
import { whenSurface } from "../surfaceCache";
import { CARD_SHADOW_OFFSET, CARD_SHADOW_PAD_X, CARD_SHADOW_PAD_Y, createCardShadowTexture } from "../studio";
import type { CardTemplateId } from "../types";
import { poseForOffset, standinGlow, withOpenRoom, wrappedOffset } from "./handLayout";

/**
 * The gallery's dealt hand (docs/references, Desktop/01-motion.mp4): light
 * stand-ins for every card, fanned out around the real card. At rest the
 * real card stands in the middle and its stand-in hides; while the hand
 * moves, the stand-in carries the front too, and the real card takes over
 * again once the new card has landed.
 *
 * Plain three.js, no React: the card component owns the scene and the input,
 * and drives the rig from its own frame loop.
 */
export interface HandRig {
  group: THREE.Group;
  /** Advance one frame. `open` 0..1: the front card is opened and the rest step aside. */
  update(dt: number, open: number): void;
  /** Card index the hand is heading for (or resting on). */
  targetIndex(): number;
  /** The hand has come to rest on its target. */
  settled(): boolean;
  /** First appearance: the hand sweeps in from the right and lands on its card. */
  dealIn(): void;
  /** Show the front stand-in (while the real card is hidden) or not. */
  showFront(show: boolean): void;
  /** Bring card `index` to the front by the shortest way round. */
  goTo(index: number): void;
  goBy(steps: number): void;
  /** Drag the hand: `dxPx` since the press, `stepPx` = one card step on screen. */
  drag(dxPx: number, vxPx: number, stepPx: number): void;
  /** Let go after a drag: land on the nearest card, a fling carries further. */
  release(vxPx: number, stepPx: number): void;
  /** Offset from the front (rounded) of the stand-in under the ray, or null. */
  pick(ray: THREE.Raycaster): number | null;
  dispose(): void;
}

/** Whole hand on a near-critical spring: lands without overshoot (ζ≈1). */
const DEAL_SPRING = { stiffness: 90, damping: 19 } as const;
/** Fling: how far ahead (s) a released throw is projected; at most this many cards per throw. */
const FLING_LOOKAHEAD = 0.22;
const FLING_MAX_CARDS = 3;
/** Cards lean a touch into the motion (rad per card/s), at most ~2°. */
const MOTION_LEAN = 0.012;
const MAX_LEAN = 0.035;
/** The real card's resting pose, so the front stand-in lines up with it exactly. */
const FRONT_REST = { rx: 0.015, ry: -0.04, rz: -0.006 } as const;

interface Slot {
  group: THREE.Group;
  card: THREE.Mesh;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  cover: THREE.MeshStandardMaterial;
  edge: THREE.MeshPhysicalMaterial;
  back: THREE.MeshStandardMaterial;
  snow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Sprite;
  spec: CardAssetSpec;
  seed: number;
}

/** Soft idle sway for the side cards (after the reference's per-card wobble). */
function sway(t: number, seed: number, amp: number) {
  return {
    y: 0.02 * Math.sin(1.1 * t + seed) * amp,
    rx: 0.04 * Math.sin(0.73 * t + 1.7 * seed) * amp,
    ry: (0.06 * Math.sin(0.9 * t + seed) + 0.02 * Math.sin(2.3 * t + 3.1 * seed)) * amp,
    rz: 0.012 * Math.sin(0.55 * t + 0.7 * seed) * amp,
  };
}

export function createHandRig(opts: {
  templateIds: readonly CardTemplateId[];
  initialIndex: number;
  renderer: THREE.WebGLRenderer;
  paperNormal: THREE.Texture;
  /** Shared scrolling snowfall texture (its offset is driven by the real card). */
  snowfall: THREE.Texture;
  /** Shared radial glow sprite texture for every stand-in's candle. */
  glowTexture: THREE.Texture;
  /** A card's materials changed (cover or relief arrived): the owner should
   * precompile now, not on the first frame that card shows, mid-deal.
   */
  onMaterials?: () => void;
  /** Applied to every stand-in material once (e.g. the pointer-lamp gate). */
  decorate?: (material: THREE.Material) => void;
  /** The card the hand is heading for changed (on release, tap, key). */
  onIndex: (index: number) => void;
  /** Reduced-motion factor for the idle sway. */
  motion: number;
}): HandRig {
  const { templateIds, renderer, paperNormal, onIndex, motion } = opts;
  const n = templateIds.length;
  // Two laps when the hand is short, so both ends of the fan are filled.
  const slots = n < 6 ? n * 2 : n;
  const group = new THREE.Group();

  const shadowTex = createCardShadowTexture();
  const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_THICKNESS);
  const shadowGeo = new THREE.PlaneGeometry(CARD_W * CARD_SHADOW_PAD_X, CARD_H * CARD_SHADOW_PAD_Y);
  const snowGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
  const owned: THREE.Texture[] = [];

  const slotList: Slot[] = Array.from({ length: slots }, (_, i) => {
    const spec = CARD_ASSETS[templateIds[i % n]];
    const edge = new THREE.MeshPhysicalMaterial({
      color: 0xe6ddd1,
      roughness: 0.9,
      normalMap: paperNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
    });
    const cover = new THREE.MeshStandardMaterial({ color: 0xf3eee8, roughness: 0.84, metalness: 0.02, normalMap: paperNormal });
    const back = new THREE.MeshStandardMaterial({ color: 0xf1ebe4, roughness: 0.88, normalMap: paperNormal });
    for (const m of [edge, cover, back]) opts.decorate?.(m);
    // Box faces: +x, -x, +y, -y, +z (front), -z (back).
    const card = new THREE.Mesh(cardGeo, [edge, edge, edge, edge, cover, back]);
    card.castShadow = true;
    card.receiveShadow = true;
    card.userData.handSlot = i;
    const shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.7 }),
    );
    shadow.position.set(CARD_SHADOW_OFFSET.x, CARD_SHADOW_OFFSET.y, CARD_SHADOW_OFFSET.z);
    // Snow behind the window glass, scrolling with the shared texture; its
    // alpha mask arrives with the card's bake (asset or fallback).
    const snow = new THREE.Mesh(
      snowGeo,
      new THREE.MeshBasicMaterial({ map: opts.snowfall, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    snow.position.set(0, 0, CARD_THICKNESS / 2 + 0.003);
    snow.visible = false;
    // The candle's glow: a sprite, never a light, so the light count (and
    // therefore every lit shader) stays fixed no matter how many cards show.
    const glowAt = standinGlow(spec);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: opts.glowTexture,
        color: new THREE.Color(spec.glow.color).multiplyScalar(GLOW_HDR),
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.position.set(glowAt.x, glowAt.y, glowAt.z);
    glow.scale.set(glowAt.scale, glowAt.scale, 1);
    const g = new THREE.Group();
    g.add(shadow, card, snow, glow);
    group.add(g);
    return { group: g, card, shadow, cover, edge, back, snow, glow, spec, seed: i * 1.37 };
  });

  // Covers go on as soon as the image is in; their relief + foil follow once
  // the card's bake exists (the idle prebake gets there). The rig never bakes
  // itself: that would stall the hand's entrance.
  let disposed = false;
  const unsubscribe: Array<() => void> = [];
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Uploads go one per frame in the background, so a card entering the fan
  // never uploads (and decodes) its maps on the frame it first shows.
  const uploadQueue: THREE.Texture[] = [];
  let pumping = false;
  const pump = () => {
    const x = uploadQueue.shift();
    if (disposed || !x) {
      pumping = false;
      return;
    }
    renderer.initTexture(x);
    requestAnimationFrame(pump);
  };
  /** A texture from an already-decoded source (see lib/gpuImages); null once disposed. */
  const tex = async (src: TexImageSource, srgb: boolean): Promise<THREE.Texture | null> => {
    const decoded = await decodeImages([src]);
    if (disposed) return null;
    const source = decoded.get(src) ?? src;
    const x = new THREE.Texture(source);
    if (isPreflipped(source)) x.flipY = false;
    x.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    x.anisotropy = anisotropy;
    x.needsUpdate = true;
    owned.push(x);
    uploadQueue.push(x);
    if (!pumping) {
      pumping = true;
      requestAnimationFrame(pump);
    }
    return x;
  };
  const eachLap = (t: number, fn: (s: Slot) => void) => {
    for (let i = t; i < slots; i += n) fn(slotList[i]);
  };
  templateIds.forEach((id, t) => {
    loadCoverImage(CARD_ASSETS[id].coverSrc)
      .then((img) => tex(img, true))
      .then((map) => {
        if (!map) return;
        eachLap(t, (s) => {
          s.cover.map = map;
          s.cover.color.set(0xffffff);
          s.cover.needsUpdate = true;
        });
        opts.onMaterials?.();
        unsubscribe.push(
          whenCoverBaked(id, async (baked) => {
            const [normal, surface] = await Promise.all([tex(baked.normal, false), tex(baked.surface, false)]);
            if (!normal || !surface) return;
            eachLap(t, (s) => {
              Object.assign(s.cover, { normalMap: normal, metalnessMap: surface, roughnessMap: surface });
              s.cover.metalness = 1;
              s.cover.roughness = 1;
              s.cover.needsUpdate = true;
            });
            opts.onMaterials?.();
          }),
        );
      })
      .catch(() => undefined);
    // The snow mask arrives independently of the cover art; never baked here.
    unsubscribe.push(
      whenSurface<SurfaceImage>(snowMaskKey(id), async (mask) => {
        const alpha = await tex(mask as TexImageSource, false);
        if (!alpha) return;
        eachLap(t, (s) => {
          s.snow.material.alphaMap = alpha;
          s.snow.material.needsUpdate = true;
          s.snow.visible = true;
        });
        opts.onMaterials?.();
      }),
    );
  });

  let target = opts.initialIndex;
  let deal: Spring = { x: target, v: 0 };
  let dragging = false;
  let dragFrom = 0;
  let lean = 0;
  let swayAmp = 1;
  let elapsed = 0;
  let frontShown = true;
  // Hidden until the first card is ready, then dealt in.
  group.visible = false;

  const indexOf = (slot: number) => ((Math.round(slot) % n) + n) % n;
  const setTarget = (t: number) => {
    const before = indexOf(target);
    target = t;
    if (indexOf(t) !== before) onIndex(indexOf(t));
  };

  return {
    group,
    update(dt, open) {
      elapsed += dt;
      if (!dragging) deal = stepSpring(deal, target, DEAL_SPRING, dt);
      const leanTarget = THREE.MathUtils.clamp(-deal.v * MOTION_LEAN, -MAX_LEAN, MAX_LEAN);
      lean = THREE.MathUtils.lerp(lean, leanTarget, 1 - Math.exp(-dt * 6));
      const moving = dragging || Math.abs(deal.v) > 0.05;
      swayAmp = THREE.MathUtils.lerp(swayAmp, moving ? 0 : 1, 1 - Math.exp(-dt * (moving ? 8 : 1.5)));

      for (let i = 0; i < slots; i += 1) {
        const s = slotList[i];
        const o = wrappedOffset(i, deal.x, slots);
        const p = withOpenRoom(poseForOffset(o), o, open);
        // The front settles into the real card's resting pose; it does not sway.
        const front = Math.max(0, 1 - 2 * Math.abs(o));
        const w = sway(elapsed, s.seed, swayAmp * motion * 0.5 * (1 - front));
        s.group.visible = p.opacity > 0 && (front < 0.99 || frontShown);
        s.group.position.set(p.x, p.y + w.y, p.z);
        s.group.rotation.set(
          w.rx + FRONT_REST.rx * front,
          p.ry + w.ry + FRONT_REST.ry * front,
          p.rz + w.rz + FRONT_REST.rz * front + lean * (1 - Math.min(1, Math.abs(o)) * 0.4),
        );
        s.group.scale.setScalar(p.scale);
        s.cover.color.setScalar(s.cover.map ? p.light : p.light * 0.95);
        s.edge.color.setRGB(0.9 * p.light, 0.866 * p.light, 0.82 * p.light);
        // Far cards cast fainter studio shadows, or they pile up into a grey band under the arc.
        s.shadow.material.opacity = 0.7 * Math.max(0.25, 1 - 0.4 * Math.abs(o));
        // Nearer to the front draws later, so the front card always lies on top.
        s.card.renderOrder = 10 - Math.abs(o);
        s.snow.renderOrder = s.card.renderOrder + 0.1;
        s.glow.renderOrder = s.card.renderOrder + 0.2;
        s.shadow.renderOrder = 9 - Math.abs(o);
        // The candle breathes on its own phase, like the real card's flicker.
        const flicker = s.spec.glow.flicker
          ? 1 + Math.sin(elapsed * 5.2 + s.seed) * 0.09 + Math.sin(elapsed * 11.7 + s.seed) * 0.05
          : 1 + Math.sin(elapsed * 1.8 + s.seed) * 0.08;
        s.glow.material.opacity = 0.65 * flicker;
      }
    },
    dealIn() {
      if (group.visible) return;
      group.visible = true;
      deal = { x: target + 1.8, v: 0 };
    },
    targetIndex: () => indexOf(target),
    // Close enough that the real card can take over without a visible jump (~1/100 of a step).
    settled: () => !dragging && Math.abs(deal.x - target) < 0.01 && Math.abs(deal.v) < 0.05,
    showFront(show) {
      frontShown = show;
    },
    goTo(index) {
      const cur = indexOf(target);
      if (cur !== index) setTarget(Math.round(target) + Math.round(wrappedOffset(index, cur, n)));
    },
    goBy(steps) {
      setTarget(Math.round(target) + steps);
    },
    drag(dxPx, vxPx, stepPx) {
      if (!dragging) {
        dragging = true;
        dragFrom = deal.x;
      }
      // The hand follows the finger 1:1.
      deal = { x: dragFrom - dxPx / stepPx, v: -vxPx / stepPx };
    },
    release(vxPx, stepPx) {
      if (!dragging) return;
      dragging = false;
      const v = -vxPx / stepPx;
      const throwTo = deal.x + v * FLING_LOOKAHEAD;
      const steps = THREE.MathUtils.clamp(Math.round(throwTo) - Math.round(dragFrom), -FLING_MAX_CARDS, FLING_MAX_CARDS);
      setTarget(Math.round(dragFrom) + steps);
    },
    pick(ray) {
      const hit = ray.intersectObjects(slotList.filter((s) => s.group.visible).map((s) => s.card), false)[0];
      if (!hit) return null;
      return Math.round(wrappedOffset(hit.object.userData.handSlot as number, deal.x, slots));
    },
    dispose() {
      disposed = true;
      for (const off of unsubscribe) off();
      for (const s of slotList) {
        s.cover.dispose();
        s.edge.dispose();
        s.back.dispose();
        s.shadow.material.dispose();
        s.snow.material.dispose();
        s.glow.material.dispose();
      }
      for (const t of owned) t.dispose();
      cardGeo.dispose();
      shadowGeo.dispose();
      snowGeo.dispose();
      shadowTex.dispose();
      // opts.snowfall / opts.glowTexture belong to the card, not to the rig.
    },
  };
}
