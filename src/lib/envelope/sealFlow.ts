import type { EditorDraft } from "@/lib/editor/editorState";

/**
 * What a seal closes over (spec §4 step 8): the card, its paper, its music
 * and the envelope. The recipient's name is not in the envelope, so changing
 * it keeps the seal; anything else means sealing again.
 */
export function sealKey(draft: EditorDraft): string {
  return JSON.stringify({
    templateId: draft.templateId,
    paper: draft.paper,
    envelopeColor: draft.envelopeColor,
    audioUrl: draft.audioUrl ?? null,
    elements: draft.elements.map(({ uid: _uid, ...rest }) => rest),
  });
}

export function isSealValid(sealedKey: string | null, draft: EditorDraft): boolean {
  return sealedKey !== null && sealedKey === sealKey(draft);
}
