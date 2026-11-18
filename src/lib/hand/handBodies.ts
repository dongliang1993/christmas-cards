import * as THREE from "three";
import type { CardBody } from "../card/cardBody";
import type { CardFace } from "../card/cardKit";
import type { CardTemplateId } from "../types";
import { assignBodies } from "./bodyAssign";
import type { HandRig } from "./handRig";

/** Within this offset of the front, the focus card blends into its own motion. */
const FOCUS_BLEND = 0.5;
/** Where a body without a card waits: beyond the far plane, never hidden (see park). */
const PARKED_Z = -1000;

export interface HandBodiesFrame {
  /** The real card at the target slot, once it shows; null while it is still a stand-in. */
  focus: CardBody | null;
  /** 0 (following its slot) .. 1 (fully its own motion, at the front). */
  weight: number;
}

/**
 * The real cards in the hand (spec 2026-11-18): a few full card bodies that
 * take over the slots nearest the front, so the card that lands is the one
 * that flew in. The rest of the hand stays stand-ins.
 *
 * Per frame: `assign` before the rig moves (so the rig hides the right
 * stand-ins), then `pose` after it, with the focus card's own pose
 * (float, drag, open) already on the focus body.
 */
export function createHandBodies(opts: {
  rig: HandRig;
  bodies: CardBody[];
  /** A built face from the cache (counts as a use), or null. */
  faceFor: (card: CardTemplateId) => CardFace | null;
  /** Start building a card's face if it isn't (idempotent). */
  requestFace: (card: CardTemplateId) => void;
}) {
  const { rig, bodies } = opts;
  let current: Array<number | null> = bodies.map(() => null);
  /** Which body shows which slot (only bodies whose face is on). */
  const shownSlot = new Map<CardBody, number>();
  const slotPos = new THREE.Vector3();
  const slotQuat = new THREE.Quaternion();
  const slotScale = new THREE.Vector3();
  const ownQuat = new THREE.Quaternion();

  const park = (b: CardBody) => {
    // Beyond the far plane rather than hidden: hiding would drop its candle
    // light, and a changed light count recompiles every lit shader.
    b.outer.position.set(0, 0, PARKED_Z);
  };

  return {
    /** Which bodies stand in for which slots this frame; hides their stand-ins. */
    assign(): void {
      const slots = rig.slotCount();
      const next = assignBodies({
        pos: rig.position(),
        slots,
        bodies: bodies.length,
        current,
        cardOf: (slot) => rig.slotCard(slot),
      });
      // The target and its neighbours get their faces built ahead of time.
      const t = rig.targetSlot();
      for (const d of [0, 1, -1]) opts.requestFace(rig.slotCard((((t + d) % slots) + slots) % slots));

      next.forEach((slot, i) => {
        const b = bodies[i];
        if (slot !== current[i]) {
          shownSlot.delete(b);
          b.clearFace();
        }
        if (slot === null) return;
        const card = rig.slotCard(slot);
        const face = opts.faceFor(card);
        if (!face) {
          opts.requestFace(card);
          return;
        }
        if (b.face !== face) {
          b.setCard(card);
          b.setPhase(rig.slotFrame(slot).seed);
          b.applyFace(face);
        }
        shownSlot.set(b, slot);
      });
      current = next;
      rig.setBodied(new Set(shownSlot.values()));
    },

    /** The real card at the slot the hand is heading for, if it shows. */
    focusBody(): CardBody | null {
      const t = rig.targetSlot();
      for (const [b, slot] of shownSlot) if (slot === t) return b;
      return null;
    },

    /**
     * Pose every body on its slot (after rig.update). The focus body already
     * carries its own pose; it blends into it near the front.
     */
    pose(focus: CardBody | null): HandBodiesFrame {
      rig.group.updateMatrixWorld(true);
      let weight = 0;
      for (const b of bodies) {
        const slot = shownSlot.get(b);
        // Before the hand deals in, nothing of it shows.
        if (slot === undefined || !rig.group.visible) {
          park(b);
          continue;
        }
        const frame = rig.slotFrame(slot);
        frame.object.matrixWorld.decompose(slotPos, slotQuat, slotScale);
        if (b === focus) {
          const a = Math.min(1, Math.abs(frame.offset) / FOCUS_BLEND);
          weight = 1 - a * a * (3 - 2 * a);
          ownQuat.copy(b.outer.quaternion);
          b.outer.position.lerpVectors(slotPos, b.outer.position, weight);
          b.outer.quaternion.slerpQuaternions(slotQuat, ownQuat, weight);
          b.outer.scale.lerpVectors(slotScale, b.outer.scale, weight);
          b.shade(THREE.MathUtils.lerp(frame.light, 1, weight));
          b.shadowPlane.material.opacity = THREE.MathUtils.lerp(frame.shadow, b.shadowPlane.material.opacity, weight);
        } else {
          b.outer.position.copy(slotPos);
          b.outer.quaternion.copy(slotQuat);
          b.outer.scale.copy(slotScale);
          b.shade(frame.light);
          b.shadowPlane.material.opacity = frame.shadow;
        }
      }
      return { focus, weight };
    },

    /** Bodies showing a card this frame. */
    shown(): CardBody[] {
      return [...shownSlot.keys()];
    },

    /** Every slot near the front has its real card on. */
    settledIn(): boolean {
      return current.every((slot, i) => slot === null || shownSlot.get(bodies[i]) === slot);
    },
  };
}

export type HandBodies = ReturnType<typeof createHandBodies>;
