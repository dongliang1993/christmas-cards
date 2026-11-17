"use client";

import { useRef, useState, type Dispatch } from "react";
import { nanoid } from "nanoid";
import { PenLine, Sticker, Undo2 } from "lucide-react";
import { ChristmasCard3D, type CardHandle, type CardPick } from "@/components/ChristmasCard3D";
import type { EditorAction, EditorElement, EditorState } from "@/lib/editor/editorState";
import { pinchTransform, type Point } from "@/lib/editor/gestures";
import type { Face } from "@/lib/letter/model";
import { SelectionOverlay } from "./SelectionOverlay";
import { StickerTray } from "./StickerTray";
import { TextComposer } from "./TextComposer";

interface Props {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const NEW_TEXT = "写点什么";

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

/**
 * The card itself is the canvas (spec §4.3): drag stickers from the tray
 * onto a page, tap a page to write, drag / pinch / handle to arrange.
 */
export function CardEditor({ state, dispatch }: Props) {
  const card = useRef<CardHandle | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const [panel, setPanel] = useState<"stickers" | "none">("stickers");
  const [writing, setWriting] = useState(false);
  const [lastFace, setLastFace] = useState<Face>("inside-left");
  const [freshText, setFreshText] = useState<string | null>(null);

  const selected = state.draft.elements.find((e) => e.uid === state.selected) ?? null;
  const byUid = (uid: string): EditorElement | undefined => state.draft.elements.find((e) => e.uid === uid);

  const move = (uid: string, patch: Partial<Pick<EditorElement, "x" | "y" | "scale" | "rotation">>, record: boolean) =>
    dispatch({ type: "transform", uid, patch, record });

  const onPointerDown = (e: React.PointerEvent) => {
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
    if (pick) setLastFace(pick.face);
    if (writing && pick && !pick.uid) {
      const uid = nanoid(8);
      dispatch({ type: "add-text", face: pick.face, uid, x: pick.x, y: pick.y, text: NEW_TEXT, font: "hand-zh", ink: "black" });
      setWriting(false);
      setFreshText(uid);
      return;
    }
    if (pick?.uid) {
      const el = byUid(pick.uid);
      dispatch({ type: "select", uid: pick.uid });
      if (el) gesture.current = { kind: "drag", uid: el.uid, face: el.face, start: pick, from: { x: el.x, y: el.y }, recorded: false };
    } else {
      dispatch({ type: "select", uid: null });
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
    if (pointers.current.size === 0) gesture.current = null;
    else if (gesture.current?.kind === "pinch") gesture.current = null; // lift one finger: stop, don't jump
  };

  const addSticker = (stickerId: string, face: Face, at?: { x: number; y: number }) =>
    dispatch({ type: "add-sticker", stickerId, face, uid: nanoid(8), at });

  return (
    <div className="flex h-full w-full flex-col lg:flex-row">
      <div
        className="relative min-h-0 flex-1 touch-none select-none"
        // Keep focus where it is (e.g. a text field that just opened).
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: writing ? "text" : "default" }}
      >
        <ChristmasCard3D
          templateId={state.draft.templateId}
          message=""
          signature=""
          isOpen
          isPaused={false}
          elements={state.draft.elements}
          interactive={false}
          handleRef={card}
        />
        {selected && (
          <SelectionOverlay
            card={card}
            uid={selected.uid}
            current={{ scale: selected.scale, rotation: selected.rotation }}
            onTransform={(patch, record) => move(selected.uid, patch, record)}
            onDelete={() => dispatch({ type: "remove", uid: selected.uid })}
          />
        )}

        {writing && (
          <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-stone-900/85 px-3 py-1.5 text-xs text-white">
            点一下纸面，在那里写字
          </p>
        )}
      </div>

      {/* Beside the card on desktop, under it on phones: never over the pages. */}
      <aside className="z-20 flex shrink-0 flex-col border-t border-stone-200/80 bg-white/95 lg:w-80 lg:border-l lg:border-t-0">
        {selected?.kind === "text" ? (
          <TextComposer
            text={selected.text}
            font={selected.font}
            ink={selected.ink}
            autoFocus={freshText === selected.uid}
            onChange={(patch) => dispatch({ type: "update-text", uid: selected.uid, patch })}
            onDelete={() => dispatch({ type: "remove", uid: selected.uid })}
          />
        ) : panel === "stickers" ? (
          <StickerTray
            onTap={(id) => addSticker(id, lastFace)}
            onDrop={(id, x, y) => {
              const at = card.current?.pick(x, y);
              if (at) addSticker(id, at.face, { x: at.x, y: at.y });
            }}
          />
        ) : null}
        <div className="mt-auto flex items-center gap-1 border-t border-stone-100 px-2 py-1.5">
          <ToolButton active={panel === "stickers" && !selected} onClick={() => { dispatch({ type: "select", uid: null }); setPanel(panel === "stickers" ? "none" : "stickers"); }} icon={<Sticker className="h-4 w-4" />} label="贴纸" />
          <ToolButton active={writing} onClick={() => { dispatch({ type: "select", uid: null }); setWriting(!writing); }} icon={<PenLine className="h-4 w-4" />} label="写字" />
          <span className="ml-auto text-[11px] text-stone-400">{lastFace === "inside-left" ? "左页" : "右页"}</span>
          <ToolButton active={false} disabled={state.past.length === 0} onClick={() => dispatch({ type: "undo" })} icon={<Undo2 className="h-4 w-4" />} label="撤销" />
        </div>
      </aside>
    </div>
  );
}

function ToolButton(props: { active: boolean; disabled?: boolean; onClick(): void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.active}
      className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition disabled:opacity-35 ${props.active ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"}`}
    >
      {props.icon}
      {props.label}
    </button>
  );
}
