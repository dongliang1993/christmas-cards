"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CARD_H, CARD_W } from "@/lib/cardConstants";
import { fitStage } from "@/lib/cardStage";
import { buildEnvelope, buildSeal, ENV_H, ENV_W, SEAL_POS, SEAL_RADIUS } from "@/lib/envelope/envelopeModel";
import { initialSeal, sealPressStep, sealVisual, type SealState } from "@/lib/envelope/sealPress";
import type { EnvelopeColor, Seal } from "@/lib/letter/model";

export type EnvelopeMode = "seal" | "transit" | "open";

interface Props {
  mode: EnvelopeMode;
  envelopeColor: EnvelopeColor;
  seal: Seal;
  recipientName: string;
  /** Card face shown sliding in (seal) or out (open). */
  coverSrc: string;
  postmark: string | null;
  onSealed?(): void;
  /** The card has left the envelope: show the card itself now. */
  onOpened?(): void;
}

const FOV = 30;
const INSERT_S = 1.3;
const FLAP_S = 0.7;
const OUT_S = 1.0;
/** Open flap folds back behind the envelope (positive x-rotation sends its tip to -z). */
const FLAP_OPEN = Math.PI * 0.92;

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const easeInOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The envelope moment (spec §4.5, §5): the card slides in and the flap
 * closes; the sender presses the wax; the recipient breaks it and the card
 * slides out. In transit it only wiggles.
 */
