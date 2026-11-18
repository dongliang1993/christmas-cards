"use client";

import { useReducer } from "react";
import { EditorShell } from "@/components/editor/EditorShell";
import { createEditorState, createInitialDraft, editorReducer } from "@/lib/editor/editorState";

export function EditorPreview() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(createInitialDraft("winter-moonlight")));
  return (
    <main className="h-dvh w-screen overflow-hidden bg-[#fbfaf9]">
      <EditorShell state={state} dispatch={dispatch} />
    </main>
  );
}
