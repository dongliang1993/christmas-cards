"use client";

import { useRef, useState } from "react";
import { Music, Pause, Play, X } from "lucide-react";
import { AUDIO_UPLOAD_ACCEPT } from "@/lib/audioUploadAccept";

interface MusicUploadProps {
  audioName: string | null;
  audioUrl: string | null;
  onChange(audio: { url: string; name: string } | null): void;
}

/** Attach one song to the letter, then play, swap or remove it. */
export function MusicUpload({ audioName, audioUrl, onChange }: MusicUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const stop = () => {
    audio.current?.pause();
    setPlaying(false);
  };

  const upload = async (file: File) => {
    stop();
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "上传失败");
      onChange({ url: body.data.url, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const toggle = () => {
    if (!audioUrl) return;
    if (!audio.current) {
      audio.current = new Audio(audioUrl);
      audio.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      audio.current.play().then(() => setPlaying(true)).catch(() => setError("播放失败，再试一次"));
    }
  };

  const picker = (label: string) => (
    <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-stone-200 px-3 py-2.5 text-[11px] text-stone-500 hover:border-stone-300 hover:bg-stone-50">
      {uploading ? "上传中…" : label}
      <input
        type="file"
        accept={AUDIO_UPLOAD_ACCEPT}
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </label>
  );

  if (audioName && audioUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs">
          <button type="button" aria-label={playing ? "暂停" : "试听"} onClick={toggle} className="text-stone-700 hover:text-stone-900">
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <Music className="h-3.5 w-3.5 shrink-0 text-stone-400" />
          <span className="min-w-0 flex-1 truncate">{audioName}</span>
          <button
            type="button"
            aria-label="移除歌曲"
            onClick={() => {
              stop();
              onChange(null);
            }}
            className="text-stone-400 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {picker("更换音频")}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-stone-400">MP3、WAV、M4A 等，15MB 以内。朋友打开信后可以播放。</p>
      {picker("选择一个音频文件")}
      {error && (
        <p className="text-[11px] text-red-600">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            知道了
          </button>
        </p>
      )}
    </div>
  );
}
