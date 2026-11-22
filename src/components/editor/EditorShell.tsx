"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { nanoid } from "nanoid";
import { BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, LayoutTemplate, Music, Redo2, Sticker, Type, Undo2, ZoomIn, ZoomOut, FileText } from "lucide-react";
import type { CardHandle } from "@/components/ChristmasCard3D";
import type { EditorAction, EditorState } from "@/lib/editor/editorState";
import { PAGES, pageLabel, stepZoom, ZOOM_MAX, ZOOM_MIN, type PageId } from "@/lib/editor/pages";
import type { TextSlot } from "@/lib/letter/model";
import { playSwipe } from "@/lib/sfx";
import type { CardTemplateId } from "@/lib/types";
import { CardEditor } from "./CardEditor";
import { ContextPanel, TOOL_LABELS, type Tool } from "./ContextPanel";

const TOOLS: { id: Tool; icon: typeof Sticker }[] = [
  { id: "style", icon: LayoutTemplate },
  { id: "paper", icon: FileText },
  { id: "stickers", icon: Sticker },
  { id: "text", icon: Type },
];

interface Props {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Where the editor opens. From the gallery it starts on the style picker. */
  initialTool?: Tool;
  /** Bumped by 下一步 when the greeting has no name yet: open it to write one. */
  askName?: number;
}

function IconButton(props: { label: string; onClick(): void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.active}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-30 ${props.active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
    >
      {props.children}
    </button>
  );
}

/**
 * 做卡 step (spec §13.2): tool rail · canvas with page nav · context panel,
 * with zoom / undo / redo / preview underneath. Preview keeps the same pages.
 */
