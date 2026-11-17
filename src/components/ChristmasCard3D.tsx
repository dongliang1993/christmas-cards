"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { CARD_ASSETS } from "@/lib/cardAssets";
import { CARD_H, CARD_THICKNESS, CARD_W, SHEET_H, SHEET_THICKNESS, SHEET_W } from "@/lib/cardConstants";
import { createElementLayer, type ElementLayer, type LayerElement } from "@/lib/card/elementMeshes";
import { localToPlacement } from "@/lib/card/elementLayout";
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
  createPointerState,
  openAngleFor,
  pointerToCardLocal,
  resolveRelease,
  resolveTap,
  type PointerState,
} from "@/lib/cardInteract";
import { createPostfxStack, type PostfxStack } from "@/lib/cardPostfx";
import { buildPaperNormalTile, buildSurface, type CoverSurface } from "@/lib/cardRelief";
import { fitStage, shadowFootprint, studioBackgroundColor, type StageFit } from "@/lib/cardStage";
import {
  createBackCanvas,
  createBlankSheetCanvas,
  createInsideLeftCanvas,
  createInsideRightBaseCanvas,
  createInsideRightSheetCanvas,
  createSnowfallCanvas,
  createSnowMaskCanvas,
  extractMotifCanvas,
} from "@/lib/cardTextures";
import type { CardTemplateId } from "@/lib/types";

interface ChristmasCard3DProps {
  templateId: CardTemplateId;
  message: string;
  signature: string;
  isOpen: boolean;
  isPaused: boolean;
  flyInKey?: number;
  onToggleOpen?: () => void;
  onOpenProgress?: (progress: number) => void;
  onReady?: () => void;
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
  /** Card stock for the inside pages and edges; omitted keeps the template's paper. */
  paper?: PaperStock;
  /** Editor access to picking and on-screen element corners. */
  handleRef?: Ref<CardHandle>;
}

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
}

interface RuntimeLiftedMesh {
  mesh: THREE.Mesh;
  baseZ: number;
  bob: number;
  twinkle: boolean;
  phase: number;
  impulse: number;
  texture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  geometry: THREE.PlaneGeometry;
}

/** Candle glow sprite size relative to the template spec, and its HDR gain. */
const GLOW_SIZE = 0.5;
const GLOW_HDR = 4.2;

/** Studio softbox placement & strength; the pointer slides it by SOFTBOX_SWAY. */
const SOFTBOX_POS = new THREE.Vector3(-2.6, 2.4, 3.4);
const SOFTBOX_INTENSITY = 2.2;
const SOFTBOX_SWAY = 1.4;
/** Pointer lamp peak intensity: the glint on wet paint. */
const LAMP_INTENSITY = 3.0;

/** Motion budget scaling for prefers-reduced-motion (#10). */
function motionScale(): number {
  if (typeof window === "undefined") return 1;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.35 : 1;
}

/** Shadow plane is the card footprint padded by this much on each axis. */
const SHADOW_PAD_X = 1.5;
const SHADOW_PAD_Y = 1.35;

