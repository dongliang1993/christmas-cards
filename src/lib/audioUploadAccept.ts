/** Audio formats a letter's song can be (the server accepts the same set). */
export const AUDIO_UPLOAD_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "webm", "flac"] as const;

/**
 * The file picker's `accept`. iOS Safari greys out every audio file in the
 * Files picker when given `audio/*` alone; listing the extensions makes them
 * selectable. `audio/*` stays for desktop pickers that filter by type.
 */
export const AUDIO_UPLOAD_ACCEPT = ["audio/*", ...AUDIO_UPLOAD_EXTENSIONS.map((e) => `.${e}`)].join(",");
