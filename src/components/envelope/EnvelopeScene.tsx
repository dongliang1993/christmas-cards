"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PAPER_STOCKS } from "@/lib/card/paperStocks";
import { CARD_H, CARD_W } from "@/lib/cardConstants";
import { createPostfxStack } from "@/lib/cardPostfx";
import { buildSurface } from "@/lib/cardRelief";
import { cachedSurface } from "@/lib/surfaceCache";
import { fitStage, studioBackgroundColor } from "@/lib/cardStage";
import { buildPaperEnvelope } from "@/lib/envelope/paperEnvelope";
import { envelopeHint, type EnvelopeMode } from "@/lib/envelope/sceneHints";
import { initialSeal, sealPressStep, sealVisual, type SealState } from "@/lib/envelope/sealPress";
import { OPEN_TIMELINE_S, openPose, SEAL_TIMELINE_S, sealPose, type EnvelopePose } from "@/lib/envelope/timeline";
import { buildWaxSeal } from "@/lib/envelope/waxSeal";
import type { EnvelopeColor, PaperStock, Seal } from "@/lib/letter/model";
import {
  addStudioEnvironment,
  addStudioLights,
  CARD_SHADOW_OFFSET,
  CARD_SHADOW_PAD_X,
  CARD_SHADOW_PAD_Y,
  createCardShadowTexture,
  createStudioRenderer,
} from "@/lib/studio";
import { changeGate } from "@/lib/envelope/changeGate";

export type { EnvelopeMode };

interface Props {
  mode: EnvelopeMode;
  envelopeColor: EnvelopeColor;
  seal: Seal;
  /** The card's cover, as it slides in (seal) or out (open). */
  coverSrc: string;
  /** The card's stock, for its edges. */
  paper?: PaperStock;
  /** "12月24日": shown under an envelope still in transit. */
  deliverLabel?: string | null;
  /** Sender came back to an envelope already sealed: show it shut, no replay. */
  startSealed?: boolean;
  onSealed?(): void;
  /** The card has left the envelope: show the card itself now. */
  onOpened?(): void;
  /** The first frame with the card's cover on has been drawn. */
  onFirstFrame?(): void;
}

const FOV = 30;
/** Card depth inside the envelope: thin enough for the pocket's slot. */
const CARD_DEPTH = 0.022;
/** Hold on the cooled seal, then the envelope settles, before moving on. */
const SEALED_HOLD_S = 0.6;
const SETTLE_S = 0.35;

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isSmallScreen(): boolean {
  return typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 600;
}

/** The closed card as the envelope scene shows it: the cover with its relief, paper edges. */
function buildCard(coverSrc: string, paper: PaperStock) {
  const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xe6ddd1).multiply(new THREE.Color(PAPER_STOCKS[paper].tint)), roughness: 0.9 });
  const cover = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.02 });
  const geometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_DEPTH);
  const mesh = new THREE.Mesh(geometry, [edge, edge, edge, edge, cover, edge]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The card scene's own soft studio shadow, so the hand-off frames match.
  const shadowTex = createCardShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 1 });
  const shadowGeo = new THREE.PlaneGeometry(CARD_W * CARD_SHADOW_PAD_X, CARD_H * CARD_SHADOW_PAD_Y);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.set(CARD_SHADOW_OFFSET.x, CARD_SHADOW_OFFSET.y, CARD_SHADOW_OFFSET.z);
  mesh.add(shadow);
  const owned: { dispose(): void }[] = [edge, cover, geometry, shadowTex, shadowMat, shadowGeo];
  const img = new Image();
  let cancelled = false;
  let ready = false;
  img.onload = () => {
    if (cancelled) return;
    const map = new THREE.Texture(img);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    // Same key as the card scene, which has usually baked this cover a moment ago.
    const baked = cachedSurface(`${coverSrc}|1`, () => buildSurface(img, 1));
    const normal = new THREE.CanvasTexture(baked.normal);
    const surface = new THREE.CanvasTexture(baked.surface);
    Object.assign(cover, { map, normalMap: normal, metalnessMap: surface, roughnessMap: surface, metalness: 1, roughness: 1 });
    cover.needsUpdate = true;
    owned.push(map, normal, surface);
    ready = true;
  };
  img.src = coverSrc;
  return {
    mesh,
    /** The cover is on: until then the card would show as a blank box. */
    isReady: () => ready,
    /** Fades as the card lifts off the sweep; inside the envelope it is hidden behind the paper. */
    setShadow: (opacity: number) => {
      shadowMat.opacity = opacity;
    },
    dispose() {
      cancelled = true;
      for (const o of owned) o.dispose();
    },
  };
}

/**
 * The envelope moment (spec §4, §5, §6), shot in the card's own studio: the
 * card drops into a paper envelope, the flap bends shut, the sender presses
 * the wax; the recipient breaks it and the card slides back out.
 */
