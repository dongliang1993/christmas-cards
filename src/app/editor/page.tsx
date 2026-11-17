import type { Metadata } from "next";
import { SenderFlow } from "@/components/flow/SenderFlow";
import { templateFromParam } from "@/lib/editor/editorLinks";

export const metadata: Metadata = { title: "制作贺卡 · 圣诞信" };

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template } = await searchParams;
  const templateId = templateFromParam(template);
  // Keyed by template so choosing another card in the gallery starts afresh.
  return <SenderFlow key={templateId} initialTemplate={templateId} />;
}
