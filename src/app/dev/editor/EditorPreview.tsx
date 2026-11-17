"use client";

import { useReducer } from "react";
import { CardEditor } from "@/components/editor/CardEditor";
import { createEditorState, createInitialDraft, editorReducer } from "@/lib/editor/editorState";

export function EditorPreview() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(createInitialDraft("first-snow")));
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbfaf9]">
      <CardEditor state={state} dispatch={dispatch} />
    </main>
  );
}
