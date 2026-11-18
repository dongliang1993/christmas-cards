import type { Metadata } from "next";
import { Caveat, Inter, Long_Cang } from "next/font/google";
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

// Chinese handwriting for text on the card (font "hand-zh"). Self-hosted by
// next/font at build time, so it loads where Google Fonts is blocked.
const handZh = Long_Cang({
  weight: "400",
  preload: false,
  variable: "--font-hand-zh",
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
    <html lang="zh-CN" className={`${inter.variable} ${caveat.variable} ${handZh.variable}`}>
      <body className="font-sans antialiased bg-[#fbfaf9] text-stone-900">
        {/* Loading veil: first thing in the body so it paints before any JS.
            Pure CSS/SVG (no Three.js, no big images) so it can never fail to
            load. window.hideChristmasLoading() fades it out (480ms) once the
            homepage's 3D scene has rendered its first frame. */}
        <div
          id="site-loading"
          className="site-loading"
          role="status"
          aria-live="polite"
          aria-label="圣诞贺卡加载中"
        >
          <div className="loading-inner">
            {/* eslint-disable-next-line @next/next/no-img-element -- in the veil, must not wait on hydration */}
            <img
              className="loading-card"
              src="/assets/brand/loading.svg"
              alt=""
              width={320}
              height={240}
              fetchPriority="high"
            />
            <h1 className="loading-brand">Christmas Cards</h1>
            <p className="loading-message">A little Christmas magic is on its way...</p>
            <div className="loading-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
