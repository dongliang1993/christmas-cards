import type { Metadata } from "next";
import { Caveat, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: "Christmas Cards — 制作与分享你的圣诞贺卡",
  description:
    "挑选圣诞插画卡片、写下专属祝福、上传一首歌，生成链接分享给重要的人。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${caveat.variable}`}>
      <body className="font-sans antialiased bg-[#fbfaf9] text-stone-900">
        {children}
      </body>
    </html>
  );
}