export function EnvelopeScene({ mode, envelopeColor, seal, coverSrc, paper = "cold-press", deliverLabel = null, startSealed = false, onSealed, onOpened, onFirstFrame }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const press = useRef<(kind: "down" | "up") => void>(() => {});
  const callbacks = useRef({ onSealed, onOpened, onFirstFrame });
  callbacks.current = { onSealed, onOpened, onFirstFrame };
  const [ring, setRing] = useState<{ x: number; y: number; r: number; p: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // Read once: the same envelope stays mounted from 封装 into 寄出, and sealing
  // it must not restart it.
  const startSealedAtMount = useRef(startSealed);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduced = reducedMotion();

    const renderer = createStudioRenderer();
    renderer.localClippingEnabled = true;
    // Absolutely placed, so a stale pixel size never props its box open while it resizes.
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = studioBackgroundColor();
    const studioEnv = addStudioEnvironment(renderer, scene);
    const { key } = addStudioLights(scene, { shadowMapSize: isSmallScreen() ? 1024 : 2048 });
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 6.5, bottom: -5 });
    key.shadow.camera.updateProjectionMatrix();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    const post = createPostfxStack(renderer, scene, camera);

    const envelope = buildPaperEnvelope(envelopeColor, renderer.capabilities.getMaxAnisotropy());
    scene.add(envelope.group);
    // Baking the wax takes a moment: do it when the press starts, or now if it starts out sealed.
    let wax: ReturnType<typeof buildWaxSeal> | null = null;
    const ensureWax = () => {
      if (wax) return wax;
      wax = buildWaxSeal(seal);
      wax.group.position.copy(envelope.sealAt);
      envelope.group.add(wax.group);
      return wax;
    };
    const card = buildCard(coverSrc, paper);
    scene.add(card.mesh);

    let stage = fitStage(CARD_W, CARD_H, FOV, 1, 0);
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      post.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      stage = fitStage(CARD_W, CARD_H, FOV, w / h, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const startsSealed = startSealedAtMount.current;
    const sealed = mode !== "seal" || startsSealed;
    if (sealed) ensureWax();
    let sealState: SealState = initialSeal(sealed ? "sealed" : "idle");
    // Sequence time: the sender's runs from the card; the recipient's waits on the seal.
    let t = mode === "seal" && (startsSealed || reduced) ? SEAL_TIMELINE_S : 0;
    let opening = false;
    // Starting sealed means the dip already happened: never replay it.
    let sealedFor = startsSealed ? SEALED_HOLD_S + SETTLE_S + 1 : -1;
    const spreadChanged = changeGate();
    let firstFrameFired = false;
    let sealedFired = startsSealed;
    let openedFired = false;
    let wiggle = 0;
    let elapsed = 0;
    let lastHint: string | null = null;

    press.current = (kind) => {
      const ready = mode !== "seal" || sealPose(t).phase === "ready";
      if (mode === "seal" && ready) {
        if (kind === "down") ensureWax();
        sealState = sealPressStep(sealState, { type: kind === "down" ? "press" : "release" }, reduced);
      } else if (mode === "open" && kind === "down" && sealState.stage === "sealed") {
        sealState = sealPressStep(sealState, { type: "break" }, reduced);
      } else if (mode === "transit" && kind === "down") {
        wiggle = 1;
      }
    };

    const look = new THREE.Vector3();
    const sealWorld = new THREE.Vector3();
    const applyPose = (pose: EnvelopePose) => {
      envelope.group.position.y = pose.envelope.y;
      envelope.setFold(pose.flapFold);
      card.mesh.position.set(pose.card.x, pose.card.y, pose.card.z);
      card.mesh.rotation.set(pose.card.rotX, pose.card.rotY, pose.card.rotZ);
      // Head-on (oblique 0) is exactly the card scene's camera; oblique swings a little right and up.
      const z = stage.closedZ * pose.camera.distance;
      const ob = pose.camera.oblique;
      look.set(0, pose.camera.lookY + stage.camYPerZ * z * (1 - ob), 0);
      camera.position.set(look.x + ob * 0.07 * z, look.y - ob * 0.065 * z, z);
      camera.lookAt(look);
    };

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Hold everything until the cover is on, so the first frame is the card itself.
      if (!card.isReady()) return;
      elapsed += dt;

      // The sequence.
      let pose: EnvelopePose;
      if (mode === "seal") {
        t = Math.min(SEAL_TIMELINE_S, t + dt);
        pose = sealPose(t);
      } else {
        if (opening) t = Math.min(OPEN_TIMELINE_S, t + (reduced ? OPEN_TIMELINE_S : dt));
        pose = openPose(t);
        card.mesh.visible = opening;
      }

      // Wax.
      sealState = sealPressStep(sealState, { type: "tick", dt: dt * 1000 }, reduced);
      const v = sealVisual(sealState);
      const spread = sealState.stage === "idle" ? 0 : sealState.stage === "pressing" ? 0.25 * v.press : 0.25 + 0.75 * easeOut(v.spread);
      if (wax) {
        wax.group.visible = spread > 0.01 && v.crack < 1;
        const target = sealState.stage === "sealed" || sealState.stage === "breaking" ? 1 : spread;
        if (wax.group.visible && spreadChanged(target)) wax.setSpread(target);
        // Hot wax is wet and glossy with a faint warm glow; it dulls as it cools
        // to the finished seal. (A strong glow flattened it to orange plastic.)
        const heat = sealState.stage === "idle" ? 0 : 1 - v.cool;
        for (const m of wax.material) {
          m.emissiveIntensity = heat * 0.18;
          m.roughness = 0.32 - 0.2 * heat;
          m.clearcoatRoughness = 0.16 - 0.1 * heat;
          m.opacity = 1 - Math.max(0, v.crack - 0.5) * 2;
        }
        const split = 0.06 * easeOut(v.crack);
        const fall = 1.8 * v.crack * v.crack;
        wax.halves[0].position.set(-split, -fall, 0);
        wax.halves[1].position.set(split, -fall * 0.8, 0);
        wax.halves[0].rotation.z = 0.5 * v.crack;
        wax.halves[1].rotation.z = -0.4 * v.crack;
        wax.group.getWorldPosition(sealWorld);
        wax.planes[0].constant = sealWorld.x;
        wax.planes[1].constant = -sealWorld.x;
      }

      // Sealed: hold, let the envelope settle, then hand on.
      let settle = 0;
      if (mode === "seal" && sealState.stage === "sealed") {
        if (sealedFor < 0) sealedFor = 0;
        sealedFor += dt;
        const s = (sealedFor - SEALED_HOLD_S) / SETTLE_S;
        if (s > 0 && s < 1) settle = -0.04 * Math.sin(Math.PI * s);
        if (!sealedFired && s >= 1) {
          sealedFired = true;
          callbacks.current.onSealed?.();
        }
      }
      if (mode === "open" && sealState.stage === "broken" && !opening) {
        opening = true;
        t = 0;
      }
      if (opening && !openedFired && t >= OPEN_TIMELINE_S) {
        openedFired = true;
        callbacks.current.onOpened?.();
      }

      applyPose(pose);
      card.setShadow(Math.min(1, Math.max(0, 1 - pose.card.z / 0.3)));
      wiggle = Math.max(0, wiggle - dt * 1.6);
      envelope.group.rotation.z = Math.sin(elapsed * 22) * 0.04 * wiggle;
      envelope.group.position.y += settle + (mode === "transit" ? Math.sin(elapsed * 1.1) * 0.015 : 0);

      post.render(dt);
      if (!firstFrameFired) {
        firstFrameFired = true;
        callbacks.current.onFirstFrame?.();
      }

      // DOM overlay: the hold ring round the seal spot, and the hint.
      const ready = mode !== "seal" || pose.phase === "ready";
      const rect = el.getBoundingClientRect();
      const spot = envelope.sealAt.clone();
      envelope.group.localToWorld(spot);
      const p = spot.clone().project(camera);
      const edge = spot.clone().add(new THREE.Vector3(0.36, 0, 0)).project(camera);
      const pressing = sealState.stage === "pressing";
      setRing(
        mode === "seal" && ready && (sealState.stage === "idle" || pressing)
          ? { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height, r: Math.abs(edge.x - p.x) * rect.width * 0.5, p: v.press }
          : null,
      );
      const nextHint = envelopeHint({ mode, stage: sealState.stage, ready, deliverLabel });
      if (nextHint !== lastHint) {
        lastHint = nextHint;
        setHint(nextHint);
      }
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      envelope.dispose();
      wax?.dispose();
      card.dispose();
      post.dispose();
      key.shadow.dispose();
      studioEnv.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      press.current = () => {};
    };
  }, [mode, envelopeColor, seal, coverSrc, paper, deliverLabel]);

  return (
    <div
      ref={host}
      className="relative h-full w-full touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current("down");
      }}
      onPointerUp={() => press.current("up")}
      onPointerCancel={() => press.current("up")}
    >
      {ring && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <circle cx={ring.x} cy={ring.y} r={ring.r} fill="none" stroke="#1c1917" strokeOpacity={0.12} strokeWidth={3} />
          <circle
            cx={ring.x}
            cy={ring.y}
            r={ring.r}
            fill="none"
            stroke="#1c1917"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * ring.r * ring.p} ${2 * Math.PI * ring.r}`}
            transform={`rotate(-90 ${ring.x} ${ring.y})`}
          />
        </svg>
      )}
      {hint && (
        <p className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-stone-500" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