/** Card-shaped studio shadow: a tight contact core plus a wide soft falloff. */
function createShadowTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const rw = size / SHADOW_PAD_X;
    const rh = size / SHADOW_PAD_Y;
    const rx = (size - rw) / 2;
    const ry = (size - rh) / 2;
    ctx.fillStyle = "rgba(48, 36, 28, 1)";
    ctx.filter = "blur(34px)";
    ctx.globalAlpha = 0.3;
    ctx.fillRect(rx + 6, ry + 14, rw, rh);
    ctx.filter = "blur(9px)";
    ctx.globalAlpha = 0.6;
    ctx.fillRect(rx + 3, ry + 5, rw - 2, rh - 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

function createGlowSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
    grad.addColorStop(0, "rgba(255, 245, 200, 0.95)");
    grad.addColorStop(0.28, "rgba(255, 208, 110, 0.55)");
    grad.addColorStop(0.62, "rgba(255, 180, 75, 0.16)");
    grad.addColorStop(1, "rgba(255, 180, 75, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  isColor = true,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Swap a baked relief onto a paper material, disposing what it replaces. */
function applySurface(
  mat: THREE.MeshStandardMaterial,
  baked: CoverSurface,
  anisotropy: number,
  sharedPaper: THREE.Texture,
): void {
  const oldNormal = mat.normalMap;
  const oldSurface = mat.roughnessMap;
  mat.normalMap = makeTexture(baked.normal, anisotropy, false);
  mat.normalScale.set(1, 1);
  const surface = makeTexture(baked.surface, anisotropy, false);
  mat.roughnessMap = surface;
  mat.metalnessMap = surface;
  mat.roughness = 1;
  mat.metalness = 1;
  if (oldNormal && oldNormal !== sharedPaper) oldNormal.dispose();
  oldSurface?.dispose();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function ChristmasCard3D({
  templateId,
  message,
  signature,
  isOpen,
  isPaused,
  flyInKey = 0,
  onToggleOpen,
  onOpenProgress,
  onReady,
  elements,
  interactive = true,
  paper,
  handleRef,
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
    hoverX: 0,
    hoverY: 0,
    flyProgress: 0,
    burstTimer: 0,
    snowBounds: { xMin: 0.45, xMax: 2.15, yMin: -0.9, yMax: 1.2 },
    glowFlicker: true,
    // #7 continuous open progress 0..1 (drag-controllable)
    openProgress: isOpen ? 1 : 0,
    targetOpenProgress: isOpen ? 1 : 0,
    releasedImpulse: 0,
  });

  const callbacksRef = useRef({ onToggleOpen, onOpenProgress, onReady });
  const elementLayerRef = useRef<ElementLayer | null>(null);
  // Decided once per mount: a card is either an editor/letter card or a template card.
  const bareRef = useRef(elements !== undefined);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const pickApiRef = useRef<CardHandle | null>(null);
  const paperMatsRef = useRef<THREE.MeshPhysicalMaterial[]>([]);
  useImperativeHandle(handleRef, () => ({
    pick: (cx, cy) => pickApiRef.current?.pick(cx, cy) ?? null,
    project: (uid) => pickApiRef.current?.project(uid) ?? null,
  }), []);
  callbacksRef.current = { onToggleOpen, onOpenProgress, onReady };

  useEffect(() => {
    stateRef.current.targetOpenProgress = isOpen ? 1 : 0;
  }, [isOpen]);

  useEffect(() => {
    stateRef.current.isPaused = isPaused;
  }, [isPaused]);

  useEffect(() => {
    stateRef.current.flyProgress = 0;
  }, [flyInKey]);

  const sceneHandlesRef = useRef<{
    coverBaseMat: THREE.MeshStandardMaterial;
    insideLeftMat: THREE.MeshStandardMaterial;
    insideRightBaseMat: THREE.MeshStandardMaterial;
    insideRightSheetMat: THREE.MeshStandardMaterial;
    backMat: THREE.MeshStandardMaterial;
    liftedGroup: THREE.Group;
    liftedMeshes: RuntimeLiftedMesh[];
    glowSprite: THREE.Sprite;
    glowLight: THREE.PointLight;
    paperNormalTex: THREE.CanvasTexture;
    snowfallTex: THREE.CanvasTexture;
    snowfallMat: THREE.MeshBasicMaterial;
    snowfallMesh: THREE.Mesh;
    coverMesh: THREE.Mesh;
    coverBend: BendBuffers;
    liftedBend: BendBuffers;
    frontPivot: THREE.Group;
    maxAnisotropy: number;
    foilTex: THREE.CanvasTexture | null;
  } | null>(null);

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

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Neutral keeps paper whites white and pigments true (ACES greys them).
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // Environment map: metal/foil needs something to reflect, otherwise
    // metalness=1 areas render dead black. Kept dim — it is reflection
    // content for the foil, not another studio light.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.25;

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const ambient = new THREE.AmbientLight(0xfff9f8, 1.3);
    scene.add(ambient);

    const hemiLight = new THREE.HemisphereLight(0xfffaf6, 0xe0d2cc, 0.45);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.45);
    keyLight.position.set(6.8, 4.8, 3.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0006;
    scene.add(keyLight);
    // #2 Studio follow: key light target rides pointer hover.
    const keyTarget = new THREE.Object3D();
    scene.add(keyTarget);
    keyLight.target = keyTarget;
    keyTarget.position.set(0, 0, 0);

    // Studio softbox, upper left (bubbbly studio(): soft box + strip + bounce).
    // Broad, so the relief catches a smooth, continuous sheen that slides as
    // the pointer nudges it.
    RectAreaLightUniformsLib.init();
    const softbox = new THREE.RectAreaLight(0xfffbf8, SOFTBOX_INTENSITY, 3.2, 2.4);
    softbox.position.set(SOFTBOX_POS.x, SOFTBOX_POS.y, SOFTBOX_POS.z);
    softbox.lookAt(0, 0, 0);
    scene.add(softbox);

    const rimLight = new THREE.DirectionalLight(0xdce8ff, 0.65);
    rimLight.position.set(-5.5, -2.0, 2.8);
    scene.add(rimLight);

    // Cold-press tooth at the same pitch as the cover (~85 bumps across).
    const paperNormalTex = makeTexture(
      buildPaperNormalTile(512, 24),
      maxAnisotropy,
      false,
    );
    paperNormalTex.wrapS = THREE.RepeatWrapping;
    paperNormalTex.wrapT = THREE.RepeatWrapping;
    paperNormalTex.repeat.set(3.5, 3.5 * (CARD_H / CARD_W));

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
    const liftedGroup = new THREE.Group();
    liftedGroup.position.set(0, 0, CARD_THICKNESS);
    frontPivot.add(liftedGroup);

    // #5 Snowfall parallax layer above the cover artwork.
    const snowfallTex = makeTexture(createSnowfallCanvas(), maxAnisotropy);
    snowfallTex.wrapS = THREE.RepeatWrapping;
    snowfallTex.wrapT = THREE.RepeatWrapping;
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
    const glowTex = createGlowSpriteTexture();
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

    // Snowfall strictly inside the cover artwork's snowArea
    const particleTex = createParticleSprite();
    const cardSnowCount = 34;
    const cardSnowPos = new Float32Array(cardSnowCount * 3);
    const cardSnowSeeds = new Float32Array(cardSnowCount * 2);
    for (let i = 0; i < cardSnowCount; i += 1) {
      cardSnowPos[i * 3] = 0.5 + Math.random() * 1.6;
      cardSnowPos[i * 3 + 1] = (Math.random() - 0.5) * 1.8;
      cardSnowPos[i * 3 + 2] = CARD_THICKNESS + 0.04 + Math.random() * 0.08;
      cardSnowSeeds[i * 2] = 0.16 + Math.random() * 0.24;
      cardSnowSeeds[i * 2 + 1] = Math.random() * Math.PI * 2;
    }
    const cardSnowGeo = new THREE.BufferGeometry();
    cardSnowGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(cardSnowPos, 3),
    );
    const cardSnowMat = new THREE.PointsMaterial({
      size: 0.045,
      color: 0xffffff,
      map: particleTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const cardSnow = new THREE.Points(cardSnowGeo, cardSnowMat);
    frontPivot.add(cardSnow);

    paperMatsRef.current = [paperEdgeMat, insideLeftMat, insideRightBaseMat, insideRightSheetMat];

    elementLayerRef.current = createElementLayer(
      {
        "inside-left": { parent: coverMesh, bendWidth: CARD_W },
        "inside-right": { parent: sheetMesh, bendWidth: CARD_W },
      },
      maxAnisotropy,
    );

    sceneHandlesRef.current = {
      coverBaseMat,
      insideLeftMat,
      insideRightBaseMat,
      insideRightSheetMat,
      backMat,
      liftedGroup,
      liftedMeshes: [],
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
    };
    // Keep rightBend / sheetBend reachable for the animation loop.
    const bendRefs = { right: rightBend, sheet: sheetBend, cover: coverBend };
    void bendRefs;

    const shadowTex = createShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W * SHADOW_PAD_X, CARD_H * SHADOW_PAD_Y),
      shadowMat,
    );
    // Just behind the card, as if it stood a finger's width off the sweep.
    shadowPlane.position.set(0.06, -0.1, -0.12);
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

    const triggerBurst = () => {
      stateRef.current.burstTimer = 1.6;
      const posAttr = burstGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < burstCount; i += 1) {
        posAttr.setXYZ(
          i,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 2.5,
          0.35 + Math.random() * 0.3,
        );
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 2.2;
        burstVelocities[i * 3] = Math.cos(angle) * speed;
        burstVelocities[i * 3 + 1] = Math.sin(angle) * speed * 0.75 + 0.4;
        burstVelocities[i * 3 + 2] = (Math.random() - 0.15) * 1.6;
      }
      posAttr.needsUpdate = true;
    };

    // #7/#8 Pointer state machine with grab-edge drag-open.
    const ptr: PointerState = createPointerState();
    let dragOpenBase = 0;
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

    const onPointerDown = (e: PointerEvent) => {
      if (!interactiveRef.current) return;
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
      dragOpenBase = stateRef.current.targetOpenProgress;

      const local = pointerToCardLocal(e, container, camera, coverMesh);
      if (local && local.x > CARD_W * 0.74) {
        ptr.mode = "open";
      }
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
        return;
      }

      const now = performance.now();
      const dms = Math.max(1, now - ptr.lastT);
      ptr.vx = THREE.MathUtils.lerp(
        ptr.vx,
        ((e.clientX - ptr.lastX) / dms) * 1000,
        0.4,
      );
      ptr.lastX = e.clientX;
      ptr.lastT = now;
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      ptr.totalMoved += Math.abs(e.movementX) + Math.abs(e.movementY);

      if (ptr.mode === "open") {
        // Drag the free edge out: leftward drag opens.
        const openness = THREE.MathUtils.clamp(
          dragOpenBase - (e.clientX - ptr.x0) / (rect.width * 0.55),
          0,
          1,
        );
        stateRef.current.targetOpenProgress = openness;
      } else {
        const dx = e.clientX - ptr.x0;
        const dy = e.clientY - ptr.y0;
        stateRef.current.targetDragRotY = THREE.MathUtils.clamp(
          dx * 0.0055,
          -0.85,
          0.85,
        );
        stateRef.current.targetDragRotX = THREE.MathUtils.clamp(
          dy * 0.0042,
          -0.5,
          0.5,
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!ptr.down) return;
      ptr.down = false;
      delete renderer.domElement.dataset.grabbing;

      const moved = Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0);
      const quick = performance.now() - ptr.t0 < 350;

      if (ptr.mode === "open") {
        const target = resolveRelease(
          stateRef.current.targetOpenProgress,
          ptr.vx,
        );
        stateRef.current.targetOpenProgress = target ? 1 : 0;
        stateRef.current.releasedImpulse = Math.min(
          1,
          Math.abs(ptr.vx) / 2400,
        );
      } else if (moved < 7 && quick) {
        const local = pointerToCardLocal(e, container, camera, coverMesh);
        if (resolveTap(local, CARD_W) === "toggle") {
          callbacksRef.current.onToggleOpen?.();
        }
      } else {
        stateRef.current.targetDragRotX = 0;
        stateRef.current.targetDragRotY = 0;
        // #8 inertia: release drag tilt with pointer velocity feeding lift bob.
        stateRef.current.releasedImpulse = Math.min(
          1,
          Math.abs(ptr.vx) / 2400,
        );
      }
      ptr.mode = "none";
    };

    const onPointerLeave = () => {
      if (!ptr.down) ptr.over = false;
    };

    const domEl = renderer.domElement;
    domEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    domEl.addEventListener("pointerleave", onPointerLeave);

    let stage: StageFit = fitStage(CARD_W, CARD_H, CAMERA_FOV, width / height);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      stage = fitStage(CARD_W, CARD_H, CAMERA_FOV, w / h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      postfx?.setSize(w, h);
    };

    // #6 Postfx stack: bloom + film grain, after renderer exists.
    const postfx: PostfxStack = createPostfxStack(renderer, scene, camera);
    handleResize();
    camera.position.z = stateRef.current.isOpen ? stage.openZ : stage.closedZ;
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

      if (s.flyProgress < 1) {
        s.flyProgress = Math.min(1, s.flyProgress + dt * 0.78 * (motion < 1 ? 1.6 : 1));
      }
      const ease = 1 - Math.pow(1 - s.flyProgress, 3);

      if (!s.isPaused) {
        elapsed += dt;

        const sb = s.snowBounds;
        const snowAttr = cardSnowGeo.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        for (let i = 0; i < cardSnowCount; i += 1) {
          let x = snowAttr.getX(i);
          let y = snowAttr.getY(i);
          const speed = cardSnowSeeds[i * 2];
          const phase = cardSnowSeeds[i * 2 + 1];

          y -= speed * dt * motion;
          x += Math.sin(elapsed * 1.4 + phase) * 0.05 * dt * motion;
          if (y < sb.yMin) {
            y = sb.yMax;
            x = sb.xMin + Math.random() * (sb.xMax - sb.xMin);
          }
          snowAttr.setXY(i, x, y);
        }
        snowAttr.needsUpdate = true;

        // #5 snowfall parallax scroll
        snowfallTex.offset.y -= dt * 0.012 * motion;
      }

      // #1 Open progress -> hinge angle + bow bend.
      s.openProgress = THREE.MathUtils.lerp(
        s.openProgress,
        s.targetOpenProgress,
        1 - Math.exp(-dt * 7),
      );
      callbacksRef.current.onOpenProgress?.(s.openProgress);

      const openAngle = openAngleFor(s.openProgress);
      frontPivot.rotation.y = -openAngle;

      // Bow the cover: peak curvature near mid-turn, straight when shut/open.
      const bowMix = Math.sin(Math.min(Math.PI, openAngle / OPEN_MAX) * Math.PI);
      const bend = BOW_AMP * bowMix * motion;
      applyBow(frontGeo, CARD_W, bend, coverBend);
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
          lm.mesh.position.z =
            lm.baseZ +
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
      glowLight.intensity = 0.85 * flicker * (0.15 + 0.85 * openFade);
      glowSprite.visible = s.openProgress < 0.7;
      glowSpriteMat.opacity = 0.65 * flicker * (0.2 + 0.8 * openFade);
      cardSnow.visible = s.openProgress < 0.7;
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

      const targetCenter = s.openProgress > 0.02 ? 0 : -CARD_W / 2;
      cardCenterGroup.position.x = THREE.MathUtils.lerp(
        cardCenterGroup.position.x,
        targetCenter,
        1 - Math.exp(-dt * 6.5),
      );

      // Resting pose: almost square to the lens, like a card on a copy stand.
      const floatY = Math.sin(elapsed * 1.1 * motion) * 0.018 * motion;
      const floatRotZ = Math.sin(elapsed * 0.8) * 0.004 * motion;
      const baseRotX = 0.015;
      const baseRotY = s.openProgress > 0.5 ? 0 : -0.04;
      const baseRotZ = -0.006;

      s.dragRotX = THREE.MathUtils.lerp(
        s.dragRotX,
        s.targetDragRotX + s.hoverY * 0.06,
        1 - Math.exp(-dt * 8),
      );
      s.dragRotY = THREE.MathUtils.lerp(
        s.dragRotY,
        s.targetDragRotY + s.hoverX * 0.08,
        1 - Math.exp(-dt * 8),
      );

      const targetCamZ =
        stage.closedZ + (stage.openZ - stage.closedZ) * s.openProgress;
      camera.position.z = THREE.MathUtils.lerp(
        camera.position.z,
        targetCamZ,
        1 - Math.exp(-dt * 5.5),
      );
      camera.position.y = stage.camYPerZ * camera.position.z;

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

      shadowMat.opacity = ease;
      // Follow what actually casts the shadow: a cover mid-swing throws none
      // to the left of the spine. The soft padding keeps its width.
      const foot = shadowFootprint(openAngle, CARD_W);
      const footW = foot.right - foot.left;
      shadowPlane.position.x = cardCenterGroup.position.x + (foot.left + foot.right) / 2 + 0.06;
      shadowPlane.scale.set((footW + CARD_W * (SHADOW_PAD_X - 1)) / (CARD_W * SHADOW_PAD_X), 1.0, 1.0);

      postfx.render(dt);
    };

    animId = requestAnimationFrame(animate);
    callbacksRef.current.onReady?.();

    return () => {
      cancelAnimationFrame(animId);
      domEl.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      domEl.removeEventListener("pointerleave", onPointerLeave);
      resizeObserver.disconnect();
      postfx.dispose();
      if (sceneHandlesRef.current) {
        for (const lm of sceneHandlesRef.current.liftedMeshes) {
          lm.geometry.dispose();
          lm.material.dispose();
          lm.texture.dispose();
        }
      }
      rightGeo.dispose();
      sheetGeo.dispose();
      frontGeo.dispose();
      shadowPlane.geometry.dispose();
      cardSnowGeo.dispose();
      burstGeo.dispose();
      shadowTex.dispose();
      particleTex.dispose();
      glowTex.dispose();
      paperNormalTex.dispose();
      shadowMat.dispose();
      glowSpriteMat.dispose();
      cardSnowMat.dispose();
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
      envRT.dispose();
      pmrem.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load cover.png -> derive oil-impasto normalMap, motifs, lifted cutouts & glow
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;

    let cancelled = false;
    const spec = CARD_ASSETS[templateId];

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

    // Map snowArea to card local space
    const [sx, sy, sw, sh] = spec.snowArea;
    stateRef.current.snowBounds = {
      xMin: (sx / spec.w) * CARD_W,
      xMax: ((sx + sw) / spec.w) * CARD_W,
      yMax: (0.5 - sy / spec.h) * CARD_H,
      yMin: (0.5 - (sy + sh) / spec.h) * CARD_H,
    };

    loadImage(spec.coverSrc)
      .then((coverImg) => {
        if (cancelled) return;
        coverImageRef.current = coverImg;

        // 1. Cover texture + Oil-impasto normal map derived from coverImg
        const oldCoverTex = h.coverBaseMat.map;
        const oldCoverNormal = h.coverBaseMat.normalMap;
        const coverTex = new THREE.Texture(coverImg);
        coverTex.colorSpace = THREE.SRGBColorSpace;
        coverTex.anisotropy = h.maxAnisotropy;
        coverTex.needsUpdate = true;

        // Template relief values were tuned for the old baker at 3.2.
        const baked = buildSurface(coverImg, spec.relief / 3.2);
        const impastoNormal = makeTexture(baked.normal, h.maxAnisotropy, false);

        h.coverBaseMat.map = coverTex;
        h.coverBaseMat.normalMap = impastoNormal;
        h.coverBaseMat.normalScale.set(1, 1);

        // Snow only behind the window glass (bubbbly's snowfall()).
        const oldSnowMask = h.snowfallMat.alphaMap;
        h.snowfallMat.alphaMap = makeTexture(
          createSnowMaskCanvas(coverImg, spec.snowArea, spec.w, spec.h),
          h.maxAnisotropy,
          false,
        );
        h.snowfallMat.needsUpdate = true;
        oldSnowMask?.dispose();

        // #4 Foil metalness/roughness maps from the artwork.
        const oldFoil = h.foilTex;
        const foilTex = makeTexture(baked.surface, h.maxAnisotropy, false);
        h.foilTex = foilTex;
        h.coverBaseMat.metalnessMap = foilTex;
        h.coverBaseMat.roughnessMap = foilTex;
        h.coverBaseMat.metalness = 1;
        h.coverBaseMat.roughness = 1;
        h.coverBaseMat.needsUpdate = true;

        oldCoverTex?.dispose();
        if (oldCoverNormal && oldCoverNormal !== h.paperNormalTex) {
          oldCoverNormal.dispose();
        }
        oldFoil?.dispose();

        // 2. Inside-left, inside-right & back motifs extracted from coverImg
        const oldLeft = h.insideLeftMat.map;
        const oldRightBase = h.insideRightBaseMat.map;
        const oldBack = h.backMat.map;
        const oldSheet = h.insideRightSheetMat.map;

        h.insideLeftMat.map = makeTexture(
          bareRef.current
            ? createInsideLeftCanvas(templateId, null, [])
            : createInsideLeftCanvas(templateId, coverImg, spec.motifs.left),
          h.maxAnisotropy,
        );
        h.insideRightBaseMat.map = makeTexture(
          createInsideRightBaseCanvas(templateId),
          h.maxAnisotropy,
        );
        h.backMat.map = makeTexture(
          createBackCanvas(templateId, coverImg, spec.motifs.back),
          h.maxAnisotropy,
        );
        h.insideRightSheetMat.map = makeTexture(
          bareRef.current
            ? createBlankSheetCanvas(templateId)
            : createInsideRightSheetCanvas(templateId, message, signature, coverImg, spec.motifs.insert),
          h.maxAnisotropy,
        );

        // Template stickers get the same paint relief + gloss as the cover, so
        // the pointer lamp glints on them once the card is open. Baked from the
        // sticker layer only: text stays flat ink. Bare pages carry their
        // stickers as meshes, which bring their own relief.
        if (!bareRef.current) applySurface(
          h.insideLeftMat,
          buildSurface(createInsideLeftCanvas(templateId, coverImg, spec.motifs.left, true)),
          h.maxAnisotropy,
          h.paperNormalTex,
        );
        if (!bareRef.current) applySurface(
          h.insideRightSheetMat,
          buildSurface(
            createInsideRightSheetCanvas(templateId, "", "", coverImg, spec.motifs.insert, true),
          ),
          h.maxAnisotropy,
          h.paperNormalTex,
        );

        h.insideLeftMat.needsUpdate = true;
        h.insideRightBaseMat.needsUpdate = true;
        h.backMat.needsUpdate = true;
        h.insideRightSheetMat.needsUpdate = true;

        oldLeft?.dispose();
        oldRightBase?.dispose();
        oldBack?.dispose();
        oldSheet?.dispose();

        // 3. Rebuild lifted 3D relief cutouts
        for (const prev of h.liftedMeshes) {
          h.liftedGroup.remove(prev.mesh);
          prev.geometry.dispose();
          prev.material.dispose();
          prev.texture.dispose();
        }
        h.liftedMeshes = [];

        spec.lifted.forEach((l, idx) => {
          const cropCanvas = extractMotifCanvas(coverImg, l.box);
          const tex = makeTexture(cropCanvas, h.maxAnisotropy);
          const lw = (l.box[2] / spec.w) * CARD_W;
          const lh = (l.box[3] / spec.h) * CARD_H;
          const lx = ((l.box[0] + l.box[2] / 2) / spec.w) * CARD_W;
          const ly = (0.5 - (l.box[1] + l.box[3] / 2) / spec.h) * CARD_H;

          const geo = new THREE.PlaneGeometry(lw, lh);
          const mat = new THREE.MeshStandardMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.08,
            roughness: 0.8,
            normalMap: h.paperNormalTex,
            normalScale: new THREE.Vector2(0.8, 0.8),
            emissive: l.twinkle ? new THREE.Color(0xffe4a0) : new THREE.Color(0x000000),
            emissiveIntensity: 0,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(lx, ly, l.lift);
          mesh.castShadow = true;
          h.liftedGroup.add(mesh);

          h.liftedMeshes.push({
            mesh,
            baseZ: l.lift,
            bob: l.bob,
            twinkle: Boolean(l.twinkle),
            phase: idx * 1.7,
            impulse: 0,
            texture: tex,
            material: mat,
            geometry: geo,
          });
        });
      })
      .catch(() => {
        // Ignore load error
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Update message/signature on inside-right insert sheet
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h || bareRef.current) return;

    const spec = CARD_ASSETS[templateId];
    const oldSheet = h.insideRightSheetMat.map;
    h.insideRightSheetMat.map = makeTexture(
      createInsideRightSheetCanvas(
        templateId,
        message,
        signature,
        coverImageRef.current,
        spec.motifs.insert,
      ),
      h.maxAnisotropy,
    );
    h.insideRightSheetMat.needsUpdate = true;
    oldSheet?.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
