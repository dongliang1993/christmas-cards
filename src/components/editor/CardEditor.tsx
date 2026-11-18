"use client";

import { useEffect, useRef, useState, type Dispatch, type RefObject } from "react";
import { ChristmasCard3D, type CardHandle, type CardPick } from "@/components/ChristmasCard3D";
import type { EditorAction, EditorElement, EditorState } from "@/lib/editor/editorState";
import { pinchTransform, type Point } from "@/lib/editor/gestures";
import type { PageId } from "@/lib/editor/pages";
import type { Face, PaperStock } from "@/lib/letter/model";
import { SelectionOverlay } from "./SelectionOverlay";

interface Props {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  paper?: PaperStock;
  page: PageId;
  zoom: number;
  /** Preview: the card exactly as the recipient sees it, no editing. */
  preview: boolean;
  /** The style picker shows the cover only: a tap must not open the card. */
  locked?: boolean;
  onPage(page: PageId): void;
  card: RefObject<CardHandle | null>;
}

/**
 * The editor's 100%: the gallery framing leaves room for a floating dock;
 * here the canvas has its own space, so the card can fill more of it.
 */
const EDITOR_FIT = 1.3;

/** Only on desktop: a phone's open card is already width-limited. */
function editorFit(): number {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? EDITOR_FIT : 1;
}

type Gesture =
  | { kind: "drag"; uid: string; face: Face; start: CardPick; from: { x: number; y: number }; recorded: boolean }
  | {
      kind: "pinch";
      uid: string;
      face: Face;
      start: { a: Point; b: Point };
      startMid: CardPick | null;
      from: { x: number; y: number; scale: number; rotation: number };
      recorded: boolean;
    };

/** Outline of the inside page new things land on (spec §13.4). */
function FocusOutline({ card, face }: { card: RefObject<CardHandle | null>; face: Face }) {
  const [pts, setPts] = useState<Point[] | null>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setPts(card.current?.projectFace(face) ?? null);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [card, face]);
  if (!pts) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <polygon
        points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke="#a8a29e"
        strokeOpacity={0.7}
        strokeWidth={1}
        strokeDasharray="5 4"
      />
    </svg>
  );
}

/**
 * The card is the canvas (spec §4.3, §13): pick, drag, pinch and handles act
 * on the 3D pages directly. Tapping an element on either page edits it.
 */
export function CardEditor({ state, dispatch, paper, page, zoom, preview, locked = false, onPage, card }: Props) {
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const editing = page === "inside" && !preview;
  const selected = editing ? (state.draft.elements.find((e) => e.uid === state.selected) ?? null) : null;
  const byUid = (uid: string): EditorElement | undefined => state.draft.elements.find((e) => e.uid === uid);
  const move = (uid: string, patch: Partial<Pick<EditorElement, "x" | "y" | "scale" | "rotation">>, record: boolean) =>
    dispatch({ type: "transform", uid, patch, record });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing) {
      // On the cover a tap opens the card to the inside pages — unless the
      // style picker is up, where the cover must stay closed.
      if (page === "cover" && !preview && !locked) onPage("inside");
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const el = byUid(gesture.current.uid);
      if (!el) return;
      gesture.current = {
        kind: "pinch",
        uid: el.uid,
        face: el.face,
        start: { a, b },
        startMid: card.current?.pick((a.x + b.x) / 2, (a.y + b.y) / 2) ?? null,
        from: { x: el.x, y: el.y, scale: el.scale, rotation: el.rotation },
        recorded: false,
      };
      return;
    }
    if (pointers.current.size > 1) return;

    const pick = card.current?.pick(e.clientX, e.clientY) ?? null;
    if (pick?.uid) {
      const el = byUid(pick.uid);
      dispatch({ type: "select", uid: pick.uid });
      if (el) gesture.current = { kind: "drag", uid: el.uid, face: el.face, start: pick, from: { x: el.x, y: el.y }, recorded: false };
    } else {
      dispatch({ type: "select", uid: null });
      if (pick) dispatch({ type: "focus-face", face: pick.face });
      gesture.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "drag") {
      const at = card.current?.pick(e.clientX, e.clientY);
      if (!at || at.face !== g.face) return;
      move(g.uid, { x: g.from.x + at.x - g.start.x, y: g.from.y + at.y - g.start.y }, !g.recorded);
      g.recorded = true;
      return;
    }
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    const t = pinchTransform(g.start, { a, b });
    const mid = card.current?.pick((a.x + b.x) / 2, (a.y + b.y) / 2);
    const shift = mid && g.startMid && mid.face === g.face ? { x: mid.x - g.startMid.x, y: mid.y - g.startMid.y } : { x: 0, y: 0 };
    move(
      g.uid,
      { scale: g.from.scale * t.scale, rotation: g.from.rotation + t.rotation, x: g.from.x + shift.x, y: g.from.y + shift.y },
      !g.recorded,
    );
    g.recorded = true;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0 || gesture.current?.kind === "pinch") gesture.current = null;
  };

  return (
    <div
      className="relative h-full w-full touch-none select-none"
      // Keep focus where it is (e.g. a text field in the side panel).
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: page === "cover" && !preview && !locked ? "pointer" : "default" }}
    >
      <ChristmasCard3D
        templateId={state.draft.templateId}
        message=""
        signature=""
        isOpen={page === "inside"}
        isPaused={false}
        elements={state.draft.elements}
        paper={paper}
        zoom={zoom * editorFit()}
        interactive={false}
        handleRef={card}
      />
      {editing && <FocusOutline card={card} face={state.focusFace} />}
      {selected && (
        <SelectionOverlay
          card={card}
          uid={selected.uid}
          current={{ scale: selected.scale, rotation: selected.rotation }}
          onTransform={(patch, record) => move(selected.uid, patch, record)}
          onDelete={() => dispatch({ type: "remove", uid: selected.uid })}
        />
      )}
    </div>
  );
}
