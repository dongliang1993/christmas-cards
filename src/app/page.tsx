"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Music,
  Pause,
  PenLine,
  Play,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { ChristmasCard3D } from "@/components/ChristmasCard3D";
import { TemplateThumb } from "@/components/TemplateThumb";
import {
  CARD_TEMPLATES,
  PRESET_MESSAGES,
  TEMPLATE_MAP,
} from "@/lib/templates";
import type {
  ApiResponse,
  CardTemplateId,
  ChristmasCardRecord,
} from "@/lib/types";

type ActivePanel = "none" | "message" | "music" | "share";

export default function CreateCardPage() {
  const [templateId, setTemplateId] = useState<CardTemplateId>("first-snow");
  const [message, setMessage] = useState<string>(
    TEMPLATE_MAP["first-snow"].defaultMessage,
  );
  const [signature, setSignature] = useState<string>("");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [flyInKey, setFlyInKey] = useState<number>(0);

  const [activePanel, setActivePanel] = useState<ActivePanel>("none");

  // Audio upload & preview state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Share state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const currentTemplate = TEMPLATE_MAP[templateId];

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSelectTemplate = (id: CardTemplateId) => {
    const prevDefault = TEMPLATE_MAP[templateId].defaultMessage;
    setTemplateId(id);
    if (message.trim() === "" || message === prevDefault) {
      setMessage(TEMPLATE_MAP[id].defaultMessage);
    }
    setFlyInKey((k) => k + 1);
  };

  const handleOpenPanel = (panel: ActivePanel) => {
    if (activePanel === panel) {
      setActivePanel("none");
      return;
    }
    if (panel === "message" && !isOpen) {
      setIsOpen(true);
    }
    setActivePanel(panel);
  };

  const toggleAudioPreview = async () => {
    if (!audioUrl) return;
    if (!audioRef.current || audioRef.current.src !== window.location.origin + audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(audioUrl);
      audio.loop = true;
      audioRef.current = audio;
    }

    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlayingAudio(true);
      } catch {
        setUploadError("浏览器阻止了音频播放，请重试");
      }
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as ApiResponse<{
        url: string;
        filename: string;
      }>;

      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error ?? "上传失败");
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsPlayingAudio(false);
      setAudioUrl(data.data.url);
      setAudioName(data.data.filename);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlayingAudio(false);
    setAudioUrl(null);
    setAudioName(null);
  };

  const handleCreateShareLink = async () => {
    setSaveError(null);
    setIsSaving(true);
    setShareUrl(null);
    setActivePanel("share");

    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          message: message.trim() || currentTemplate.defaultMessage,
          signature: signature.trim(),
          audioUrl,
          audioName,
        }),
      });
      const json = (await res.json()) as ApiResponse<ChristmasCardRecord>;

      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "生成分享链接失败");
      }

      const url = `${window.location.origin}/card/${json.data.id}`;
      setShareUrl(url);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "生成失败，请重试");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  // #9 Keyboard accessibility: O toggles the card, Space pauses float animation.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setIsOpen((v) => !v);
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPaused((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#fbfaf9] select-none">
      {/* Top-left minimal brand & card label */}
      <header className="pointer-events-none fixed top-5 left-6 z-20 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-stone-900">
            Christmas Cards
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
            3D Studio
          </span>
        </div>
        <p className="text-xs text-stone-400">
          {currentTemplate.name} · {currentTemplate.subtitle}
        </p>
      </header>

      {/* Top-right subtle hint */}
      <div className="pointer-events-none fixed top-5 right-6 z-20 hidden sm:flex items-center gap-2 text-xs text-stone-400">
        <span>拖拽旋转卡片 · 点击翻开</span>
      </div>

      {/* 3D Canvas */}
      <div className="h-full w-full">
        <ChristmasCard3D
          templateId={templateId}
          message={message}
          signature={signature}
          isOpen={isOpen}
          isPaused={isPaused}
          flyInKey={flyInKey}
          onToggleOpen={() => setIsOpen((v) => !v)}
        />
      </div>

      {/* Floating Editor Panel (Message / Music / Share) */}
      {activePanel !== "none" && (
        <aside className="fixed bottom-24 left-1/2 z-30 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-stone-200/80 bg-white/95 p-5 shadow-2xl backdrop-blur-xl sm:bottom-auto sm:top-20 sm:right-6 sm:left-auto sm:translate-x-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900">
              {activePanel === "message" && "写下你的圣诞祝福"}
              {activePanel === "music" && "上传一首圣诞背景音乐"}
              {activePanel === "share" && "分享你的专属圣诞卡片"}
            </h2>
            <button
              type="button"
              onClick={() => setActivePanel("none")}
              className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="关闭面板"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {activePanel === "message" && (
            <div className="space-y-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-500">
                  卡片内页祝福语（实时呈现在卡片右侧）
                </label>
                <textarea
                  rows={4}
                  maxLength={600}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="写下你想对 TA 说的话..."
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50/70 px-3.5 py-2.5 text-sm text-stone-800 outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-500">
                  落款（选填）
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="例如：你的老朋友 / Alex"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50/70 px-3.5 py-2 text-sm text-stone-800 outline-none transition focus:border-stone-400 focus:bg-white"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-stone-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>灵感文案</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_MESSAGES.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setMessage(preset)}
                      className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs text-stone-600 transition hover:border-stone-300 hover:bg-stone-50"
                    >
                      文案 {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activePanel === "music" && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />

              {!audioUrl ? (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50/60 px-4 py-8 text-center transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-60"
                >
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
                  ) : (
                    <Upload className="h-6 w-6 text-stone-400" />
                  )}
                  <span className="text-sm font-medium text-stone-700">
                    {isUploading ? "正在上传音频..." : "点击选择本地音乐文件"}
                  </span>
                  <span className="text-xs text-stone-400">
                    支持 MP3、WAV、M4A、OGG（15MB 以内）
                  </span>
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-white">
                      <Music className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-800">
                        {audioName ?? "已上传背景音乐"}
                      </p>
                      <p className="text-xs text-stone-400">
                        对方打开卡片时将伴随播放
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleAudioPreview}
                      className="rounded-lg p-2 text-stone-600 hover:bg-stone-200/70"
                      title={isPlayingAudio ? "暂停试听" : "试听音乐"}
                    >
                      {isPlayingAudio ? (
                        <Volume2 className="h-4 w-4" />
                      ) : (
                        <VolumeX className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveAudio}
                      className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                      title="移除音乐"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {uploadError && (
                <p className="text-xs text-red-600">{uploadError}</p>
              )}
            </div>
          )}

          {activePanel === "share" && (
            <div className="space-y-4">
              {isSaving && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在生成你的专属卡片链接...</span>
                </div>
              )}

              {saveError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                  {saveError}
                </p>
              )}

              {shareUrl && !isSaving && (
                <>
                  <p className="text-xs text-stone-500">
                    链接已生成！对方点开后将加载卡片和音乐，随后卡片从远处飞入呈现：
                  </p>
                  <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="min-w-0 flex-1 bg-transparent px-2 text-xs text-stone-700 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyShareUrl}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>复制</span>
                        </>
                      )}
                    </button>
                  </div>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 py-2.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>在新标签页预览收卡效果</span>
                  </a>
                </>
              )}
            </div>
          )}
        </aside>
      )}

      {/* Bottom Floating Dock (bubbbly-inspired) */}
      <nav
        aria-label="卡片编辑控制栏"
        className="fixed bottom-5 left-1/2 z-30 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-stone-200/80 bg-white/90 px-2.5 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.08)] backdrop-blur-xl"
      >
        {/* Template Thumbnails */}
        <div className="flex items-center gap-1.5 pr-1">
          {CARD_TEMPLATES.map((tpl) => {
            const active = tpl.id === templateId;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tpl.id)}
                title={tpl.name}
                className={`relative rounded-lg p-1 transition ${
                  active
                    ? "bg-stone-900/5 ring-2 ring-stone-900"
                    : "opacity-65 hover:opacity-100"
                }`}
              >
                <TemplateThumb templateId={tpl.id} />
              </button>
            );
          })}
        </div>

        <div className="h-7 w-px bg-stone-200/80" />

        {/* Open / Close Card */}
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          title={isOpen ? "合上卡片" : "打开卡片"}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
            isOpen
              ? "bg-stone-900 text-white"
              : "text-stone-700 hover:bg-stone-100"
          }`}
        >
          <BookOpen className="h-4 w-4" />
        </button>

        {/* Pause / Play Float */}
        <button
          type="button"
          onClick={() => setIsPaused((v) => !v)}
          title={isPaused ? "恢复悬浮动画" : "暂停悬浮动画"}
          className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl text-stone-700 transition hover:bg-stone-100"
        >
          {isPaused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </button>

        <div className="h-7 w-px bg-stone-200/80" />

        {/* Edit Message */}
        <button
          type="button"
          onClick={() => handleOpenPanel("message")}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition ${
            activePanel === "message"
              ? "bg-stone-900 text-white"
              : "text-stone-700 hover:bg-stone-100"
          }`}
        >
          <PenLine className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">写文字</span>
        </button>

        {/* Upload Music */}
        <button
          type="button"
          onClick={() => handleOpenPanel("music")}
          className={`relative flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition ${
            activePanel === "music"
              ? "bg-stone-900 text-white"
              : "text-stone-700 hover:bg-stone-100"
          }`}
        >
          <Music className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {audioUrl ? "已配乐" : "传歌曲"}
          </span>
          {audioUrl && activePanel !== "music" && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </button>

        {/* Share Card */}
        <button
          type="button"
          onClick={handleCreateShareLink}
          disabled={isSaving}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 text-xs font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          <span>分享</span>
        </button>
      </nav>
    </main>
  );
}
