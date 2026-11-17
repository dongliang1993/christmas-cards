import type { Metadata } from "next";
import { LetterViewer } from "@/components/letter/LetterViewer";

// Generic on purpose: the page must not reveal anything before delivery.
export const metadata: Metadata = {
  title: "你有一封圣诞信",
  description: "一封亲手做的圣诞信，正在寄给你。",
  robots: { index: false, follow: false },
};

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LetterViewer id={id} />;
}