export function EditorShell({ state, dispatch, initialTool = "stickers", askName = 0 }: Props) {
  const card = useRef<CardHandle | null>(null);
  const [tool, setTool] = useState<Tool>(initialTool);
  const [page, setPage] = useState<PageId>(initialTool === "style" ? "cover" : "inside");
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TextSlot | null>(null);
  const editSlot = (slot: TextSlot | null) => {
    setEditingSlot(slot);
    // Writing brings up the text tool, so its font buttons are at hand.
    if (slot) setTool("text");
  };
  // Phones: the panel is a bottom sheet that opens on a tool tap or a selection.
  const [sheet, setSheet] = useState(false);
  const sheetOpen = sheet || Boolean(state.selected);
  // Read after mount: the server render cannot know the screen width.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const pageIndex = PAGES.indexOf(page);

  // 下一步 without a name: open the greeting right on the card and say why.
  const [nameNudge, setNameNudge] = useState(false);
  useEffect(() => {
    if (askName === 0) return;
    setPage("inside");
    dispatch({ type: "select", uid: null });
    editSlot("greeting");
    setNameNudge(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askName]);
  useEffect(() => {
    if (editingSlot !== "greeting") setNameNudge(false);
  }, [editingSlot]);

  const goPage = (next: PageId) => {
    if (next === page) return;
    setPage(next);
    // A new page has its own things on it; start with none selected (spec P0-04).
    dispatch({ type: "select", uid: null });
  };
  const pickTool = (t: Tool) => {
    setSheet(tool === t ? !sheetOpen : true);
    setTool(t);
    dispatch({ type: "select", uid: null });
    // Style is about the cover; everything else is placed on the inside.
    goPage(t === "style" ? "cover" : "inside");
  };

  const addSticker = (id: string, drop?: { clientX: number; clientY: number }) => {
    goPage("inside");
    const at = drop ? card.current?.pick(drop.clientX, drop.clientY) : null;
    if (drop && !at) return; // dropped off the pages
    dispatch({ type: "add-sticker", stickerId: id, face: at?.face ?? state.focusFace, uid: nanoid(8), at: at ? { x: at.x, y: at.y } : undefined });
  };
  const changeTemplate = (id: CardTemplateId) => {
    if (id !== state.draft.templateId) playSwipe("switch");
    dispatch({ type: "set-template", templateId: id });
  };

  const TOOLS_WITH_MUSIC: { id: Tool | "music"; icon: typeof Sticker; label: string }[] = [
    ...TOOLS.map((t) => ({ id: t.id as Tool | "music", icon: t.icon, label: TOOL_LABELS[t.id] })),
    { id: "music", icon: Music, label: "音乐" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {!preview && (
          <nav
            aria-label="编辑工具"
            className="order-3 flex w-full shrink-0 flex-row justify-around gap-1 border-t border-stone-200/70 px-2 py-1.5 lg:order-none lg:w-16 lg:flex-col lg:items-center lg:justify-start lg:border-r lg:border-t-0 lg:px-0 lg:py-3"
          >
            {TOOLS_WITH_MUSIC.map(({ id, icon: Icon, label }) => {
              const active = tool === id && !state.selected && (sheetOpen || desktop);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickTool(id as Tool)}
                  aria-pressed={active}
                  className={`flex w-12 flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition ${active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              );
            })}
          </nav>
        )}

        <div className="relative order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-none">
          <div className="relative min-h-0 flex-1">
            {nameNudge && (
              <p role="status" className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-stone-900 px-3.5 py-1.5 text-xs text-white shadow-lg">
                在「Dear」后面写上 TA 的名字，寄件箱里靠它区分每一封
              </p>
            )}
            <CardEditor state={state} dispatch={dispatch} paper={state.draft.paper} page={page} zoom={zoom} preview={preview} locked={tool === "style"} onPage={goPage} card={card} editingSlot={editingSlot} onEditSlot={editSlot} />
          </div>
          <div className="flex shrink-0 items-center justify-center gap-3 pb-2 text-xs text-stone-500">
            <IconButton label="上一页" disabled={pageIndex === 0} onClick={() => goPage(PAGES[pageIndex - 1])}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <span className="min-w-20 text-center tabular-nums">{pageLabel(page)}</span>
            <IconButton label="下一页" disabled={pageIndex === PAGES.length - 1} onClick={() => goPage(PAGES[pageIndex + 1])}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={page === "inside" ? "合上贺卡" : "翻开贺卡"}
              onClick={() => goPage(page === "inside" ? "cover" : "inside")}
            >
              <BookOpen className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        {!preview && (
          <aside
            aria-label="上下文面板"
            className={`order-2 max-h-[40vh] w-full shrink-0 flex-col border-t border-stone-200/70 bg-white/95 lg:order-none lg:flex lg:max-h-none lg:w-72 lg:border-l lg:border-t-0 lg:bg-white/70 ${sheetOpen ? "flex" : "hidden"}`}
          >
            <ContextPanel
              tool={tool}
              state={state}
              dispatch={dispatch}
              editingSlot={editingSlot}
              onAddSticker={addSticker}
              onTemplate={changeTemplate}
              shapeOf={(uid) => card.current?.shapeOf(uid) ?? null}
            />
          </aside>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-1 border-t border-stone-200/70 px-3 py-1.5">
        {!preview && (
          <div className="hidden items-center gap-1 lg:flex">
            <IconButton label="缩小" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom(stepZoom(zoom, -1))}>
              <ZoomOut className="h-4 w-4" />
            </IconButton>
            <span className="w-12 text-center text-xs tabular-nums text-stone-600">{Math.round(zoom * 100)}%</span>
            <IconButton label="放大" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom(stepZoom(zoom, 1))}>
              <ZoomIn className="h-4 w-4" />
            </IconButton>
          </div>
        )}
        <span className="ml-auto" />
        {!preview && (
          <>
            <IconButton label="撤销" disabled={state.past.length === 0} onClick={() => dispatch({ type: "undo" })}>
              <Undo2 className="h-4 w-4" />
            </IconButton>
            <IconButton label="重做" disabled={state.future.length === 0} onClick={() => dispatch({ type: "redo" })}>
              <Redo2 className="h-4 w-4" />
            </IconButton>
          </>
        )}
        <IconButton
          label={preview ? "退出预览" : "预览"}
          active={preview}
          onClick={() => {
            dispatch({ type: "select", uid: null });
            setPreview(!preview);
          }}
        >
          {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </IconButton>
      </footer>
    </div>
  );
}
