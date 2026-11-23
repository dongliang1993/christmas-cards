/** How many leading bytes `sniffAudioExtension` needs to look at. */
export const SNIFF_BYTES = 12;

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  return [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));
}

/**
 * The real format of an audio file from its first bytes, as the extension we
 * store it under. People rename files ("song.mp3" -> "song.m4a") expecting
 * that to convert them; storing by content keeps the served type honest.
 * Null when the bytes match nothing we know: the caller keeps the extension.
 */
export function sniffAudioExtension(bytes: Uint8Array): string | null {
  if (ascii(bytes, 0, "ID3")) return "mp3";
  if (ascii(bytes, 4, "ftyp")) return "m4a";
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE")) return "wav";
  if (ascii(bytes, 0, "OggS")) return "ogg";
  if (ascii(bytes, 0, "fLaC")) return "flac";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  // MPEG audio frame sync: 11 set bits. Layer bits 00 mean ADTS (raw AAC).
  if (bytes[0] === 0xff && bytes.length > 1 && (bytes[1] & 0xe0) === 0xe0) {
    return (bytes[1] & 0x06) === 0 ? "aac" : "mp3";
  }
  return null;
}
