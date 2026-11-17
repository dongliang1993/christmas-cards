"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Music,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ChristmasCard3D } from "@/components/ChristmasCard3D";
import { TEMPLATE_MAP } from "@/lib/templates";
import type { ChristmasCardRecord } from "@/lib/types";

interface ShareCardViewerProps {
  card: ChristmasCardRecord;
}

export function ShareCardViewer({ card }: ShareCardViewerProps) {
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [loadProgress, setLoadProgress] = useState<number>(18);
  const [sceneReady, setSceneReady] = useState<boolean>(false);
  const [audioReady, setAudioReady] = useState<boolean>(!card.audioUrl);
  const [flyInKey, setFlyInKey] = useState<number>(0);

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const template = TEMPLATE_MAP[card.templateId];

  // Preload audio asset if present
  useEffect(() => {
    if (!card.audioUrl) {
      setAudioReady(true);
      return;
    }

    let cancelled = false;
    const audio = new Audio();
    audio.src = card.audioUrl;
    audio.loop = true;
    audio.preload = "auto";
    audioRef.current = audio;

    const markReady = () => {
      if (!cancelled) {
        setAudioReady(true);
      }
    };

    audio.addEventListener("canplaythrough", markReady, { once: true });
    audio.addEventListener("loadeddata", markReady, { once: true });
    audio.addEventListener("error", markReady, { once: true });

    // Safety fallback so a slow network never traps the user on loading screen
    const fallbackTimer = setTimeout(markReady, 3500);

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      audio.removeEventListener("canplaythrough", markReady);
      audio.removeEventListener("loadeddata", markReady);
      audio.removeEventListener("error", markReady);
      audio.pause();
      audioRef.current = null;
    };
  }, [card.audioUrl]);

  // Smooth loading progress bar until both 3D scene & audio are ready
  useEffect(() => {
    const timer = setInterval(() => {
      setLoadProgress((prev) => {
        if (sceneReady && audioReady) {
          return 100;
        }
        return Math.min(92, prev + 8);
      });
    }, 80);

    return () => clearInterval(timer);
  }, [sceneReady, audioReady]);

  const tryPlayMusic = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setIsMusicPlaying(true);
      setNeedsAudioUnlock(false);
    } catch {
      setNeedsAudioUnlock(true);
    }
  }, []);

  // Trigger fly-in once loaded
  useEffect(() => {
    if (sceneReady && audioReady && loadProgress >= 100 && !isLoaded) {
      const t = setTimeout(() => {
        setIsLoaded(true);
        setFlyInKey((k) => k + 1);
        if (card.audioUrl) {
          void tryPlayMusic();
        }
      }, 180);
      return () => clearTimeout(t);
    }
  }, [sceneReady, audioReady, loadProgress, isLoaded, card.audioUrl, tryPlayMusic]);

  const toggleMusic = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMusicPlaying) {
      audio.pause();
      setIsMusicPlaying(false);
    } else {
      await tryPlayMusic();
    }
  };

  const handleToggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && card.audioUrl && !isMusicPlaying) {
        void tryPlayMusic();
      }
      return next;
    });
  };

  // #9 Keyboard accessibility: O toggles, Space pauses, matching bubbbly.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        handleToggleOpen();
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPaused((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.audioUrl, isMusicPlaying]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbfaf9] select-none">
      {/* Loading Curtain */}
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white transition-opacity duration-700 ${
          isLoaded
            ? "pointer-events-none opacity-0"
            : "pointer-events-auto opacity-100"
        }`}
      >
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <div className="h-10 w-10 rounded-2xl border border-stone-200 bg-stone-50 flex items-center justify-center shadow-xs">
            <span className="text-lg">🎄</span>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-stone-800">
              正在拆开一封圣诞来信...
            </p>
            <p className="text-xs text-stone-400">
              {card.audioUrl ? "正在加载 3D 卡片与背景音乐" : "正在加载 3D 卡片资源"}
            </p>
          </div>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-stone-900 transition-all duration-200"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Top-left card info */}
      <header className="pointer-events-none fixed top-5 left-6 z-20 flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold tracking-tight text-stone-900">
          Christmas Card
        </span>
        <p className="text-xs text-stone-400">
          {template.name}
          {card.signature ? ` · From ${card.signature}` : ""}
        </p>
      </header>

      {/* Top-right action: create your own */}
      <div className="fixed top-5 right-6 z-20 flex items-center gap-2">
        {card.audioUrl && needsAudioUnlock && (
          <button
            type="button"
            onClick={toggleMusic}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-xs backdrop-blur-md transition hover:bg-stone-50"
          >
            <Music className="h-3.5 w-3.5 text-emerald-600" />
            <span>点击播放音乐</span>
          </button>
        )}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/90 px-3.5 py-1.5 text-xs font-medium text-stone-700 shadow-xs backdrop-blur-md transition hover:bg-stone-50"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>我也制作一张</span>
        </Link>
      </div>

      {/* 3D Card Canvas */}
      <div className="h-full w-full">
        <ChristmasCard3D
          templateId={card.templateId}
          message={card.message}
          signature={card.signature}
          isOpen={isOpen}
          isPaused={isPaused}
          flyInKey={flyInKey}
          onToggleOpen={handleToggleOpen}
          onReady={() => setSceneReady(true)}
        />
      </div>

      {/* Bottom Floating Dock */}
      <nav
        aria-label="卡片控制栏"
        className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-stone-200/80 bg-white/90 px-3 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={handleToggleOpen}
          className={`flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium transition ${
            isOpen
              ? "bg-stone-900 text-white"
              : "bg-stone-100 text-stone-800 hover:bg-stone-200/80"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>{isOpen ? "合上卡片" : "打开卡片"}</span>
        </button>

        <button
          type="button"
          onClick={() => setIsPaused((v) => !v)}
          title={isPaused ? "恢复悬浮动画" : "暂停悬浮动画"}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-700 transition hover:bg-stone-100"
        >
          {isPaused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </button>

        {card.audioUrl && (
          <>
            <div className="h-6 w-px bg-stone-200/80" />
            <button
              type="button"
              onClick={toggleMusic}
              title={isMusicPlaying ? "暂停音乐" : "播放音乐"}
              className="flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
            >
              {isMusicPlaying ? (
                <Volume2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <VolumeX className="h-4 w-4 text-stone-400" />
              )}
              <span className="max-w-[110px] truncate hidden sm:inline">
                {card.audioName ?? "圣诞配乐"}
              </span>
            </button>
          </>
        )}
      </nav>
    </main>
  );
}