export function EnvelopeScene({ mode, envelopeColor, seal, recipientName, coverSrc, postmark, onSealed, onOpened }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const press = useRef<(kind: "down" | "up") => void>(() => {});
  const callbacks = useRef({ onSealed, onOpened });
  callbacks.current = { onSealed, onOpened };
  const [ring, setRing] = useState<{ x: number; y: number; r: number; p: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduced = reducedMotion();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.localClippingEnabled = true;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    scene.add(new THREE.AmbientLight(0xfff9f5, 1.4));
    scene.add(new THREE.HemisphereLight(0xfffaf6, 0xe0d2cc, 0.5));
    const key = new THREE.DirectionalLight(0xfff6ee, 1.6);
    key.position.set(-3, 4, 6);
    scene.add(key);

    const root = new THREE.Group();
    scene.add(root);
    const envelope = buildEnvelope(envelopeColor, { recipientName, postmark });
    root.add(envelope.group);
    const sealParts = buildSeal(seal);
    sealParts.group.position.copy(SEAL_POS);
    envelope.flapPivot.add(sealParts.group);
    // Seal rides the flap: its local position is relative to the hinge.
    sealParts.group.position.y = SEAL_POS.y - ENV_H / 2;

    const coverTex = new THREE.TextureLoader().load(coverSrc);
    coverTex.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(CARD_W * 0.92, CARD_H * 0.92, 0.02),
      [
        ...Array.from({ length: 4 }, () => new THREE.MeshStandardMaterial({ color: "#efe7dc" })),
        new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: "#efe7dc" }),
      ],
    );
    card.position.z = -0.04; // between the panels: hidden by the back panel once inside
    root.add(card);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const fit = fitStage(ENV_W, ENV_H, FOV, w / h);
      // Leave headroom above the envelope for the card sliding in and out.
      camera.position.set(0, fit.camYPerZ * fit.closedZ * 0.4, fit.closedZ * 1.18);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    let sealState: SealState = initialSeal(mode === "seal" ? "idle" : "sealed");
    let elapsed = 0;
    let phaseStart = 0;
    let phase: "inserting" | "closing" | "ready" | "flapOpen" | "cardOut" | "done" = mode === "seal" ? "inserting" : "ready";
    let wiggle = 0;
    let sealedFired = false;
    let lastHint: string | null = null;

    press.current = (kind) => {
      if (mode === "seal" && phase === "ready") {
        sealState = sealPressStep(sealState, { type: kind === "down" ? "press" : "release" }, reduced);
      } else if (mode === "open" && kind === "down" && sealState.stage === "sealed") {
        sealState = sealPressStep(sealState, { type: "break" }, reduced);
      } else if (mode === "transit" && kind === "down") {
        wiggle = 1;
      }
    };

    const sealWorld = new THREE.Vector3();
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      const inPhase = (elapsed - phaseStart) / (reduced ? 0.01 : 1);
      const go = (next: typeof phase) => {
        phase = next;
        phaseStart = elapsed;
      };

      // Card and flap choreography.
      const cardTop = ENV_H * 0.62;
      if (phase === "inserting") {
        envelope.flapPivot.rotation.x = FLAP_OPEN;
        card.position.y = cardTop * (1 - easeInOut(inPhase / INSERT_S)) - 0.15;
        if (inPhase >= INSERT_S) go("closing");
      } else if (phase === "closing") {
        envelope.flapPivot.rotation.x = FLAP_OPEN * (1 - easeOut(inPhase / FLAP_S));
        if (inPhase >= FLAP_S) go("ready");
      } else if (phase === "flapOpen") {
        envelope.flapPivot.rotation.x = FLAP_OPEN * easeOut(inPhase / FLAP_S);
        if (inPhase >= FLAP_S) go("cardOut");
      } else if (phase === "cardOut") {
        card.position.y = -0.15 + (cardTop + 1.2) * easeInOut(inPhase / OUT_S);
        if (inPhase >= OUT_S) {
          go("done");
          callbacks.current.onOpened?.();
        }
      } else if (phase === "ready" && mode !== "seal") {
        card.position.y = -0.15;
      }

      // An open flap swings back behind the card it lets through.
      envelope.flapPivot.position.z = -0.07 * (envelope.flapPivot.rotation.x / FLAP_OPEN);

      // Wax.
      sealState = sealPressStep(sealState, { type: "tick", dt: dt * 1000 }, reduced);
      const v = sealVisual(sealState);
      const blob = sealState.stage === "idle" ? 0 : 0.28 * v.press + 0.72 * easeOut(v.spread);
      sealParts.group.visible = blob > 0.01;
      sealParts.group.scale.set(blob, blob, 0.4 + 0.6 * easeOut(v.spread));
      for (const m of sealParts.material) {
        m.emissiveIntensity = (1 - v.cool) * 0.9 * (sealState.stage === "idle" ? 0 : 1);
        m.roughness = 0.12 + 0.3 * v.cool;
        m.opacity = 1 - Math.max(0, v.crack - 0.5) * 2;
      }
      const spread = 0.35 * easeOut(v.crack);
      const fall = 1.8 * v.crack * v.crack;
      sealParts.halves[0].position.set(-spread, -fall, 0);
      sealParts.halves[1].position.set(spread, -fall * 0.8, 0);
      sealParts.group.getWorldPosition(sealWorld);
      sealParts.planes[0].constant = sealWorld.x - spread * blob;
      sealParts.planes[1].constant = -(sealWorld.x + spread * blob);

      if (sealState.stage === "sealed" && mode === "seal" && !sealedFired) {
        sealedFired = true;
        callbacks.current.onSealed?.();
      }
      if (sealState.stage === "broken" && phase === "ready" && mode === "open") go("flapOpen");

      // Transit wiggle and a slow idle breath.
      wiggle = Math.max(0, wiggle - dt * 1.6);
      root.rotation.z = Math.sin(elapsed * 22) * 0.05 * wiggle + Math.sin(elapsed * 0.8) * 0.004;
      root.position.y = Math.sin(elapsed * 1.1) * 0.015;

      renderer.render(scene, camera);

      // DOM overlay: hold ring around the seal spot, and the hint line.
      const rect = el.getBoundingClientRect();
      const p = SEAL_POS.clone().project(camera);
      const edge = SEAL_POS.clone().add(new THREE.Vector3(SEAL_RADIUS * 1.5, 0, 0)).project(camera);
      const r = Math.abs(edge.x - p.x) * rect.width * 0.5;
      const pressing = sealState.stage === "pressing";
      setRing(
        mode === "seal" && phase === "ready" && (sealState.stage === "idle" || pressing)
          ? { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height, r, p: v.press }
          : null,
      );
      const nextHint =
        mode === "seal"
          ? phase === "ready" && sealState.stage === "idle"
            ? "按住火漆处 1 秒，盖上印章"
            : null
          : mode === "open"
            ? sealState.stage === "sealed"
              ? "点一下火漆，拆开这封信"
              : null
            : "这封信还在路上";
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
      sealParts.dispose();
      card.geometry.dispose();
      for (const m of card.material as THREE.Material[]) m.dispose();
      coverTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      press.current = () => {};
    };
  }, [mode, envelopeColor, seal, recipientName, coverSrc, postmark]);

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
