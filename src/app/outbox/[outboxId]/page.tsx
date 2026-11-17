import type { Metadata } from "next";
import { OutboxView } from "@/components/flow/OutboxView";

export const metadata: Metadata = {
  title: "寄件箱",
  robots: { index: false, follow: false },
};

export default async function OutboxPage({ params }: { params: Promise<{ outboxId: string }> }) {
  const { outboxId } = await params;
  return <OutboxView outboxId={outboxId} />;
}
