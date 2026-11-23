import { describe, expect, it } from "vitest";
import { sniffAudioExtension } from "./audioFormat";

const bytes = (...parts: Array<string | number[]>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("sniffAudioExtension", () => {
  it("knows an mp3 by its ID3 tag, whatever the file is called", () => {
    expect(sniffAudioExtension(bytes("ID3", [4, 0, 0, 0, 0, 0]))).toBe("mp3");
  });

  it("knows a bare mp3 frame", () => {
    expect(sniffAudioExtension(bytes([0xff, 0xfb, 0x90, 0x64]))).toBe("mp3");
  });

  it("tells a raw AAC (ADTS) stream from an mp3 frame", () => {
    expect(sniffAudioExtension(bytes([0xff, 0xf1, 0x50, 0x80]))).toBe("aac");
  });

  it("knows an m4a by its ftyp box", () => {
    expect(sniffAudioExtension(bytes([0, 0, 0, 0x20], "ftypM4A "))).toBe("m4a");
  });

  it("knows wav, ogg, flac and webm", () => {
    expect(sniffAudioExtension(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("wav");
    expect(sniffAudioExtension(bytes("OggS", [0, 2]))).toBe("ogg");
    expect(sniffAudioExtension(bytes("fLaC", [0]))).toBe("flac");
    expect(sniffAudioExtension(bytes([0x1a, 0x45, 0xdf, 0xa3]))).toBe("webm");
  });

  it("returns null for something it does not recognise", () => {
    expect(sniffAudioExtension(bytes("hello world"))).toBeNull();
    expect(sniffAudioExtension(new Uint8Array(0))).toBeNull();
  });
});
