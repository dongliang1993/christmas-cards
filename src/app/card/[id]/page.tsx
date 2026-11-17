import Link from "next/link";
import { ShareCardViewer } from "@/components/ShareCardViewer";
import { getCardById } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function SharedCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getCardById(id);

  if (!card) {
    return (
      <main className="flex h-dvh w-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <span className="text-3xl">❄️</span>
        <h1 className="text-lg font-semibold text-stone-900">
          没有找到这张圣诞卡片
        </h1>
        <p className="text-sm text-stone-500">
          卡片链接可能已失效或输入有误。
        </p>
        <Link
          href="/"
          className="mt-2 rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-medium text-white transition hover:bg-stone-800"
        >
          去制作一张新卡片
        </Link>
      </main>
    );
  }

  return <ShareCardViewer card={card} />;
}
